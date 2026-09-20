import os
from types import SimpleNamespace


os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

from app.services import twin_context_service  # noqa: E402
from app.services.priority_llm_service import PriorityLLMService  # noqa: E402
from app.services.twin_context_service import (  # noqa: E402
    TwinContext,
    append_twin_context,
    build_context_with_twin,
    get_twin_context,
)


class FakeQuery:
    def __init__(self, value):
        self.value = value

    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return self.value


class FakeDb:
    def __init__(self, user=None, error=None):
        self.user = user
        self.error = error

    def query(self, *args, **kwargs):
        if self.error:
            raise self.error
        return FakeQuery(self.user)


def test_twin_context_returns_prompt_and_trace_metadata(monkeypatch):
    user = SimpleNamespace(id=17, phone_number="whatsapp:+1000", email="user@example.com")
    captured = {}

    class FakeIntelligenceService:
        def __init__(self, db):
            captured["db"] = db

        def compile_context(self, **kwargs):
            captured.update(kwargs)
            return {
                "personalization_applied": True,
                "core_twin_applied": True,
                "stage": "personalized",
                "surface": "coaching",
                "twin_snapshot_id": 44,
                "claims": [{"id": 8}, {"id": 13}],
                "prompt_context": "CORE_DIGITAL_TWIN\nA bounded context",
            }

    monkeypatch.setattr(twin_context_service, "IntelligenceCoreService", FakeIntelligenceService)

    result = get_twin_context(
        FakeDb(user),
        user.phone_number,
        surface="coaching",
        query="delegation challenge",
        limit=5,
    )

    assert result.applied is True
    assert result.core_twin_applied is True
    assert result.snapshot_id == 44
    assert result.claim_ids == (8, 13)
    assert result.metadata()["claim_ids"] == [8, 13]
    assert captured["user"] is user
    assert captured["surface"] == "coaching"
    assert captured["query"] == "delegation challenge"
    assert captured["limit"] == 5


def test_twin_context_is_optional_for_cold_start_users(monkeypatch):
    class UnexpectedService:
        def __init__(self, db):
            raise AssertionError("compile_context should not run without a user")

    monkeypatch.setattr(twin_context_service, "IntelligenceCoreService", UnexpectedService)
    result = get_twin_context(FakeDb(None), "missing", surface="general")
    assert result == TwinContext(surface="general")


def test_twin_context_failure_does_not_break_product_surface(monkeypatch):
    monkeypatch.setattr(twin_context_service, "log_failure", lambda *args, **kwargs: "incident")
    result = get_twin_context(FakeDb(error=RuntimeError("database unavailable")), "user", surface="nudge")
    assert result.applied is False
    assert result.surface == "nudge"


def test_append_twin_context_marks_it_as_orientation_not_fact():
    twin = TwinContext(prompt_context="CORE_DIGITAL_TWIN\nTentative pattern", applied=True)
    prompt = append_twin_context("Base prompt", twin)
    assert prompt.startswith("Base prompt")
    assert "not to override current evidence" in prompt
    assert "Treat tentative findings as hypotheses" in prompt
    assert "CORE_DIGITAL_TWIN" in prompt


def test_combined_context_keeps_twin_before_current_context(monkeypatch):
    monkeypatch.setattr(
        twin_context_service,
        "get_twin_context",
        lambda *args, **kwargs: TwinContext(
            prompt_context="CORE_DIGITAL_TWIN\nStable orientation",
            applied=True,
            surface="coaching",
        ),
    )

    combined = build_context_with_twin(
        FakeDb(None),
        "user",
        surface="coaching",
        query="question",
        base_context="Recent journal evidence",
    )

    assert combined.index("CORE_DIGITAL_TWIN") < combined.index("Recent journal evidence")
    assert "prefer this when it conflicts with older Twin findings" in combined


def test_priority_prompt_includes_twin_context_when_available():
    context = SimpleNamespace(
        active_long_term_goals=[],
        active_short_term_goals=[],
        active_mid_term_goals=[],
        total_open_tasks=3,
        tasks_in_top10=[],
        tasks_with_due_dates=1,
        overdue_tasks=0,
        day_of_week="Monday",
        week_of_year=39,
        self_reported_energy=None,
        mtn_feedback_examples=[],
        twin_prompt_context="CORE_DIGITAL_TWIN\nThe user protects morning focus.",
    )

    formatted = PriorityLLMService()._format_context(context)

    assert "Digital Twin context" in formatted
    assert "The user protects morning focus" in formatted
