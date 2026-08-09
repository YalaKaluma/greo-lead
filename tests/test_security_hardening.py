import pytest
import os
import subprocess
import sys
import asyncio
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from starlette.requests import Request
from sqlalchemy import create_engine, text

from app.security_middleware import RateLimitMiddleware, RateLimitRule, SecurityHeadersMiddleware


def test_retired_provider_webhooks_are_not_registered():
    repository_root = Path(__file__).resolve().parents[1]
    main_source = (repository_root / "app" / "main.py").read_text(encoding="utf-8")

    assert not (repository_root / "app" / "routers" / "webhook.py").exists()
    assert not (repository_root / "app" / "routers" / "webhook_brain.py").exists()
    assert '"/api/webhook"' not in main_source
    assert '"/api/email/webhook"' not in main_source


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
    assert response.headers["Permissions-Policy"] == "camera=(), microphone=(self), geolocation=()"
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
    from app.models import User
    from app.routers.journal import get_entry

    with pytest.raises(HTTPException) as exc_info:
        get_entry(entry_id=100, user_id=1, db=EmptyDb(), current_user=User(id=1, phone_number="user-a"))

    assert exc_info.value.status_code == 404


def test_journal_object_lookup_uses_authenticated_owner_id():
    from sqlalchemy.dialects.postgresql import JSONB
    from sqlalchemy.ext.compiler import compiles
    from sqlalchemy.orm import sessionmaker
    from app.models import JournalEntry, User
    from app.routers.journal import get_entry

    @compiles(JSONB, "sqlite")
    def _compile_jsonb_for_sqlite(_type, _compiler, **_kwargs):
        return "JSON"

    engine = create_engine("sqlite:///:memory:")
    User.__table__.create(engine)
    JournalEntry.__table__.create(engine)
    session = sessionmaker(bind=engine)()
    try:
        session.add_all([
            User(id=1, phone_number="user-a", is_active=True),
            User(id=2, phone_number="user-b", is_active=True),
            JournalEntry(id=100, user_id=2, text="private user-b entry"),
        ])
        session.commit()

        with pytest.raises(HTTPException) as exc_info:
            get_entry(
                entry_id=100,
                user_id=2,
                db=session,
                current_user=session.get(User, 1),
            )
        assert exc_info.value.status_code == 404
    finally:
        session.close()


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
    from app.models import AuditLog, JournalEntry, User
    from app.routers.journal import delete_entry

    private_text = "full private journal entry should never appear in audit metadata"
    db = AuditCaptureDb(JournalEntry(id=123, user_id=7, text=private_text))

    response = delete_entry(entry_id=123, user_id=7, db=db, current_user=User(id=7, phone_number="user-a"))

    audit_logs = [item for item in db.added if isinstance(item, AuditLog)]
    assert response == {"status": "deleted"}
    assert len(audit_logs) == 1
    assert audit_logs[0].event_type == "journal_deleted"
    assert audit_logs[0].object_type == "journal_entry"
    assert audit_logs[0].object_id == "123"


def test_audit_log_does_not_contain_private_journal_content():
    from app.models import AuditLog, JournalEntry, User
    from app.routers.journal import delete_entry

    private_text = "this private journal sentence must not be copied"
    db = AuditCaptureDb(JournalEntry(id=124, user_id=7, text=private_text))

    delete_entry(entry_id=124, user_id=7, db=db, current_user=User(id=7, phone_number="user-a"))

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


def test_admin_dependency_uses_authenticated_user_role_not_query_identity():
    from app.models import User
    from app.routers.admin import require_admin

    admin = User(id=1, phone_number="admin@example.com", is_active=True, is_admin=True)
    ordinary_user = User(id=2, phone_number="admin@example.com", is_active=True, is_admin=False)

    assert require_admin(user=admin) is admin
    with pytest.raises(HTTPException) as exc_info:
        require_admin(user=ordinary_user)
    assert exc_info.value.status_code == 403


def test_legacy_password_replacement_endpoint_is_disabled():
    from app.routers.onboarding import set_permanent_password

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(set_permanent_password(user_id=42, new_password="replacement", db=EmptyDb()))

    assert exc_info.value.status_code == 410


def test_scheduler_dependency_rejects_missing_credentials(monkeypatch):
    from app.security_dependencies import require_scheduler_or_admin

    monkeypatch.setenv("ALFRED_SCHEDULER_SECRET", "s" * 32)
    with pytest.raises(HTTPException) as exc_info:
        require_scheduler_or_admin(authorization=None, scheduler_secret=None, db=EmptyDb())
    assert exc_info.value.status_code == 401


def test_scheduler_dependency_accepts_dedicated_secret(monkeypatch):
    from app.security_dependencies import require_scheduler_or_admin

    secret = "s" * 32
    monkeypatch.setenv("ALFRED_SCHEDULER_SECRET", secret)
    assert require_scheduler_or_admin(
        authorization=None,
        scheduler_secret=secret,
        db=EmptyDb(),
    ) is None


def _request_with_query(query: str) -> Request:
    return Request({
        "type": "http",
        "method": "GET",
        "scheme": "https",
        "server": ("alfred.example.com", 443),
        "path": "/api/tasks",
        "raw_path": b"/api/tasks",
        "query_string": query.encode("ascii"),
        "headers": [],
        "client": ("127.0.0.1", 1234),
    })


def test_authenticated_identity_rejects_cross_user_query():
    from app.models import User
    from app.security_dependencies import require_authenticated_identity

    user = User(id=1, phone_number="user-a", email="a@example.com", is_active=True)
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(require_authenticated_identity(_request_with_query("user_number=user-b"), user=user))
    assert exc_info.value.status_code == 403

    assert asyncio.run(
        require_authenticated_identity(_request_with_query("user_number=user-a"), user=user)
    ) is user


def _dependency_names(route: APIRoute) -> set[str]:
    names: set[str] = set()
    pending = list(route.dependant.dependencies)
    while pending:
        dependency = pending.pop()
        call = getattr(dependency, "call", None)
        if call is not None:
            names.add(getattr(call, "__name__", str(call)))
        pending.extend(dependency.dependencies)
    return names


def test_every_api_route_has_an_explicit_access_boundary():
    from app.main import app

    public_paths = {
        "/api/health",
        "/api/waitlist",
        "/api/auth/login",
        "/api/auth/register",
        "/api/auth/password-recovery/request",
        "/api/auth/password-recovery/reset",
        "/api/onboarding/login",
        "/api/onboarding/set-permanent-password",
        "/api/nudge/health",
    }
    accepted_dependencies = {
        "require_authenticated_identity",
        "require_authenticated_user",
        "require_admin",
        "require_scheduler_or_admin",
    }
    unclassified = []
    for route in app.routes:
        if not isinstance(route, APIRoute) or not route.path.startswith("/api/"):
            continue
        if route.path in public_paths:
            continue
        if not (_dependency_names(route) & accepted_dependencies):
            unclassified.append(f"{','.join(sorted(route.methods))} {route.path}")

    assert unclassified == []


class SingleUserDb:
    def __init__(self, user):
        self.user = user

    def query(self, _model):
        return self

    def filter(self, *_args, **_kwargs):
        return self

    def first(self):
        return self.user


def test_session_version_revokes_previously_issued_token(monkeypatch):
    from app.models import User
    from app.routers.auth import require_authenticated_user
    from app.utils.security import create_session_token

    monkeypatch.setenv("APP_SESSION_SECRET", "test-session-secret-that-is-long-enough-123")
    user = User(id=11, phone_number="user-a", is_active=True, session_version=0)
    token = create_session_token(user.id, user.phone_number, user.session_version)
    authorization = f"Bearer {token}"

    assert require_authenticated_user(authorization=authorization, db=SingleUserDb(user)) is user

    user.session_version += 1
    with pytest.raises(HTTPException) as exc_info:
        require_authenticated_user(authorization=authorization, db=SingleUserDb(user))
    assert exc_info.value.status_code == 401


def test_password_policy_rejects_short_and_common_passwords():
    from app.utils.password_policy import password_policy_error

    assert password_policy_error("short") is not None
    assert password_policy_error("password1234") is not None
    assert password_policy_error("correct horse battery staple") is None


class AuditWriteDb:
    def __init__(self):
        self.added = []
        self.commits = 0

    def add(self, item):
        self.added.append(item)

    def commit(self):
        self.commits += 1


def test_authenticated_password_change_clears_temp_password_and_revokes_sessions(monkeypatch):
    from app.models import User
    from app.routers.auth import ChangePasswordRequest, change_password
    from app.utils.security import hash_password, verify_password

    monkeypatch.setenv("APP_SESSION_SECRET", "test-session-secret-that-is-long-enough-123")
    user = User(
        id=21,
        phone_number="user-a",
        is_active=True,
        session_version=4,
        temp_password=hash_password("TemporaryPass123!"),
    )
    db = AuditWriteDb()
    response = asyncio.run(change_password(
        payload=ChangePasswordRequest(
            current_password="TemporaryPass123!",
            new_password="A much better password 2026!",
        ),
        request=_request_with_query(""),
        current_user=user,
        db=db,
    ))

    assert response["success"] is True
    assert user.temp_password is None
    assert user.temp_password_expires is None
    assert user.session_version == 5
    assert verify_password("A much better password 2026!", user.password_hash)
    assert db.commits == 1


class VerificationDb:
    def __init__(self, verification):
        self.verification = verification
        self.commits = 0

    def query(self, _model):
        return self

    def filter(self, *_args, **_kwargs):
        return self

    def order_by(self, *_args, **_kwargs):
        return self

    def with_for_update(self):
        return self

    def first(self):
        return self.verification

    def commit(self):
        self.commits += 1


def test_email_verification_locks_after_five_wrong_codes():
    from datetime import datetime, timedelta
    from app.models import EmailVerification
    from app.services.onboarding_service import EmailVerificationService
    from app.utils.security import hash_password

    verification = EmailVerification(
        user_id=1,
        email="user@example.com",
        verification_code=hash_password("123456"),
        verified=False,
        attempt_count=0,
        expires_at=datetime.utcnow() + timedelta(minutes=15),
    )
    db = VerificationDb(verification)
    for attempt in range(5):
        success, message = EmailVerificationService.verify_code(db, 1, "000000")
        assert success is False
        if attempt == 4:
            assert "Too many" in message

    assert verification.attempt_count == 5
    assert verification.is_valid() is False
    assert db.commits == 5


class LoginDb:
    def __init__(self, user):
        self.user = user
        self.added = []
        self.commits = 0

    def query(self, _model):
        return self

    def filter(self, *_args, **_kwargs):
        return self

    def first(self):
        return self.user

    def add(self, item):
        self.added.append(item)

    def commit(self):
        self.commits += 1


def test_temporary_password_can_create_only_one_session(monkeypatch):
    from datetime import datetime, timedelta
    from app.models import User
    from app.routers.auth import LoginRequest, login
    from app.utils.security import hash_password

    monkeypatch.setenv("APP_SESSION_SECRET", "test-session-secret-that-is-long-enough-123")
    user = User(
        id=31,
        phone_number="user-a",
        is_active=True,
        session_version=0,
        temp_password=hash_password("TemporaryPass123!"),
        temp_password_expires=datetime.utcnow() + timedelta(hours=1),
        temp_password_consumed_at=None,
    )
    db = LoginDb(user)
    credentials = LoginRequest(username="user-a", password="TemporaryPass123!")

    first = asyncio.run(login(credentials=credentials, request=_request_with_query(""), db=db))
    second = asyncio.run(login(credentials=credentials, request=_request_with_query(""), db=db))

    assert first["success"] is True
    assert first["must_change_password"] is True
    assert user.temp_password_consumed_at is not None
    assert second == {"success": False, "message": "Invalid credentials"}


def test_new_registration_requires_valid_email():
    from pydantic import ValidationError
    from app.routers.auth import RegisterRequest

    with pytest.raises(ValidationError):
        RegisterRequest(username="not-an-email", password="A sufficiently long password")
    valid = RegisterRequest(username="new.user@example.com", password="A sufficiently long password")
    assert str(valid.username) == "new.user@example.com"


class MissingRecoveryUserDb:
    def query(self, _model):
        return self

    def filter(self, *_args, **_kwargs):
        return self

    def first(self):
        return None


def test_password_recovery_request_does_not_disclose_missing_account():
    from fastapi import BackgroundTasks
    from app.routers.auth import PasswordRecoveryRequest, PASSWORD_RECOVERY_RESPONSE, request_password_recovery

    response = asyncio.run(request_password_recovery(
        payload=PasswordRecoveryRequest(email="missing@example.com"),
        request=_request_with_query(""),
        background_tasks=BackgroundTasks(),
        db=MissingRecoveryUserDb(),
    ))
    assert response == PASSWORD_RECOVERY_RESPONSE


class PasswordResetDb:
    def __init__(self, reset_token, user):
        self.reset_token = reset_token
        self.user = user
        self.current_model = None
        self.added = []
        self.commits = 0

    def query(self, model):
        self.current_model = model
        return self

    def filter(self, *_args, **_kwargs):
        return self

    def with_for_update(self):
        return self

    def first(self):
        from datetime import datetime, timezone
        from app.models import PasswordResetToken
        if self.current_model is PasswordResetToken:
            if self.reset_token.consumed_at is not None or self.reset_token.expires_at <= datetime.now(timezone.utc):
                return None
            return self.reset_token
        return self.user

    def update(self, values, synchronize_session=False):
        del synchronize_session
        if "consumed_at" in values:
            self.reset_token.consumed_at = values["consumed_at"]
        return 1

    def add(self, item):
        self.added.append(item)

    def commit(self):
        self.commits += 1


def test_password_reset_token_is_single_use_and_revokes_sessions():
    from datetime import datetime, timedelta, timezone
    from app.models import PasswordResetToken, User
    from app.routers.auth import PasswordResetRequest, reset_password_with_token
    from app.utils.security import hash_password_reset_token, verify_password

    raw_token = "r" * 43
    user = User(id=41, phone_number="user-a", email="a@example.com", is_active=True, session_version=2)
    reset_token = PasswordResetToken(
        id=1,
        user_id=user.id,
        token_hash=hash_password_reset_token(raw_token),
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=15),
    )
    db = PasswordResetDb(reset_token, user)
    response = asyncio.run(reset_password_with_token(
        payload=PasswordResetRequest(token=raw_token, new_password="A recovered password 2026!"),
        request=_request_with_query(""),
        db=db,
    ))

    assert response["success"] is True
    assert reset_token.consumed_at is not None
    assert user.session_version == 3
    assert verify_password("A recovered password 2026!", user.password_hash)

    with pytest.raises(HTTPException) as replay_error:
        asyncio.run(reset_password_with_token(
            payload=PasswordResetRequest(token=raw_token, new_password="Another recovered password 2026!"),
            request=_request_with_query(""),
            db=db,
        ))
    assert replay_error.value.status_code == 400


def test_expired_password_reset_token_is_rejected():
    from datetime import datetime, timedelta, timezone
    from app.models import PasswordResetToken, User
    from app.routers.auth import PasswordResetRequest, reset_password_with_token
    from app.utils.security import hash_password_reset_token

    raw_token = "e" * 43
    user = User(id=42, phone_number="user-b", email="b@example.com", is_active=True, session_version=0)
    reset_token = PasswordResetToken(
        id=2,
        user_id=user.id,
        token_hash=hash_password_reset_token(raw_token),
        expires_at=datetime.now(timezone.utc) - timedelta(seconds=1),
    )
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(reset_password_with_token(
            payload=PasswordResetRequest(token=raw_token, new_password="A recovered password 2026!"),
            request=_request_with_query(""),
            db=PasswordResetDb(reset_token, user),
        ))
    assert exc_info.value.status_code == 400


def test_password_reset_token_is_only_stored_as_a_hash():
    from app.utils.security import generate_password_reset_token, hash_password_reset_token

    raw_token, stored_hash = generate_password_reset_token()

    assert raw_token != stored_hash
    assert len(stored_hash) == 64
    assert hash_password_reset_token(raw_token) == stored_hash
