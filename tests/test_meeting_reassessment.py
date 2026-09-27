from datetime import datetime, timezone
from types import SimpleNamespace
import json

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles

from app import models
from app.services import meeting_intelligence_service as service
from app.services import meeting_task_extraction_service as tasks
from app.services.meeting_resolution_contract import canonical_people, resolution_schema, validate_catalog_choices


@compiles(JSONB, "sqlite")
def _sqlite_json(_type, _compiler, **_kw):
    return "JSON"


@pytest.fixture
def db():
    engine = create_engine("sqlite://")
    names = ["User", "JourneyPerson", "JourneyGoal", "JourneyProject", "Meeting", "MeetingParticipant",
             "MeetingTranscriptSegment", "MeetingTopic", "MeetingDecision", "MeetingActionItem",
             "MeetingLeadershipObservation", "MeetingLeadershipDomainAssessment", "MeetingGoalLink",
             "MeetingProjectLink", "MeetingEnrichmentSuggestion"]
    for name in names:
        getattr(models, name).__table__.create(engine)
    with Session(engine) as session:
        yield session
    engine.dispose()


def test_reassessment_refreshes_facts_preserving_handled_actions_and_links(db):
    meeting = models.Meeting(user_number="test", title="Review", source_type="notes", processing_status="ready",
                             executive_summary="Old summary", one_line_summary="Old short")
    db.add(meeting)
    db.flush()
    handled = models.MeetingActionItem(meeting_id=meeting.id, description="Circulate the slides",
                                      evidence_excerpt="I will circulate the slides", created_task_id=123)
    ignored = models.MeetingActionItem(meeting_id=meeting.id, description="Old ignored action", ignored_at=datetime.now(timezone.utc))
    stale = models.MeetingActionItem(meeting_id=meeting.id, description="Unconfirmed old extraction")
    db.add_all([handled, ignored, stale, models.MeetingDecision(meeting_id=meeting.id, description="Old decision")])
    db.commit()
    handled_id, ignored_id = handled.id, ignored.id
    analysis = {"executive_summary": "New grounded summary", "one_line_summary": "New short", "decisions": [
        {"description": "Act as advisor", "evidence_excerpt": "We will consider you an advisor", "confidence": .9}],
        "action_items": [{"description": "Send presentation slides", "evidence_excerpt": "I will circulate the slides", "confidence": .9},
                         {"description": "Review the proposal", "evidence_excerpt": "Please review the proposal", "confidence": .9}]}
    for _ in range(2):
        service._save_context_reassessment(db, meeting.id, analysis, {}, {})
        db.commit()
        db.expire_all()
    assert db.get(models.Meeting, meeting.id).executive_summary == "New grounded summary"
    assert db.query(models.MeetingDecision).count() == 1
    assert db.query(models.MeetingActionItem).count() == 3
    assert db.get(models.MeetingActionItem, handled_id).created_task_id == 123
    assert db.get(models.MeetingActionItem, ignored_id).ignored_at is not None
    assert db.query(models.MeetingActionItem).filter_by(description="Review the proposal").count() == 1


def test_empty_reassessment_cannot_erase_existing_summary(db):
    meeting = models.Meeting(user_number="test", title="Review", source_type="notes", executive_summary="Keep me")
    db.add(meeting)
    db.commit()
    with pytest.raises(ValueError, match="no executive summary"):
        service._save_context_reassessment(db, meeting.id, {}, {}, {})
    assert meeting.executive_summary == "Keep me"


def test_only_actual_speaker_labels_survive_and_self_is_unique():
    people = [{"speaker_label": "self", "status": "self"}, {"speaker_label": "unknown", "status": "unknown"},
              {"speaker_label": "Speaker A", "status": "existing", "name": "Matt", "id": 7},
              {"speaker_label": "A", "status": "unknown"}, {"speaker_label": "Me", "status": "unknown"}]
    result = canonical_people(people, ["A", "Me"])
    assert [(r["speaker_label"], r["status"]) for r in result] == [("A", "existing"), ("Me", "self")]


def test_wrong_id_cannot_silently_become_a_different_project():
    catalog = {"projects": [{"id": 99, "title": "Data onboarding"}, {"id": 314, "title": "Client proposal"}]}
    result = validate_catalog_choices({"primary_project": {"status": "existing", "id": 99, "name": "Client proposal",
                                     "evidence_excerpt": "We are preparing the client proposal"}}, catalog,
                                     "A: We are preparing the client proposal")
    assert result["primary_project"]["status"] == "none"


def test_fabricated_evidence_cannot_support_a_catalog_match():
    catalog = {"people": [{"id": 7, "name": "Matt"}]}
    result = validate_catalog_choices({"people": [{"status": "existing", "id": 7, "name": "Matt",
                                      "evidence_excerpt": "Hi Matt, let's talk"}]}, catalog, "A: Hi everyone")
    assert result["people"][0]["status"] == "unknown"


def test_schema_constrains_ids_and_speaker_labels_to_actual_candidates():
    schema = resolution_schema({"projects": [{"id": 314, "title": "Client proposal"}]}, ["A", "Me"])
    assert schema["properties"]["primary_project"]["properties"]["id"]["enum"] == [None, 314]
    assert schema["properties"]["people"]["items"]["properties"]["speaker_label"]["enum"] == ["A", "Me"]


def test_catalog_budget_does_not_drop_older_candidate_identities():
    rows = [{"id": i, "name": f"Person {i}", "context": "verbose " * 200} for i in range(30)]
    assert [r["id"] for r in service._bounded_catalog_items(rows, 3000)] == list(range(30))


def test_task_prompt_uses_meeting_date_and_filters_invented_evidence(monkeypatch):
    captured = {}
    def complete(**kwargs):
        captured.update(kwargs)
        payload = {"action_items": [{"description": "Call on Wednesday", "owner_name": None, "due_date": "2026-09-23",
                    "confidence": .9, "evidence_excerpt": "I will call on Wednesday"},
                   {"description": "Invented action", "confidence": .9, "evidence_excerpt": "I will do something invented"}]}
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps(payload)))])
    monkeypatch.setattr(tasks.client.chat.completions, "create", complete)
    result = tasks.extract_action_items("A: I will call on Wednesday", {"meeting_date": "2026-09-18"})
    assert "Meeting date: 2026-09-18" in captured["messages"][1]["content"]
    assert len(result["action_items"]) == 1


def test_noop_enrichment_is_not_proposed():
    result = service._validated_entity_enrichments([{"entity_type": "project", "target_id": 3, "confidence": .9,
             "changes": [{"field": "status", "current_value": "active", "proposed_value": "active"}]}],
             {"project": {"id": 3}})
    assert result == []


def test_evidence_ignores_diarization_metadata_without_allowing_invented_words():
    from app.services.meeting_resolution_contract import grounded
    transcript = "A: We need a platform\nA: blueprint for tenant management."
    assert grounded("We need a platform blueprint for tenant management", transcript)
    assert not grounded("We need a customer onboarding blueprint", transcript)


def test_resolution_confidence_uses_decimal_scale():
    schema = resolution_schema({}, ["Me", "A"])
    confidence = schema["properties"]["primary_project"]["properties"]["confidence"]
    assert confidence["minimum"] == 0
    assert confidence["maximum"] == 1
    assert not service._is_real_person_name("Unidentified (possible technical contributor)", "C")


def test_source_references_materialize_verbatim_quotes_and_reject_invalid_ids():
    from app.services.meeting_resolution_contract import sourced_evidence
    transcript = "Me: Hey Matt, how are you?\nA: Very stressed.\nMe: Tell me more."
    result = sourced_evidence({"evidence_line_ids": [1, 2], "evidence_excerpt": "paraphrase"}, transcript)
    assert result["evidence_excerpt"] == "Me: Hey Matt, how are you?\nA: Very stressed."
    assert sourced_evidence({"evidence_line_ids": [0]}, transcript)["evidence_excerpt"] == ""
    assert sourced_evidence({"evidence_line_ids": [99]}, transcript)["evidence_excerpt"] == ""
