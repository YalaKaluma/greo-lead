from datetime import datetime
import os

import pytest

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

from app.models import CtoFinding, CtoReview, User
from app.routers.admin import _get_admin_user
from app.routers.admin_cto import _build_executive_summary, create_issue_from_cto_finding
from app.routers.nudge import run_cto_weekend_review
from app.services.cto_director import reviewer as cto_reviewer
from app.services.cto_director.reviewer import (
    CtoDirectorReviewer,
    GitHubCopilotCtoError,
    build_cto_codex_brief,
    build_github_copilot_cto_prompt,
)
from app.services.github import issues as github_issues


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


class FakeCtoDb:
    def __init__(self):
        self.cto_reviews = []
        self.cto_findings = []
        self.system_health_events = []
        self.operations_issue_drafts = []
        self.next_id = 1
        self.commits = 0
        self.rollbacks = 0

    def add(self, item):
        if getattr(item, "id", None) is None:
            item.id = self.next_id
            self.next_id += 1
        if hasattr(item, "created_at") and getattr(item, "created_at", None) is None:
            item.created_at = datetime.utcnow()
        if hasattr(item, "updated_at") and getattr(item, "updated_at", None) is None:
            item.updated_at = datetime.utcnow()
        if isinstance(item, CtoReview) and item not in self.cto_reviews:
            self.cto_reviews.append(item)
        if isinstance(item, CtoFinding) and item not in self.cto_findings:
            self.cto_findings.append(item)

    def query(self, model):
        if model is CtoReview:
            return FakeQuery(self.cto_reviews)
        if model is CtoFinding:
            return FakeQuery(self.cto_findings)
        if model is User and hasattr(self, "user"):
            return FakeQuery([self.user])
        return FakeQuery([])

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1

    def flush(self):
        pass

    def refresh(self, item):
        pass


def _stub_github(monkeypatch):
    monkeypatch.setattr(cto_reviewer.github_repository, "get_repo_tree", lambda: [])
    monkeypatch.setattr(cto_reviewer.github_repository, "get_recent_commits", lambda: [])
    monkeypatch.setattr(cto_reviewer.github_repository, "get_open_pull_requests", lambda: [])
    monkeypatch.setattr(cto_reviewer.github_repository, "get_recent_pull_requests", lambda: [])
    monkeypatch.setattr(cto_reviewer.github_repository, "get_open_issues", lambda: [])
    monkeypatch.setattr(cto_reviewer.github_repository, "get_workflow_runs", lambda: [])


def _stub_copilot_findings(monkeypatch, findings=None):
    default_findings = [
        {
            "category": "architecture",
            "severity": "high",
            "title": "Split CTO review orchestration from persistence",
            "summary": "The CTO review path mixes snapshot collection, review judgment, and persistence concerns.",
            "affected_files": ["app/services/cto_director/reviewer.py"],
            "affected_modules": ["cto_director"],
            "evidence": {"source": "copilot_cto_review"},
            "risk": "A single review path is harder to evolve as CTO review intelligence changes.",
            "action": "Separate the external CTO review client from persistence and add targeted tests for normalization.",
            "confidence": "high",
        }
    ]
    monkeypatch.setattr(
        cto_reviewer,
        "request_github_copilot_cto_findings",
        lambda snapshot: default_findings if findings is None else findings,
    )


def test_cto_director_creates_codex_ready_copilot_finding(tmp_path, monkeypatch):
    _stub_github(monkeypatch)
    _stub_copilot_findings(monkeypatch)
    app_dir = tmp_path / "app" / "routers"
    app_dir.mkdir(parents=True)
    large_router = app_dir / "admin_big.py"
    large_router.write_text("\n".join(["print('x')"] * 901), encoding="utf-8")
    tests_dir = tmp_path / "tests"
    tests_dir.mkdir()
    (tests_dir / "test_smoke.py").write_text("def test_smoke():\n    assert True\n", encoding="utf-8")

    db = FakeCtoDb()
    review = CtoDirectorReviewer(db, repo_root=tmp_path).run_review()

    assert review.status == "completed"
    assert db.cto_findings
    finding = next(item for item in db.cto_findings if item.category == "architecture")
    assert finding.category == "architecture"
    assert finding.title == "Split CTO review orchestration from persistence"
    assert finding.created_at is not None
    assert "# Codex Brief -" in finding.codex_brief_markdown
    assert "Generated by Alfred CTO Director." in finding.codex_brief_markdown
    assert "cto-director" in finding.github_labels_json


def test_cto_director_prevents_duplicate_active_findings(tmp_path, monkeypatch):
    _stub_github(monkeypatch)
    _stub_copilot_findings(monkeypatch)
    app_dir = tmp_path / "app" / "services"
    app_dir.mkdir(parents=True)
    (app_dir / "large_service.py").write_text("\n".join(["value = 1"] * 901), encoding="utf-8")

    db = FakeCtoDb()
    reviewer = CtoDirectorReviewer(db, repo_root=tmp_path)
    reviewer.run_review()
    reviewer.run_review()

    architecture_findings = [item for item in db.cto_findings if item.category == "architecture"]
    assert len(architecture_findings) == 1


def test_cto_director_ignores_incomplete_copilot_findings(tmp_path, monkeypatch):
    _stub_github(monkeypatch)
    _stub_copilot_findings(monkeypatch, [{"title": "Missing required fields"}])
    (tmp_path / "app").mkdir()

    db = FakeCtoDb()
    review = CtoDirectorReviewer(db, repo_root=tmp_path).run_review()

    assert review.status == "completed"
    assert db.cto_findings == []
    assert "no new open findings" in review.summary.lower()


def test_cto_director_records_copilot_auth_error_as_finding(tmp_path, monkeypatch):
    _stub_github(monkeypatch)
    monkeypatch.setattr(
        cto_reviewer,
        "request_github_copilot_cto_findings",
        lambda snapshot: (_ for _ in ()).throw(GitHubCopilotCtoError("GitHub Copilot CTO review failed with HTTP 401.")),
    )
    (tmp_path / "app").mkdir()

    db = FakeCtoDb()
    review = CtoDirectorReviewer(db, repo_root=tmp_path).run_review()

    assert review.status == "completed"
    assert len(db.cto_findings) == 1
    finding = db.cto_findings[0]
    assert finding.title == "GitHub Copilot CTO review needs authorized model access"
    assert finding.category == "release_readiness"
    assert "HTTP 401" in finding.evidence_json["copilot_cto_error"]


def test_cto_github_issue_payload_contains_codex_brief(monkeypatch):
    captured = {}

    def fake_create(title, body, labels=None, assignees=None):
        captured["title"] = title
        captured["body"] = body
        captured["labels"] = labels
        return {"number": 29, "url": "https://github.com/example/repo/issues/29"}

    db = FakeCtoDb()
    db.user = User(id=1, email="admin@example.com", is_admin=True, is_active=True, created_at=datetime.utcnow())
    finding = CtoFinding(
        id=1,
        title="Large module needs ownership split",
        summary="Large file risk",
        severity="high",
        category="architecture",
        status="open",
        codex_brief_markdown="# Codex Brief - Large module\n\n## Context\nFlagged by CTO.",
        github_labels_json=["cto-director", "architecture", "codex-ready"],
    )
    db.cto_findings.append(finding)
    monkeypatch.setattr("app.routers.admin_cto.create_github_issue", fake_create)

    result = create_issue_from_cto_finding(1, db, db.user)

    assert result["finding"]["github_issue_number"] == 29
    assert finding.status == "converted_to_issue"
    assert captured["title"] == "Large module needs ownership split"
    assert "# Codex Brief" in captured["body"]
    assert captured["labels"] == ["cto-director", "architecture", "codex-ready"]


def test_cto_executive_summary_prioritizes_high_findings():
    high = CtoFinding(
        id=1,
        title="High test gap",
        summary="Test gap",
        severity="high",
        category="testing",
        status="open",
        codex_brief_markdown="# Codex Brief",
        created_at=datetime.utcnow(),
    )
    info = CtoFinding(
        id=2,
        title="Info docs gap",
        summary="Docs gap",
        severity="info",
        category="documentation",
        status="open",
        codex_brief_markdown="# Codex Brief",
        created_at=datetime.utcnow(),
    )
    review = CtoReview(id=1, status="completed", architecture_score=80, security_score=90)

    summary = _build_executive_summary([review], [info, high])

    assert summary["critical_or_high"] == 1
    assert summary["open_findings"] == 2
    assert summary["top_finding_title"] == "High test gap"


def test_admin_permission_required_for_cto_tools():
    db = FakeCtoDb()
    db.user = User(id=1, email="user@example.com", is_admin=False, is_active=True, created_at=datetime.utcnow())

    with pytest.raises(Exception) as exc_info:
        _get_admin_user("user@example.com", db)

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "Admin access required"


def test_cto_weekend_review_uses_weekly_review_type(tmp_path, monkeypatch):
    _stub_github(monkeypatch)
    _stub_copilot_findings(monkeypatch, [])
    (tmp_path / "app").mkdir()
    db = FakeCtoDb()

    result = run_cto_weekend_review(db)

    assert result["status"] == "completed"
    assert db.cto_reviews[0].review_type == "weekly"


def test_github_copilot_cto_prompt_asks_for_cto_judgment():
    prompt = build_github_copilot_cto_prompt({"local": {"files": [{"path": "app/main.py"}]}})

    assert "Act like a pragmatic CTO" in prompt
    assert "Do not apply simple static thresholds" in prompt
    assert '"findings"' in prompt


def test_cto_codex_brief_has_required_sections():
    brief = build_cto_codex_brief(
        title="Security gap",
        category="security",
        severity="high",
        summary="Admin route risk.",
        evidence={"file": "app/routers/admin.py"},
        affected_files=["app/routers/admin.py"],
        affected_modules=["admin"],
        risk="Unauthorized users could reach admin behavior.",
        recommended_action="Verify admin guard coverage.",
    )

    assert "## Context" in brief
    assert "## Acceptance Criteria" in brief
    assert "Approved by Yala before GitHub issue creation." in brief
