import os
from datetime import datetime, timezone
from types import SimpleNamespace


os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("OPENAI_API_KEY", "test-key")

from app.services.intelligence_backfill_service import (  # noqa: E402
    _batches,
    normalize_generated_claim,
)


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
