from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import Mock

from app.services.evidence_memory_service import (
    MemoryResult,
    _consolidate_meeting_results,
    _normalize,
    _terms,
    format_evidence_context,
)


def test_normalizes_tags_and_removes_query_stopwords():
    assert _normalize("  Project: Alpha!  ") == "project alpha"
    assert _terms("Draft an update about Project Alpha with Sarah") == {"draft", "update", "project", "alpha", "sarah"}
    assert _terms("Yeah, I think we could actually talk about it") == set()


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


def test_consolidates_multiple_segments_from_one_meeting():
    occurred = datetime(2026, 9, 18, tzinfo=timezone.utc)
    rows = [
        (
            MemoryResult(index, "meeting_transcript", str(index), text, occurred, ("theme:demo",), score),
            SimpleNamespace(payload={"meeting_id": 12}),
        )
        for index, text, score in (
            (1, "Use the US dataset for the demo.", 0.9),
            (2, "The rehearsal is Tuesday.", 0.8),
            (3, "A third transcript fragment should not be added.", 0.7),
        )
    ]
    meeting = SimpleNamespace(
        id=12,
        title="Campari demo preparation",
        executive_summary="Prepare the US version before the rehearsal.",
        one_line_summary=None,
        user_notes=None,
        started_at=occurred,
    )
    db = Mock()
    db.query.return_value.filter.return_value.all.return_value = [meeting]

    results = _consolidate_meeting_results(db, rows, limit=8)

    assert len(results) == 1
    assert results[0].source_type == "meeting"
    assert results[0].label == "Campari demo preparation"
    assert results[0].excerpt.count("Transcript:") == 2
    assert "third transcript" not in results[0].excerpt
