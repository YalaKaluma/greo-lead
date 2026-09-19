import os
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace


os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

from app.services.intelligence_core_service import (  # noqa: E402
    _claim_usage,
    infer_intelligence_stage,
    select_context_claims,
)


def claim(
    claim_id,
    statement,
    *,
    claim_type="pattern",
    epistemic_status="hypothesis",
    confidence=0.7,
    review_status="active",
    valid_to=None,
):
    return SimpleNamespace(
        id=claim_id,
        statement=statement,
        claim_type=claim_type,
        epistemic_status=epistemic_status,
        confidence_score=confidence,
        review_status=review_status,
        valid_to=valid_to,
        updated_at=datetime(2026, 9, claim_id, tzinfo=timezone.utc),
    )


def test_new_user_keeps_default_intelligence_stage():
    assert infer_intelligence_stage(evidence_count=0, source_count=0, claims=[]) == "new"


def test_weak_hypothesis_is_not_used_as_personalization():
    weak = claim(1, "The user may avoid conflict.", confidence=0.42)
    assert _claim_usage(weak) is None
    assert select_context_claims([weak], surface="coaching") == []


def test_tentative_pattern_is_retained_but_not_treated_as_fact():
    tentative = claim(1, "The user may increase ownership during ambiguity.", confidence=0.72)
    assert _claim_usage(tentative) == "tentative"


def test_user_confirmation_overrides_inference_uncertainty():
    confirmed = claim(1, "Morning work is usually most effective.", confidence=0.4, review_status="confirmed")
    assert _claim_usage(confirmed) == "trusted"


def test_rejected_and_expired_claims_are_excluded():
    rejected = claim(1, "Rejected", review_status="rejected", confidence=1.0)
    expired = claim(
        2,
        "Expired",
        confidence=1.0,
        valid_to=datetime.now(timezone.utc) - timedelta(days=1),
    )
    assert select_context_claims([rejected, expired], surface="general") == []


def test_surface_and_query_relevance_select_the_right_context():
    email_preference = claim(
        1,
        "The user prefers diplomatic email pushback with senior stakeholders.",
        claim_type="communication",
        epistemic_status="user_statement",
        confidence=0.85,
    )
    unrelated_state = claim(
        2,
        "The user reported low energy after evening exercise.",
        claim_type="state",
        epistemic_status="user_statement",
        confidence=0.95,
    )
    selected = select_context_claims(
        [unrelated_state, email_preference],
        surface="email",
        query="Draft diplomatic pushback to a senior stakeholder",
        limit=1,
    )
    assert selected == [email_preference]


def test_personalization_stage_requires_depth_and_source_diversity():
    claims = [
        claim(
            index,
            f"Validated statement {index}",
            epistemic_status="user_statement",
            confidence=0.9,
        )
        for index in range(1, 6)
    ]
    assert infer_intelligence_stage(evidence_count=20, source_count=3, claims=claims) == "personalized"
    assert infer_intelligence_stage(evidence_count=20, source_count=1, claims=claims) == "learning"
