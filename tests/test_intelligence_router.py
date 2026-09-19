import os
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace


os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

from app.routers.intelligence import _backfill_response, _run_is_stale, model_section  # noqa: E402


def test_model_section_routes_the_broader_user_model():
    assert model_section(SimpleNamespace(object_type="intent", claim_type="goal")) == "direction"
    assert model_section(SimpleNamespace(object_type="state", claim_type="state")) == "current_context"
    assert model_section(SimpleNamespace(object_type="pattern", claim_type="pattern")) == "how_i_operate"
    assert model_section(SimpleNamespace(object_type="relationship", claim_type="relationship")) == "relationships"
    assert model_section(SimpleNamespace(object_type="capability", claim_type="strength")) == "growth"


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
