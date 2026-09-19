import os
from datetime import datetime, timezone
from types import SimpleNamespace


os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("OPENAI_API_KEY", "test-key")

from app.services.intelligence_backfill_service import (  # noqa: E402
    EvidenceCandidate,
    _batches,
    batch_content_hash,
    batch_plan_hash,
    candidate_content_hash,
    normalize_generated_claim,
    prepare_analysis_lines,
    synthesize_claims,
)
from app.services import intelligence_backfill_service as service_module  # noqa: E402


def evidence(evidence_id, *, source_type="journal", evidence_type="user_statement", secondary=False, context_only=False):
    return SimpleNamespace(
        id=evidence_id,
        source_type=source_type,
        evidence_type=evidence_type,
        payload={"secondary_ai_derived": secondary, "context_only": context_only},
        occurred_at=datetime(2026, 9, evidence_id, tzinfo=timezone.utc),
    )


def test_batching_considers_every_evidence_line_once():
    lines = ["a" * 8, "b" * 8, "c" * 8]
    assert _batches(lines, max_characters=10) == [[lines[0]], [lines[1]], [lines[2]]]


def test_analysis_input_excludes_context_ai_and_duplicate_records():
    rows = [
        SimpleNamespace(id=1, source_type="journal", excerpt="I protect mornings.", payload={},
                        occurred_at=datetime(2026, 9, 1, tzinfo=timezone.utc)),
        SimpleNamespace(id=2, source_type="meeting_transcript", excerpt="A colleague's opinion.",
                        payload={"context_only": True}, occurred_at=datetime(2026, 9, 2, tzinfo=timezone.utc)),
        SimpleNamespace(id=3, source_type="meeting_observation", excerpt="AI interpretation.",
                        payload={"secondary_ai_derived": True}, occurred_at=datetime(2026, 9, 3, tzinfo=timezone.utc)),
        SimpleNamespace(id=4, source_type="message", excerpt="I protect mornings.", payload={},
                        occurred_at=datetime(2026, 9, 4, tzinfo=timezone.utc)),
    ]

    lines, stats = prepare_analysis_lines(rows)

    assert len(lines) == 1
    assert "I protect mornings." in lines[0]
    assert stats == {
        "included": 1,
        "context_only_skipped": 1,
        "secondary_ai_skipped": 1,
        "duplicate_skipped": 1,
        "skipped": 3,
    }


def test_batch_plan_hash_is_stable_and_changes_with_input():
    original = [["line one"], ["line two"]]

    assert batch_content_hash(original[0]) == batch_content_hash(["line one"])
    assert batch_plan_hash(original) == batch_plan_hash([["line one"], ["line two"]])
    assert batch_plan_hash(original) != batch_plan_hash([["line one changed"], ["line two"]])


def test_synthesis_restores_completed_batch_without_calling_openai(monkeypatch):
    row = SimpleNamespace(
        id=7,
        source_type="journal",
        evidence_type="user_statement",
        excerpt="I protect mornings for focused work.",
        payload={},
        occurred_at=datetime(2026, 9, 1, tzinfo=timezone.utc),
    )
    lines, _ = prepare_analysis_lines([row])
    batches = _batches(lines)
    batch_hash = batch_content_hash(batches[0])
    checkpoint = {
        "plan_hash": batch_plan_hash(batches),
        "batches": {batch_hash: []},
        "completed_count": 1,
        "batch_total": 1,
    }
    events = []

    class EmptyQuery:
        def filter(self, *args, **kwargs):
            return self

        def all(self):
            return []

    class FakeDb:
        def query(self, *args, **kwargs):
            return EmptyQuery()

        def commit(self):
            return None

    monkeypatch.setattr(service_module, "OpenAI", lambda **kwargs: object())
    monkeypatch.setattr(
        service_module,
        "_extract_batch_claims",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("OpenAI should not be called")),
    )
    monkeypatch.setattr(service_module, "_consolidate_all_claims", lambda *args, **kwargs: [])

    result = synthesize_claims(
        FakeDb(),
        SimpleNamespace(id=1, phone_number="test"),
        [row],
        processing_mode="initial",
        checkpoint_data=checkpoint,
        activity_callback=lambda event, details: events.append((event, details)),
    )

    assert result == []
    assert any(event == "batch_restored" for event, _ in events)


def test_ai_derived_evidence_cannot_create_a_belief_by_itself():
    result = normalize_generated_claim(
        {
            "statement": "The user avoids conflict.",
            "claim_type": "pattern",
            "epistemic_status": "hypothesis",
            "confidence_score": 0.9,
            "evidence_ids": [1],
        },
        {1: evidence(1, secondary=True)},
    )
    assert result is None


def test_other_meeting_speakers_cannot_create_a_belief_about_the_user():
    result = normalize_generated_claim(
        {
            "statement": "The user opposes the proposed platform direction.",
            "claim_type": "preference",
            "epistemic_status": "user_statement",
            "confidence_score": 0.9,
            "evidence_ids": [1],
        },
        {1: evidence(1, source_type="meeting_transcript", context_only=True)},
    )
    assert result is None


def test_single_event_hypothesis_stays_below_personalization_threshold():
    result = normalize_generated_claim(
        {
            "statement": "The user may prefer morning focus time.",
            "claim_type": "preference",
            "epistemic_status": "hypothesis",
            "confidence_score": 0.95,
            "evidence_ids": [1],
        },
        {1: evidence(1)},
    )
    assert result["confidence_score"] == 0.64


def test_validated_pattern_requires_multiple_primary_sources():
    result = normalize_generated_claim(
        {
            "statement": "The user repeatedly follows through after making public commitments.",
            "claim_type": "pattern",
            "epistemic_status": "validated_pattern",
            "confidence_score": 0.9,
            "evidence_ids": [1, 2, 3],
        },
        {1: evidence(1), 2: evidence(2), 3: evidence(3)},
    )
    assert result["epistemic_status"] == "hypothesis"


def test_cross_source_pattern_can_remain_validated():
    result = normalize_generated_claim(
        {
            "statement": "The user consistently protects high-focus work in the morning.",
            "claim_type": "pattern",
            "epistemic_status": "validated_pattern",
            "confidence_score": 0.9,
            "evidence_ids": [1, 2, 3],
        },
        {
            1: evidence(1, source_type="journal"),
            2: evidence(2, source_type="task"),
            3: evidence(3, source_type="coaching_session"),
        },
    )
    assert result["epistemic_status"] == "validated_pattern"


def test_evidence_fingerprint_is_stable_and_changes_with_content():
    original = EvidenceCandidate(
        source_type="journal",
        source_id="1",
        evidence_key="entry",
        evidence_type="user_statement",
        excerpt="I protect mornings for focused work.",
        occurred_at=datetime(2026, 9, 1, tzinfo=timezone.utc),
        payload={"topic": "focus"},
    )
    same = EvidenceCandidate(**original.__dict__)
    changed = EvidenceCandidate(**{**original.__dict__, "excerpt": "I now protect afternoons for focused work."})

    assert candidate_content_hash(original) == candidate_content_hash(same)
    assert candidate_content_hash(original) != candidate_content_hash(changed)


def test_generated_claim_keeps_executive_model_dimensions():
    result = normalize_generated_claim(
        {
            "statement": "The user is currently protecting time for a product launch.",
            "object_type": "state",
            "claim_type": "state",
            "scope": "product launch",
            "stability": "current",
            "epistemic_status": "user_statement",
            "confidence_score": 0.9,
            "evidence_ids": [1],
        },
        {1: evidence(1)},
    )

    assert result["object_type"] == "state"
    assert result["scope"] == "product launch"
    assert result["stability"] == "current"
