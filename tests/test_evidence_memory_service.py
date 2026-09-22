import os
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import Mock


os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

from app.services.evidence_memory_service import (
    MemoryResult,
    _consolidate_meeting_results,
    _entity_discovery_batches,
    _normalize,
    _terms,
    build_entity_discovery_envelopes,
    format_evidence_context,
    set_evidence_tags,
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


def test_entity_discovery_consolidates_meeting_rows_into_one_envelope():
    occurred = datetime(2026, 9, 18, tzinfo=timezone.utc)
    rows = [
        SimpleNamespace(
            id=1,
            source_type="meeting",
            occurred_at=occurred,
            excerpt="Weekly launch review",
            payload={"meeting_id": 12},
        ),
        SimpleNamespace(
            id=2,
            source_type="meeting_transcript",
            occurred_at=occurred,
            excerpt="Sarah will prepare the Campari proposal.",
            payload={"meeting_id": 12},
        ),
        SimpleNamespace(
            id=3,
            source_type="meeting_decision",
            occurred_at=occurred,
            excerpt="Submit the Campari proposal on Friday.",
            payload={"meeting_id": 12},
        ),
        SimpleNamespace(
            id=4,
            source_type="task",
            occurred_at=occurred,
            excerpt="Call Marc at Acme.",
            payload={},
        ),
    ]

    envelopes = build_entity_discovery_envelopes(rows)

    assert len(envelopes) == 2
    meeting = next(item for item in envelopes if item.envelope_id == "meeting:12")
    assert meeting.evidence_ids == (1, 2, 3)
    assert meeting.representative_evidence_id == 1
    assert "Sarah" in meeting.text
    assert "Submit the Campari proposal" in meeting.text
    assert len(_entity_discovery_batches(envelopes)) == 1


def test_model_tag_reuses_existing_automatic_link():
    evidence = SimpleNamespace(id=1, user_id=2)
    tag = SimpleNamespace(id=3)
    existing_link = SimpleNamespace(confidence_score=0.8, source="automatic")
    delete_query = Mock()
    delete_query.filter.return_value.delete.return_value = 0
    tag_query = Mock()
    tag_query.filter.return_value.first.return_value = tag
    link_query = Mock()
    link_query.filter.return_value.first.return_value = existing_link
    db = Mock()
    db.query.side_effect = [delete_query, tag_query, link_query]

    set_evidence_tags(
        db,
        evidence,
        [("person", "Sarah", 0.95)],
        source="model",
    )

    assert existing_link.confidence_score == 0.95
    assert existing_link.source == "model"
    db.add.assert_not_called()
