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
             "MeetingProjectLink", "MeetingEnrichmentSuggestion", "MeetingAttendee"]
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


def test_two_people_sharing_one_label_are_not_collapsed():
    result = canonical_people([{"speaker_label": "A", "status": "new", "name": "Joost"},
                               {"speaker_label": "A", "status": "new", "name": "Mark"}], ["Me", "A"])
    assert {r.get("name") for r in result} == {"Me", "Joost", "Mark"}
    assert all(r["shared_speaker_label"] for r in result if r["speaker_label"] == "A")


def test_speaker_annotation_does_not_reject_correct_matt_identity():
    result = validate_catalog_choices({"people": [{"status": "existing", "speaker_label": "A", "id": 7,
        "name": "Matt (A)", "evidence_line_ids": [1]}]}, {"people": [{"id": 7, "name": "Matt"}]},
        "Me: Hey Matt, how are you?")
    assert result["people"][0]["status"] == "existing"
    assert result["people"][0]["name"] == "Matt"


def test_existing_david_name_cannot_be_proposed_as_duplicate():
    result = validate_catalog_choices({"people": [{"status": "new", "speaker_label": "B", "name": "David",
        "evidence_line_ids": [1]}]}, {"people": [{"id": 8, "name": "David", "role": "Product Manager"}]},
        "Me: David, please explain the tenant architecture")
    assert result["people"][0]["status"] == "unknown"
    assert result["people"][0]["validation_reason"] == "existing_name_requires_review"


def test_multiple_client_projects_reach_the_approval_queue():
    result = service._resolution_to_analysis({"primary_project": {"status": "new", "name": "SAB discovery"},
                                             "additional_projects": [{"status": "new", "name": "RCL proposal"}]})
    assert [r["name"] for r in result["new_projects"]] == ["SAB discovery", "RCL proposal"]


def test_shared_label_approval_preserves_speaker_and_adds_attendee(db):
    from app.routers.meetings import _accept_meeting_suggestion
    meeting = models.Meeting(user_number="test", title="Mixed", source_type="notes")
    person = models.JourneyPerson(user_number="test", name="Mark")
    db.add_all([meeting, person]); db.flush()
    participant = models.MeetingParticipant(meeting_id=meeting.id, speaker_label="A", display_name="Mixed speakers")
    db.add(participant); db.flush()
    suggestion = models.MeetingEnrichmentSuggestion(meeting_id=meeting.id, suggestion_type="person", action="link",
        target_id=person.id, speaker_label="A", title="Mark", payload={"shared_speaker_label": True})
    _accept_meeting_suggestion(db, meeting, suggestion)
    db.flush()
    assert participant.person_id is None
    assert db.query(models.MeetingAttendee).filter_by(meeting_id=meeting.id, person_id=person.id).count() == 1


def test_coverage_review_recovers_omitted_action_and_explicit_self_owner(monkeypatch):
    responses = iter([{"action_items": []}, {"action_items": [{"description": "Adjust the certification wording",
        "owner_name": None, "due_date": None, "confidence": .95, "evidence_line_ids": [1]}]}])
    def complete(**_kwargs):
        assert "json" in " ".join(m["content"] for m in _kwargs["messages"]).lower()
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps(next(responses))))])
    monkeypatch.setattr(tasks.client.chat.completions, "create", complete)
    result = tasks.extract_action_items("Me: Let me adjust that wording.", {"meeting_date": "2026-09-18"})
    assert result["action_items"][0]["owner_name"] == "Me"
    assert result["action_items"][0]["evidence_excerpt"] == "Me: Let me adjust that wording."


def test_coaching_review_rejects_other_speaker_only_evidence(monkeypatch):
    from app.services.meeting_review_service import review_coaching
    def complete(**_kwargs):
        assert "json" in " ".join(m["content"] for m in _kwargs["messages"]).lower()
        payload = {"domain_assessments": [{"domain": "People", "score": 5, "feedback": "Claim",
                    "evidence_line_ids": [1]}], "profile_suggestions": [{"title": "Claim", "evidence_line_ids": [1]}]}
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps(payload)))])
    monkeypatch.setattr(service.client.chat.completions, "create", complete)
    result = review_coaching(service.client, "test", "A: I will make time for this.\nMe: Thank you.", {}, {})
    assert result["domain_assessments"][0]["score"] is None
    assert result["profile_suggestions"] == []


def test_retry_existing_analysis_uses_preserving_reassessment(db):
    from fastapi import BackgroundTasks
    from app.routers.meetings import retry_meeting
    meeting = models.Meeting(user_number="test", title="Retry", source_type="notes", processing_status="failed",
                             transcript_text="Me: Let me adjust that", executive_summary="Existing summary")
    db.add(meeting); db.commit()
    background = BackgroundTasks()
    retry_meeting(meeting.id, background, "test", db)
    assert background.tasks[0].func is service.reassess_meeting_with_context
    assert db.get(models.Meeting, meeting.id).executive_summary == "Existing summary"


def test_sparse_evidence_does_not_include_unrelated_turns():
    from app.services.meeting_resolution_contract import sourced_evidence, grounded
    transcript = "Me: I will share the deck.\nA: Unrelated private discussion.\nMe: On Friday."
    quote = sourced_evidence({"evidence_line_ids": [1, 3]}, transcript)["evidence_excerpt"]
    assert "Unrelated" not in quote
    assert "[…]" in quote
    assert grounded(quote, transcript)
    assert not grounded(quote + " fabricated", transcript)


def test_task_deadline_requires_temporal_source_evidence():
    from app.services.meeting_task_extraction_service import validate_due_date
    transcript = "Me: Let me adjust that wording.\nMe: I will send it on Wednesday."
    item = {"due_date": "2026-09-18"}
    assert validate_due_date(item, transcript)["due_date"] is None
    assert validate_due_date({**item, "due_date_evidence_line_ids": [1]}, transcript)["due_date"] is None
    assert validate_due_date({**item, "due_date": "2026-09-23", "due_date_evidence_line_ids": [2]}, transcript)["due_date"] == "2026-09-23"
    assert validate_due_date({**item, "due_date_evidence_line_ids": [99]}, transcript)["due_date"] is None
