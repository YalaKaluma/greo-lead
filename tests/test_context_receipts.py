import os
from types import SimpleNamespace
from unittest.mock import Mock, patch

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("OPENAI_API_KEY", "test-key")

from app.services.email_drafting_service import draft_email
from app.services.evidence_memory_service import MemoryResult
from app.services.twin_context_service import TwinContext


@patch("app.services.email_drafting_service.client.chat.completions.create")
@patch("app.services.email_drafting_service.load_conversation_history", return_value=[])
@patch("app.services.email_drafting_service.retrieve_evidence")
@patch("app.services.email_drafting_service.get_twin_context")
def test_email_receipt_contains_twin_levels_and_ranked_evidence(twin, evidence, _history, completion):
    twin.return_value = TwinContext(
        prompt_context="Concise communication.", applied=True, core_twin_applied=True,
        snapshot_id=5, claim_ids=(11, 12), surface="email",
    )
    evidence.return_value = [MemoryResult(
        evidence_id=9, source_type="meeting_decision", source_id="4",
        excerpt="The launch moved to October.",
        occurred_at=__import__("datetime").datetime(2026, 9, 20, tzinfo=__import__("datetime").timezone.utc),
        tags=("project:Alpha",), score=0.9,
    )]
    completion.return_value = SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content="Subject: Launch\n\nUpdate"))]
    )

    result = draft_email(Mock(), "user", "Update Alpha")

    assert result.context_receipt["core_twin"] == {"used": True, "snapshot_id": 5}
    assert result.context_receipt["full_twin"]["claim_ids"] == [11, 12]
    assert result.context_receipt["evidence"][0]["evidence_id"] == 9
