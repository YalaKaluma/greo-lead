import os
from types import SimpleNamespace


os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

from app.routers.intelligence import _backfill_response, model_section  # noqa: E402


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
