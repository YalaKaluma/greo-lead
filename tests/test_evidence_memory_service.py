from datetime import datetime, timezone
from app.services.evidence_memory_service import MemoryResult, _normalize, _terms, format_evidence_context


def test_normalizes_tags_and_removes_query_stopwords():
    assert _normalize("  Project: Alpha!  ") == "project alpha"
    assert _terms("Draft an update about Project Alpha with Sarah") == {"draft", "update", "project", "alpha", "sarah"}


def test_formats_ranked_evidence_as_current_source_context():
    result = MemoryResult(
        evidence_id=7,
        source_type="meeting_decision",
        source_id="44",
        excerpt="Launch moves to October after the customer review.",
        occurred_at=datetime(2026, 9, 20, tzinfo=timezone.utc),
        tags=("project:Alpha", "person:Sarah"),
        score=0.91,
    )

    context = format_evidence_context([result])

    assert "CURRENT SOURCE EVIDENCE" in context
    assert "meeting_decision" in context
    assert "project:Alpha" in context
    assert "Launch moves to October" in context
