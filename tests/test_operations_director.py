from datetime import datetime
import os

import pytest

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

from app.models import OperationsIssueDraft, SystemHealthEvent, User
from app.routers.admin import _get_admin_user
from app.routers.admin_operations import (
    _build_executive_summary,
    _draft_to_dict,
    _event_to_dict,
    _operations_chat_response,
    _sort_by_criticality,
)
from app.services.github import issues as github_issues
from app.services.operations_director.health_events import HealthEventService, sanitize_text
from app.services.operations_director.reviewer import OperationsDirectorReviewer


class FakeQuery:
    def __init__(self, items):
        self.items = items

    def filter(self, *args, **kwargs):
        return self

    def order_by(self, *args, **kwargs):
        return self

    def limit(self, value):
        self.items = self.items[:value]
        return self

    def all(self):
        return list(self.items)

    def first(self):
        return self.items[0] if self.items else None


class FakeOperationsDb:
    def __init__(self):
        self.system_health_events = []
        self.operations_issue_drafts = []
        self.next_id = 1
        self.commits = 0
        self.rollbacks = 0

    def add(self, item):
        if getattr(item, "id", None) is None:
            item.id = self.next_id
            self.next_id += 1
        if isinstance(item, SystemHealthEvent) and item not in self.system_health_events:
            self.system_health_events.append(item)
        if isinstance(item, OperationsIssueDraft) and item not in self.operations_issue_drafts:
            self.operations_issue_drafts.append(item)

    def query(self, model):
        if model is SystemHealthEvent:
            return FakeQuery(self.system_health_events)
        if model is OperationsIssueDraft:
            return FakeQuery(self.operations_issue_drafts)
        return FakeQuery([])

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1

    def flush(self):
        pass

    def refresh(self, item):
        pass


def test_health_event_service_deduplicates_similar_failures():
    db = FakeOperationsDb()
    service = HealthEventService(db)

    first = service.record_health_event(
        source="api",
        category="backend_500",
        endpoint="/api/tasks",
        method="GET",
        status_code=500,
        message="Database timeout for user 123",
    )
    second = service.record_health_event(
        source="api",
        category="backend_500",
        endpoint="/api/tasks",
        method="GET",
        status_code=500,
        message="Database timeout for user 456",
    )

    assert first.id == second.id
    assert len(db.system_health_events) == 1
    assert second.occurrence_count == 2
    assert second.severity == "high"


def test_health_event_service_sanitizes_secrets_and_user_numbers():
    db = FakeOperationsDb()
    event = HealthEventService(db).record_health_event(
        source="api",
        category="backend_500",
        endpoint="/api/chat",
        status_code=500,
        user_number="whatsapp:+15551234567",
        message="token=super-secret postgres://user:pass@example/db",
        details={"Authorization": "Bearer abc", "safe": "kept"},
    )

    assert "super-secret" not in event.message
    assert "postgres://" not in event.message
    assert event.user_number.endswith("4567")
    assert event.details_json["Authorization"] == "[REDACTED]"
    assert event.details_json["safe"] == "kept"
    assert sanitize_text("Bearer abc.def") == "Bearer [REDACTED]"


def test_operations_director_api_sanitizes_stored_sql_payloads():
    raw = (
        "(psycopg2.errors.UniqueViolation) duplicate key value violates unique constraint "
        "DETAIL: Key (user_number)=(whatsapp:+17707789240) already exists. "
        "[SQL: INSERT INTO home_dashboard_snapshots (user_number) VALUES (%(user_number)s)] "
        "[parameters: {'user_number': 'whatsapp:+17707789240'}]"
    )
    event = SystemHealthEvent(
        id=1,
        event_type="database_failure",
        category="database_failure",
        severity="critical",
        message=raw,
        details_json={"raw": raw, "Authorization": "Bearer abc.def"},
        endpoint="/api/home/dashboard",
        occurrence_count=1,
    )
    draft = OperationsIssueDraft(
        id=2,
        title="Critical database failure",
        summary=f"Latest sanitized message: {raw}",
        severity="critical",
        status="draft",
        evidence_json={"details": {"raw": raw}, "affected_target": "/api/home/dashboard"},
        suspected_root_cause=raw,
        recommended_action=raw,
        codex_brief_markdown=f"# Codex Brief\n\n{raw}",
    )

    payload = str(_event_to_dict(event)) + str(_draft_to_dict(draft))

    assert "whatsapp:+17707789240" not in payload
    assert "INSERT INTO home_dashboard_snapshots" not in payload
    assert "'user_number': 'whatsapp" not in payload
    assert "Bearer abc.def" not in payload
    assert "[SQL: REDACTED]" in payload


def test_github_issue_missing_configuration_names_required_variables(monkeypatch):
    monkeypatch.delenv("GITHUB_TOKEN", raising=False)
    monkeypatch.delenv("GITHUB_OWNER", raising=False)
    monkeypatch.delenv("GITHUB_REPO", raising=False)

    with pytest.raises(github_issues.GitHubIssueError) as exc_info:
        github_issues.create_github_issue("Title", "Body")

    assert "GITHUB_TOKEN" in str(exc_info.value)
    assert "GITHUB_OWNER" in str(exc_info.value)
    assert "GITHUB_REPO" in str(exc_info.value)


def test_operations_director_creates_codex_ready_draft_and_prevents_duplicates():
    db = FakeOperationsDb()
    event = HealthEventService(db).record_health_event(
        source="cron",
        category="cron_failure",
        job_name="morning",
        message="Nudge failed",
        details={"operation": "send_nudge_for_user"},
    )

    reviewer = OperationsDirectorReviewer(db)
    drafts = reviewer.review_recent_events()
    duplicate_run = reviewer.review_recent_events()

    assert len(drafts) == 1
    assert duplicate_run == []
    draft = drafts[0]
    assert draft.status == "draft"
    assert draft.created_by_agent == "operations_director"
    assert draft.source_event_ids == [event.id]
    assert "# Codex Brief -" in draft.codex_brief_markdown
    assert "Generated by Alfred Operations Director." in draft.codex_brief_markdown
    assert "codex-ready" in draft.github_labels_json


def test_github_issue_payload_contains_codex_brief(monkeypatch):
    captured = {}

    class Response:
        status_code = 201

        def json(self):
            return {"number": 28, "html_url": "https://github.com/example/repo/issues/28"}

    def fake_post(url, json, headers, timeout):
        captured["url"] = url
        captured["json"] = json
        captured["headers"] = headers
        captured["timeout"] = timeout
        return Response()

    monkeypatch.setenv("GITHUB_TOKEN", "token")
    monkeypatch.setenv("GITHUB_OWNER", "example")
    monkeypatch.setenv("GITHUB_REPO", "repo")
    monkeypatch.setattr(github_issues.requests, "post", fake_post)

    result = github_issues.create_github_issue(
        "Fix backend 500",
        "# Codex Brief - Fix backend 500\n\n## Context\nDetected by Alfred Operations Director.",
        labels=["operations-director", "codex-ready"],
    )

    assert result["number"] == 28
    assert captured["url"] == "https://api.github.com/repos/example/repo/issues"
    assert captured["json"]["title"] == "Fix backend 500"
    assert "# Codex Brief" in captured["json"]["body"]
    assert captured["json"]["labels"] == ["operations-director", "codex-ready"]
    assert captured["headers"]["Authorization"] == "Bearer token"


def test_operations_director_sorts_summarizes_and_answers_from_context():
    low = OperationsIssueDraft(
        id=1,
        title="Low email failure",
        summary="Email failed once.",
        severity="low",
        status="draft",
        codex_brief_markdown="# Codex Brief - Low",
    )
    critical = OperationsIssueDraft(
        id=2,
        title="Critical database failure",
        summary="Database writes are failing repeatedly.",
        severity="critical",
        status="draft",
        recommended_action="Inspect schema drift and failed writes.",
        codex_brief_markdown="# Codex Brief - Critical",
    )
    event = SystemHealthEvent(
        id=10,
        category="database_failure",
        event_type="database_failure",
        severity="critical",
        environment="production",
        source="database",
        occurrence_count=5,
        endpoint="/api/tasks",
    )

    sorted_drafts = _sort_by_criticality([low, critical])
    summary = _build_executive_summary([low, critical], [event])
    reply = _operations_chat_response("what should I review first?", [low, critical], [event])

    assert sorted_drafts[0].title == "Critical database failure"
    assert summary["critical_or_high"] == 1
    assert summary["recurring_events"] == 1
    assert summary["top_issue_title"] == "Critical database failure"
    assert "Critical database failure" in reply
    assert "Inspect schema drift" in reply


class AdminFakeDb:
    def __init__(self, user):
        self.user = user

    def query(self, model):
        return FakeQuery([self.user])


def test_admin_permission_required_for_operations_tools():
    non_admin = User(id=1, email="user@example.com", is_admin=False, is_active=True, created_at=datetime.utcnow())

    with pytest.raises(Exception) as exc_info:
        _get_admin_user("user@example.com", AdminFakeDb(non_admin))

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "Admin access required"
