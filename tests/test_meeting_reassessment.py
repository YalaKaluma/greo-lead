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
             "MeetingProjectLink", "MeetingEnrichmentSuggestion", "MeetingAttendee", "MeetingContextNote"]
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
    assert schema["properties"]["people"]["items"]["properties"]["speaker_label"]["enum"] == ["A", "Me", "Unattributed attendee"]


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
    assert validate_due_date({**item, "due_date_evidence_line_ids": [1]}, "Me: Je le partage demain.")["due_date"] == "2026-09-18"


def test_group_request_is_not_automatically_owned_by_user():
    from app.services.meeting_review_service import supported_self_owner, commitment_windows
    assert supported_self_owner({"owner_name": "Me", "evidence_excerpt": "C: Drop me some bullet points."})["owner_name"] is None
    assert supported_self_owner({"owner_name": "Me", "evidence_excerpt": "Me: I will send them."})["owner_name"] == "Me"
    source = "A: Background.\nMe: Je vais le partager demain.\nA: Merci."
    assert "[2] Me: Je vais le partager demain." in commitment_windows(source)


def test_linking_passes_run_before_catalog_validation(monkeypatch):
    calls = []
    def complete(**kwargs):
        calls.append(kwargs)
        payload = {"people": [{"status": "existing", "id": 7,
            "name": "Matt", "speaker_label": "A", "evidence_line_ids": [1]}]}
        if len(calls) == 2:
            payload = {"primary_project": {"status": "none"}, "additional_projects": []}
        elif len(calls) == 3:
            payload = {"primary_goal": {"status": "none"}}
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps(payload)))])
    monkeypatch.setattr(service.client.chat.completions, "create", complete)
    result = service.resolve_meeting_context("Me: Hey Matt, how are you?\nA: Good thanks.", None, None,
        json.dumps({"people": [{"id": 7, "name": "Matt"}]}))
    assert len(calls) == 3
    assert any(person.get("id") == 7 for person in result["people"])


@pytest.mark.parametrize("excerpt,expected", [
    ("Me: What do you think would be the right next step?", None),
    ("Me: On peut faire quelques tests Marwan.", None),
    ("Me: Je propose le refresh.\nA: Pas de soucis, on peut faire ça.", None),
    ("Me: Je vais fixer un autre rendez-vous.", "Me"),
    ("Me: Je vais peut-être demander un autre format.", None),
    ("Me: Let me adjust that wording.", "Me"),
    ("Me: Happy to prepare a demo for Monday.", "Me"),
    ("Me: Je peux l'enlever aujourd'hui.", "Me"),
])
def test_self_ownership_requires_commitment_not_merely_self_speech(excerpt, expected):
    from app.services.meeting_review_service import supported_self_owner
    assert supported_self_owner({"owner_name": "Me", "evidence_excerpt": excerpt})["owner_name"] == expected


def test_role_similarity_alone_cannot_identify_person():
    catalog = {"people": [{"id": 7, "name": "Niko"}]}
    person = {"status": "existing", "id": 7, "name": "Niko", "speaker_label": "A", "evidence_line_ids": [1]}
    result = validate_catalog_choices({"people": [person]}, catalog, "A: Here are the vendor estimates.")
    assert result["people"][0]["status"] == "unknown"
    assert result["people"][0]["validation_reason"] == "missing_identity_anchor"
    person = {**person, "status": "existing", "id": 7}
    result = validate_catalog_choices({"people": [person]}, catalog, "Me: Thanks Niko for those estimates.")
    assert result["people"][0]["status"] == "existing"


def test_resolution_overrides_independent_participant_guesses_and_clears_stale_names(db):
    meeting = models.Meeting(user_number="test", title="Review", source_type="notes")
    db.add(meeting)
    db.flush()
    stale = models.MeetingParticipant(meeting_id=meeting.id, speaker_label="A", display_name="Wrong guess")
    confirmed = models.MeetingParticipant(meeting_id=meeting.id, speaker_label="B", display_name="Confirmed person", person_id=17)
    db.add_all([stale, confirmed])
    db.flush()
    resolution = {"people": [{"speaker_label": "A", "status": "unknown", "name": "Wrong guess"},
                             {"speaker_label": "B", "status": "unknown"}]}
    analysis = {"participants": [{"speaker_label": "A", "display_name": "Another guess"}],
                **service._resolution_to_analysis(resolution), "meeting_resolution": resolution}
    service._replace_analysis(db, meeting, analysis)
    db.flush()
    assert stale.display_name == "A"
    assert confirmed.display_name == "Confirmed person"


def test_multiple_resolved_people_share_label_without_losing_names():
    resolution = {"people": [{"speaker_label": "A", "status": "existing", "id": 1, "name": "Alex"},
                             {"speaker_label": "A", "status": "new", "name": "Morgan"}]}
    assert service._resolution_to_analysis(resolution)["participants"] == [
        {"speaker_label": "A", "display_name": "Alex / Morgan"}]


def test_mentioned_person_is_not_an_attendee_even_with_real_quote():
    source = "Me: We should consult Alex tomorrow about the project."
    resolved = validate_catalog_choices({"people": [{"status": "existing", "id": 1, "name": "Alex",
        "speaker_label": "A", "attendance_basis": "mentioned", "evidence_line_ids": [1]}]},
        {"people": [{"id": 1, "name": "Alex"}]}, source)
    assert resolved["people"] == []
    assert resolved["mentioned_people"][0]["status"] == "existing"
    assert resolved["mentioned_people"][0]["speaker_label"] == ""


def test_short_naming_turn_in_sparse_source_evidence_remains_grounded():
    from app.services.meeting_resolution_contract import sourced_evidence, grounded
    source = "Me: Morgan.\nA: Yes.\nMe: Thanks for joining our review."
    item = sourced_evidence({"evidence_line_ids": [1, 3]}, source)
    assert grounded(item["evidence_excerpt"], source)


def test_new_project_approval_persists_reviewed_intelligence_and_link(db):
    from app.routers.meetings import _accept_meeting_suggestion
    meeting = models.Meeting(user_number="test", title="Review", source_type="notes")
    db.add(meeting)
    db.flush()
    suggestion = models.MeetingEnrichmentSuggestion(meeting_id=meeting.id, suggestion_type="project",
        action="create", title="Client systems", description="Proposed roadmap", status="pending",
        fingerprint="synthetic-new-project", payload={"changes": [
            {"field": "role", "operation": "append", "current_value": None,
             "proposed_value": "Advisor, half a day weekly; not delivery lead."},
            {"field": "risks", "operation": "append", "current_value": None,
             "proposed_value": "Budget not approved."}]})
    db.add(suggestion)
    db.flush()
    assert db.query(models.JourneyProject).count() == 0
    _accept_meeting_suggestion(db, meeting, suggestion)
    db.flush()
    project = db.get(models.JourneyProject, suggestion.target_id)
    assert project.role == "Advisor, half a day weekly; not delivery lead."
    assert project.risks == ["Budget not approved."]
    assert db.query(models.MeetingProjectLink).filter_by(project_id=project.id, meeting_id=meeting.id).count() == 1


def test_list_names_use_same_resolution_as_context_including_shared_labels(db):
    from app.routers.meetings import _meeting_payload
    meeting = models.Meeting(user_number="test", title="Review", source_type="notes", context_receipt={
        "meeting_resolution": {"people": [{"speaker_label": "A", "status": "existing", "name": "Alex"},
            {"speaker_label": "A", "status": "new", "name": "Morgan"},
            {"speaker_label": "B", "status": "unknown", "name": "Old guess"}]}})
    db.add(meeting)
    db.flush()
    db.add(models.MeetingParticipant(meeting_id=meeting.id, speaker_label="A", display_name="Stale name"))
    db.flush()
    assert _meeting_payload(meeting)["participant_names"] == ["Alex", "Morgan", "B"]


def test_mentioned_identity_survives_validation_without_attendance(db):
    person = models.JourneyPerson(user_number='test', name='Alex')
    meeting = models.Meeting(user_number='test', title='Review', source_type='notes')
    db.add_all([person, meeting])
    db.flush()
    source = 'Me: We should consult Alex tomorrow about the project.'
    resolution = validate_catalog_choices({'people': [{'status': 'existing', 'id': person.id,
        'name': 'Alex', 'speaker_label': 'Me', 'attendance_basis': 'mentioned',
        'confidence': .95, 'runner_up_confidence': 0, 'evidence_line_ids': [1]}]},
        {'people': [{'id': person.id, 'name': 'Alex'}]}, source)
    validated = service._validated_resolution_context(db, 'test', resolution, source)['resolution']
    assert validated['mentioned_people'][0]['id'] == person.id
    analysis = service._resolution_to_analysis(validated)
    assert analysis['participants'] == [{'speaker_label': 'Me', 'display_name': 'Me'}]
    suggestion = next(s for s in service._analysis_suggestions(meeting, analysis) if s['suggestion_type'] == 'person')
    from app.routers.meetings import _accept_meeting_suggestion
    _accept_meeting_suggestion(db, meeting, models.MeetingEnrichmentSuggestion(
        meeting_id=meeting.id, suggestion_type='person', action='link', target_id=person.id,
        payload=suggestion))
    assert db.query(models.MeetingAttendee).count() == 0
    assert db.query(models.MeetingParticipant).count() == 0


def test_correlated_name_variant_can_match_but_close_runner_up_cannot():
    source = 'Me: Hello Alexx, can you explain the cloud design?\nA: Yes, let us review it.'
    def resolve(margin):
        return validate_catalog_choices({'people': [{'status': 'existing', 'id': 1, 'name': 'Alex',
            'observed_name': 'Alexx', 'speaker_label': 'A', 'attendance_basis': 'direct_address',
            'confidence': .95, 'runner_up_confidence': margin, 'evidence_line_ids': [1, 2]}]},
            {'people': [{'id': 1, 'name': 'Alex'}]}, source)['people'][0]
    assert resolve(.1)['status'] == 'existing'
    assert resolve(.9)['status'] == 'unknown'


def test_phase_one_resolves_goal_after_projects_without_rewriting_people():
    from app.services.meeting_linking_service import resolve_links
    calls = []
    outputs = [{'people': [{'status': 'unknown', 'speaker_label': 'A'}]},
               {'primary_project': {'status': 'existing', 'id': 4, 'name': 'Atlas'}, 'additional_projects': []},
               {'primary_goal': {'status': 'existing', 'id': 7, 'title': 'Grow product'}}]
    def complete(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps(outputs[len(calls)-1])))])
    fake = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=complete)))
    result = resolve_links(fake, 'test', 'A: Let us review Atlas.', {}, ['A'])
    assert result['people'] == outputs[0]['people']
    assert 'resolved_projects' in calls[2]['messages'][1]['content']
    assert 'Atlas' in calls[2]['messages'][1]['content']
    assert [c['response_format']['json_schema']['name'] for c in calls] == [
        'meeting_people_links', 'meeting_project_boundaries', 'meeting_goal_link']


def test_attendee_without_reliable_speaker_mapping_is_retained():
    people = canonical_people([{"status": "new", "name": "Morgan", "speaker_label": "Unattributed attendee"}], ["Me", "A"])
    identified = next(p for p in people if p.get("name") == "Morgan")
    assert identified["shared_speaker_label"] is True
    assert identified["status"] == "new"


def test_hypothetical_named_example_never_becomes_person_link():
    resolved = validate_catalog_choices({"people": [{"name": "Alex", "status": "existing", "id": 1,
        "attendance_basis": "mentioned", "identity_basis": "hypothetical", "evidence_line_ids": [1]}]},
        {"people": [{"name": "Alex", "id": 1}]}, "Me: Imagine somebody named Alex making a scenario.")
    assert resolved["people"] == []
    assert resolved["mentioned_people"] == []


def test_duplicate_person_suggestions_in_one_result_are_saved_once(db):
    meeting = models.Meeting(user_number="test", title="Review", source_type="notes")
    person = models.JourneyPerson(user_number="test", name="Alex")
    db.add_all([meeting, person])
    db.flush()
    item = {"person_id": person.id, "speaker_label": "", "attendance_basis": "mentioned",
            "confidence": .95, "runner_up_confidence": 0, "evidence_excerpt": "We will consult Alex."}
    service._store_pending_enrichment_suggestions(db, meeting, {"suggested_person_matches": [item, dict(item)]})
    db.flush()
    assert db.query(models.MeetingEnrichmentSuggestion).count() == 1


def test_entity_only_pipeline_never_calls_full_assessment(monkeypatch):
    from unittest.mock import Mock
    snapshot = {'transcript': 'Me: Review the product.', 'title': 'Review',
                'supplied_context': '', 'matching_context': '{}', 'user_number': 'test'}
    resolution = {'people': [], 'primary_goal': {'status': 'none'}, 'primary_project': {'status': 'none'}}
    monkeypatch.setattr(service, '_with_fresh_session', lambda fn, *args, **kwargs: fn(None))
    start = Mock(return_value=snapshot)
    monkeypatch.setattr(service, '_start_processing', start)
    monkeypatch.setattr(service, 'resolve_meeting_context', Mock(return_value=resolution))
    monkeypatch.setattr(service, '_validated_resolution_context', Mock(return_value={'resolution': resolution}))
    save = Mock()
    monkeypatch.setattr(service, '_save_entity_assessment', save)
    forbidden = []
    for name in ['analyze_transcript', 'extract_action_items', 'analyze_leadership_feedback',
                 '_enrich_resolved_analysis', '_sync_meeting_memory', 'get_twin_context']:
        fn = Mock(side_effect=AssertionError(name + ' must not run'))
        forbidden.append(fn)
        monkeypatch.setattr(service, name, fn)
    failed = Mock()
    monkeypatch.setattr(service, '_mark_processing_failed', failed)
    service.reassess_meeting_entities(42)
    start.assert_called_once_with(None, 42, entities_only=True)
    save.assert_called_once_with(None, 42, resolution)
    failed.assert_not_called()
    for fn in forbidden:
        fn.assert_not_called()


def test_entity_only_save_preserves_other_outputs_and_review_history(db):
    meeting = models.Meeting(user_number='test', title='Keep title', source_type='notes',
        executive_summary='Keep summary', meeting_type='Keep type', processing_status='analyzing',
        context_receipt={'meeting_flags': ['keep'], 'provisional_context': [{'type': 'person_update', 'title': 'Keep intelligence'}]})
    db.add(meeting); db.flush()
    topic = models.MeetingTopic(meeting_id=meeting.id, title='Keep topic', sequence_number=0)
    decision = models.MeetingDecision(meeting_id=meeting.id, description='Keep decision')
    action = models.MeetingActionItem(meeting_id=meeting.id, description='Keep action')
    db.add_all([topic, decision, action])
    for kind, status, fingerprint, action_type in [('project', 'pending', 'old-link', 'create'),
            ('project_update', 'pending', 'keep-update', 'update'), ('person', 'accepted', 'keep-reviewed', 'create')]:
        db.add(models.MeetingEnrichmentSuggestion(meeting_id=meeting.id, suggestion_type=kind,
            action=action_type, title=fingerprint, fingerprint=fingerprint, status=status))
    db.commit()
    resolution = {'people': [], 'primary_goal': {'status': 'none'}, 'primary_project': {
        'status': 'new', 'name': 'New initiative', 'description': 'New initiative scope',
        'confidence': .95, 'evidence_excerpt': 'We will build this initiative.'}}
    service._save_entity_assessment(db, meeting.id, resolution)
    db.commit(); db.refresh(meeting)
    assert (meeting.title, meeting.executive_summary, meeting.meeting_type) == ('Keep title', 'Keep summary', 'Keep type')
    assert db.query(models.MeetingTopic).one().id == topic.id
    assert db.query(models.MeetingDecision).one().id == decision.id
    assert db.query(models.MeetingActionItem).one().id == action.id
    rows = db.query(models.MeetingEnrichmentSuggestion).all()
    assert {r.title for r in rows} == {'keep-update', 'keep-reviewed', 'New initiative'}
    assert meeting.context_receipt['meeting_flags'] == ['keep']
    assert meeting.context_receipt['provisional_context'][0]['title'] == 'Keep intelligence'
    assert meeting.processing_status == 'ready'


def test_entity_snapshot_skips_longitudinal_tables_and_twin(db, monkeypatch):
    # Fixture intentionally has no journal/leadership/twin tables: querying them would fail.
    from unittest.mock import Mock
    user = models.User(name='Test', phone_number='test', email='test@example.com')
    meeting = models.Meeting(user_number='test', title='Review', source_type='notes',
        transcript_text='Me: Review the product.', user_notes='Use the existing product goal.')
    db.add_all([user, meeting]); db.commit()
    twin = Mock(side_effect=AssertionError('No twin lookup'))
    monkeypatch.setattr(service, 'get_twin_context', twin)
    snapshot = service._start_processing(db, meeting.id, entities_only=True)
    assert snapshot['leadership_context'] == ''
    assert 'Use the existing product goal.' in snapshot['supplied_context']
    assert set(json.loads(snapshot['matching_context'])) == {'current_user', 'people', 'goals', 'projects'}
    twin.assert_not_called()


def test_explicit_project_goal_fallback_is_grounded_and_unambiguous():
    from app.services.meeting_linking_service import _explicit_project_goal_links
    source = 'Me: Let us improve the reusable onboarding module.'
    project = {'status': 'existing', 'id': 8, 'name': 'Product onboarding', 'confidence': .95,
               'runner_up_confidence': .1, 'evidence_line_ids': [1]}
    catalog = {'projects': [{'id': 8, 'title': 'Product onboarding', 'goal': 'Grow the product'}],
               'goals': [{'id': 12, 'title': 'Grow the product'}]}
    links = _explicit_project_goal_links({'primary_project': project}, catalog, source)
    assert len(links) == 1 and links[0]['id'] == 12
    assert links[0]['evidence_excerpt'] == source
    assert _explicit_project_goal_links({'primary_project': {**project, 'evidence_line_ids': [99]}}, catalog, source) == []
    catalog['projects'][0]['goal'] = 'Unrelated consulting outcome'
    assert _explicit_project_goal_links({'primary_project': project}, catalog, source) == []


def test_entities_route_queues_only_entity_job_and_rejects_other_users(db):
    from fastapi import BackgroundTasks, HTTPException
    from app.routers.meetings import create_leadership_assessment, reassess_meeting_entities
    meeting = models.Meeting(user_number='test', title='Review', source_type='notes',
        processing_status='ready', transcript_text='Me: Review.')
    db.add(meeting); db.commit()
    with pytest.raises(HTTPException) as exc:
        create_leadership_assessment(meeting.id, BackgroundTasks(), scope='entities', user_number='other', db=db)
    assert exc.value.status_code == 404
    tasks = BackgroundTasks()
    result = create_leadership_assessment(meeting.id, tasks, scope='entities', user_number='test', db=db)
    assert result['scope'] == 'entities'
    assert len(tasks.tasks) == 1 and tasks.tasks[0].func is reassess_meeting_entities
    assert meeting.context_receipt['active_assessment_scope'] == 'entities'
    with pytest.raises(HTTPException) as exc:
        create_leadership_assessment(meeting.id, BackgroundTasks(), scope='entities', user_number='test', db=db)
    assert exc.value.status_code == 409


@pytest.mark.parametrize("summary", ["Keep summary", None])
def test_entity_failure_retry_keeps_entity_scope(db, summary):
    from fastapi import BackgroundTasks
    from app.routers.meetings import retry_meeting, reassess_meeting_entities
    meeting = models.Meeting(user_number='test', title='Review', source_type='notes',
        processing_status='failed', transcript_text='Me: Review.', executive_summary=summary,
        context_receipt={'active_assessment_scope': 'entities'})
    db.add(meeting); db.commit()
    background = BackgroundTasks()
    retry_meeting(meeting.id, background, 'test', db)
    assert len(background.tasks) == 1 and background.tasks[0].func is reassess_meeting_entities


def test_goal_pass_recovers_explicit_project_link_without_extra_model_call():
    from app.services.meeting_linking_service import resolve_links
    catalog = {'projects': [{'id': 8, 'title': 'Product onboarding', 'goal': 'Grow the product'}],
               'goals': [{'id': 12, 'title': 'Grow the product'}]}
    outputs = [{'people': []}, {'primary_project': {'status': 'existing', 'id': 8,
        'name': 'Product onboarding', 'confidence': .95, 'runner_up_confidence': .1,
        'evidence_line_ids': [1]}, 'additional_projects': []}, {'primary_goal': {'status': 'none'}}]
    calls = []
    def complete(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps(outputs[len(calls)-1])))])
    fake = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=complete)))
    result = resolve_links(fake, 'test', 'Me: Improve the reusable onboarding module.', catalog, ['Me'],
                           'Product roadmap', 'Link relevant work to the product goal.')
    assert result['primary_goal']['id'] == 12
    assert len(calls) == 3
    assert 'Link relevant work to the product goal.' in calls[1]['messages'][1]['content']
    props = calls[1]['response_format']['json_schema']['schema']['properties']['primary_project']['properties']
    assert props['closest_existing_id']['enum'] == [None, 8]
    assert 'existing_candidate_rejection_reason' in props
    assert 'explicit_project_goal_links' in calls[2]['messages'][1]['content']


def test_conflicting_explicit_project_goals_do_not_force_a_choice():
    from app.services.meeting_linking_service import _explicit_project_goal_links
    catalog = {'projects': [{'id': 8, 'title': 'Onboarding', 'goal': 'Grow product'},
                            {'id': 9, 'title': 'Consulting', 'goal': 'Grow consulting'}],
               'goals': [{'id': 12, 'title': 'Grow product'}, {'id': 13, 'title': 'Grow consulting'}]}
    def project(i, name):
        return {'id': i, 'name': name, 'status': 'existing', 'confidence': .95,
                'runner_up_confidence': .1, 'evidence_line_ids': [1]}
    links = _explicit_project_goal_links({'primary_project': project(8, 'Onboarding'),
        'additional_projects': [project(9, 'Consulting')]}, catalog, 'Me: Review onboarding and consulting.')
    assert {item['id'] for item in links} == {12, 13}  # no unique fallback exists
