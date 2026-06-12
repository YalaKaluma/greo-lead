import pytest
import os
import subprocess
import sys
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from app.security_middleware import RateLimitMiddleware, RateLimitRule, SecurityHeadersMiddleware


class EmptyQuery:
    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return None


class EmptyDb:
    def query(self, *args, **kwargs):
        return EmptyQuery()


def test_security_headers_are_present_on_basic_api_response():
    app = FastAPI()
    app.add_middleware(SecurityHeadersMiddleware)

    @app.get("/api/ping")
    def ping():
        return {"ok": True}

    response = TestClient(app).get("/api/ping")

    assert response.status_code == 200
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
    assert response.headers["Permissions-Policy"] == "camera=(), microphone=(), geolocation=()"
    assert "default-src 'self'" in response.headers["Content-Security-Policy"]


def test_rate_limited_endpoint_returns_429_after_excessive_requests():
    app = FastAPI()
    app.add_middleware(
        RateLimitMiddleware,
        auth_limit=RateLimitRule(2, 60),
        ai_limit=RateLimitRule(2, 60),
        general_limit=RateLimitRule(2, 60),
    )

    @app.post("/api/auth/login")
    def login():
        return {"success": False}

    client = TestClient(app)

    assert client.post("/api/auth/login").status_code == 200
    assert client.post("/api/auth/login").status_code == 200
    response = client.post("/api/auth/login")

    assert response.status_code == 429
    assert response.headers["X-RateLimit-Limit"] == "2"
    assert response.headers["Retry-After"] == "60"


def test_user_cannot_read_other_users_journal_entry():
    from app.routers.journal import get_entry

    with pytest.raises(HTTPException) as exc_info:
        get_entry(entry_id=100, user_id=1, db=EmptyDb())

    assert exc_info.value.status_code == 404


def test_user_cannot_update_other_users_task():
    from app.routers.tasks import TaskUpdate, update_task

    with pytest.raises(HTTPException) as exc_info:
        update_task(task_id=100, user_number="user-a", updates=TaskUpdate(title="Nope"), db=EmptyDb())

    assert exc_info.value.status_code == 404


def test_user_cannot_delete_other_users_goal():
    from app.routers.journey import delete_goal

    with pytest.raises(HTTPException) as exc_info:
        delete_goal(goal_id=100, user_number="user-a", db=EmptyDb())

    assert exc_info.value.status_code == 404


def test_user_cannot_access_other_users_journey_belt_trial():
    from app.routers.journey import BeltTrialSubmit, submit_belt_trial_response

    payload = BeltTrialSubmit(response_text="Some reflection")
    with pytest.raises(HTTPException) as exc_info:
        submit_belt_trial_response(trial_id=100, trial_data=payload, user_number="user-a", db=EmptyDb())

    assert exc_info.value.status_code == 404


def test_user_cannot_delete_other_users_coaching_session():
    from app.routers.leadership_coaching_router import delete_session

    with pytest.raises(HTTPException) as exc_info:
        delete_session(session_id=100, user_number="user-a", db=EmptyDb())

    assert exc_info.value.status_code == 404


class SingleItemQuery:
    def __init__(self, item):
        self.item = item

    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return self.item


class AuditCaptureDb:
    def __init__(self, journal_entry):
        self.journal_entry = journal_entry
        self.added = []
        self.deleted = []
        self.commits = 0

    def query(self, model):
        return SingleItemQuery(self.journal_entry)

    def delete(self, item):
        self.deleted.append(item)

    def add(self, item):
        self.added.append(item)

    def commit(self):
        self.commits += 1

    def rollback(self):
        pass


def test_audit_log_created_when_journal_entry_is_deleted():
    from app.models import AuditLog, JournalEntry
    from app.routers.journal import delete_entry

    private_text = "full private journal entry should never appear in audit metadata"
    db = AuditCaptureDb(JournalEntry(id=123, user_id=7, text=private_text))

    response = delete_entry(entry_id=123, user_id=7, db=db)

    audit_logs = [item for item in db.added if isinstance(item, AuditLog)]
    assert response == {"status": "deleted"}
    assert len(audit_logs) == 1
    assert audit_logs[0].event_type == "journal_deleted"
    assert audit_logs[0].object_type == "journal_entry"
    assert audit_logs[0].object_id == "123"


def test_audit_log_does_not_contain_private_journal_content():
    from app.models import AuditLog, JournalEntry
    from app.routers.journal import delete_entry

    private_text = "this private journal sentence must not be copied"
    db = AuditCaptureDb(JournalEntry(id=124, user_id=7, text=private_text))

    delete_entry(entry_id=124, user_id=7, db=db)

    audit_log = next(item for item in db.added if isinstance(item, AuditLog))
    assert private_text not in str(audit_log.metadata_json)
    assert audit_log.metadata_json == {"journal_id": 124, "status": "deleted"}


def test_db_health_check_prints_counts_without_sensitive_content(tmp_path):
    database_path = tmp_path / "health.db"
    engine = create_engine(f"sqlite:///{database_path}")
    sensitive_text = "private journal content should not be printed"
    with engine.begin() as conn:
        for table in [
            "users",
            "tasks",
            "journal_entries",
            "journey_goals",
            "journey_belt_trials",
            "messages",
        ]:
            conn.execute(text(f"CREATE TABLE {table} (id INTEGER PRIMARY KEY, content TEXT)"))
        conn.execute(text("INSERT INTO journal_entries (content) VALUES (:content)"), {"content": sensitive_text})

    result = subprocess.run(
        [sys.executable, "scripts/db_health_check.py"],
        env={**os.environ, "DATABASE_URL": f"sqlite:///{database_path}"},
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0
    assert "journal_entries: 1" in result.stdout
    assert "status: ok" in result.stdout
    assert sensitive_text not in result.stdout
