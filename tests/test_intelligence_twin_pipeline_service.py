import os
from datetime import datetime, timezone
from types import SimpleNamespace


os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

from app.services.intelligence_twin_pipeline_service import (  # noqa: E402
    stage_is_unlocked,
    twin_stage_response,
)


def _stage(key, order, status):
    return SimpleNamespace(
        id=order,
        stage_key=key,
        stage_order=order,
        status=status,
        progress_percent=0,
        progress_current=0,
        progress_total=0,
        metrics_json=None,
        output_json=None,
        activity_log=None,
        error_message=None,
        failure_reference=None,
        started_at=None,
        completed_at=None,
        updated_at=datetime(2026, 9, 21, tzinfo=timezone.utc),
    )


def test_stages_unlock_only_after_the_previous_stage_completes():
    stages = [
        _stage("evidence_foundation", 1, "completed"),
        _stage("entity_directory", 2, "ready"),
        _stage("executive_world", 3, "locked"),
        _stage("behavioral_profile", 4, "locked"),
        _stage("dynamic_state", 5, "locked"),
        _stage("twin_assembly", 6, "locked"),
    ]

    assert stage_is_unlocked(stages, "evidence_foundation") is True
    assert stage_is_unlocked(stages, "entity_directory") is True
    assert stage_is_unlocked(stages, "executive_world") is False
    assert stage_is_unlocked(stages, "behavioral_profile") is False
    assert stage_is_unlocked(stages, "dynamic_state") is False
    assert stage_is_unlocked(stages, "twin_assembly") is False

    stages[1].status = "completed"
    assert stage_is_unlocked(stages, "executive_world") is True


def test_stage_response_exposes_progress_output_and_activity():
    stage = _stage("entity_directory", 2, "completed")
    stage.progress_percent = 100
    stage.metrics_json = {"person_count": 12}
    stage.output_json = {"entity_counts": {"person": 12}}
    stage.activity_log = [{"event": "stage_completed"}]

    response = twin_stage_response(stage)

    assert response["stage_key"] == "entity_directory"
    assert response["progress_percent"] == 100
    assert response["metrics"]["person_count"] == 12
    assert response["output"]["entity_counts"]["person"] == 12
    assert response["activity_log"][0]["event"] == "stage_completed"
    assert response["can_run"] is True
