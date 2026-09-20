import os
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace


os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

from app.routers.intelligence import (  # noqa: E402
    _backfill_response,
    _run_is_stale,
    build_operating_model,
    model_section,
    operating_model_area,
)


def test_model_section_routes_the_broader_user_model():
    assert model_section(SimpleNamespace(object_type="intent", claim_type="goal")) == "direction"
    assert model_section(SimpleNamespace(object_type="state", claim_type="state")) == "current_context"
    assert model_section(SimpleNamespace(object_type="pattern", claim_type="pattern")) == "how_i_operate"
    assert model_section(SimpleNamespace(object_type="relationship", claim_type="relationship")) == "relationships"
    assert model_section(SimpleNamespace(object_type="capability", claim_type="strength")) == "growth"


def _claim(claim_id, object_type, claim_type, *, confirmed=False, coaching=None, counters=0):
    links = [SimpleNamespace(relationship_type="supports")]
    links.extend(SimpleNamespace(relationship_type="counters") for _ in range(counters))
    return SimpleNamespace(
        id=claim_id,
        object_type=object_type,
        claim_type=claim_type,
        statement=f"Statement {claim_id}",
        pattern_title=f"Pattern {claim_id}",
        interpretation=f"Interpretation {claim_id}",
        trajectory="stable",
        scope="work",
        confidence_score=0.8,
        epistemic_status="validated_pattern" if confirmed else "hypothesis",
        review_status="confirmed" if confirmed else "active",
        evidence_links=links,
        coaching_implication=coaching,
    )


def test_operating_model_routes_claims_and_keeps_dossier_links():
    claims = [
        _claim(1, "intent", "goal", confirmed=True),
        _claim(2, "capability", "strength"),
        _claim(3, "pattern", "pattern", counters=1),
        _claim(4, "attribute", "development_area", coaching="Protect recovery time."),
    ]

    model = build_operating_model(claims)

    assert operating_model_area(claims[0]) == "direction"
    assert model["direction"][0]["claim_id"] == 1
    assert model["strengths"][0]["claim_id"] == 2
    assert model["operating_patterns"][0]["counterevidence_count"] == 1
    assert model["development_edges"][0]["claim_id"] == 4
    assert model["coaching_priorities"][0]["statement"] == "Protect recovery time."


def test_backfill_response_exposes_observable_progress():
    run = SimpleNamespace(
        id=1,
        status="synthesizing",
        evidence_count=42,
        claims_created=0,
        processing_mode="initial",
        new_evidence_count=42,
        changed_evidence_count=0,
        unchanged_evidence_count=0,
        progress_percent=50,
        progress_stage="analyzing_history",
        progress_current=2,
        progress_total=4,
        heartbeat_at=None,
        activity_log=[{"event": "batch_completed", "details": {"current": 2}}],
        source_counts={"journal": 42},
        error_message=None,
        failure_stage=None,
        failure_reference=None,
        started_at=None,
        completed_at=None,
        created_at=None,
    )

    response = _backfill_response(run)

    assert response["progress_percent"] == 50
    assert response["progress_stage"] == "analyzing_history"
    assert response["progress_current"] == 2
    assert response["progress_total"] == 4
    assert response["activity_log"][0]["event"] == "batch_completed"


def test_active_run_is_stale_after_five_minutes_without_heartbeat():
    now = datetime(2026, 9, 19, 17, 0, tzinfo=timezone.utc)
    run = SimpleNamespace(
        status="synthesizing",
        heartbeat_at=now - timedelta(minutes=6),
        started_at=now - timedelta(minutes=20),
        created_at=now - timedelta(minutes=21),
    )

    assert _run_is_stale(run, now=now) is True


def test_recent_heartbeat_keeps_active_run_alive():
    now = datetime(2026, 9, 19, 17, 0, tzinfo=timezone.utc)
    run = SimpleNamespace(
        status="synthesizing",
        heartbeat_at=now - timedelta(minutes=2),
        started_at=now - timedelta(hours=1),
        created_at=now - timedelta(hours=1),
    )

    assert _run_is_stale(run, now=now) is False
