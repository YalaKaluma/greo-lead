from types import SimpleNamespace

from app.services.meeting_entity_intelligence_service import extract_entity_intelligence
from app.services.meeting_intelligence_service import _validated_entity_enrichments


def test_no_resolved_targets_skips_generation():
    assert extract_entity_intelligence(None, "unused", "A: Hello", {}) == []


def test_enrichment_call_receives_full_numbered_source_and_secondary_projects():
    calls = []

    def create(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(
            content='{"entity_enrichments": []}'))])

    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    context = {"projects": [{"id": 42, "name": "Shared platform"}]}
    assert extract_entity_intelligence(client, "model", "A: First\nMe: Final", context, "2026-01-10") == []
    content = calls[0]["messages"][1]["content"]
    assert "[1] A: First" in content and "[2] Me: Final" in content
    assert '"id": 42' in content and "2026-01-10" in content


def _proposal(**change):
    return {"entity_type": "project", "target_id": 42, "confidence": .9, "changes": [{
        "field": "risks", "operation": "append", "current_value": None,
        "proposed_value": "Recovery wording remains unresolved.", "evidence_line_ids": [1], **change}]}


def test_secondary_project_enrichment_uses_source_lines_not_model_quote():
    context = {"projects": [{"id": 42, "risks": None}]}
    source = "Me: We still need to agree recovery wording."
    result = _validated_entity_enrichments([_proposal(evidence_excerpt="invented")], context, source)
    assert result[0]["changes"][0]["evidence_excerpt"] == source


def test_enrichment_rejects_invalid_source_target_field_and_stale_value():
    context = {"projects": [{"id": 42, "risks": None}]}
    source = "Me: We still need to agree recovery wording."
    invalid = [
        _proposal(evidence_line_ids=[99]), _proposal(field="password"),
        _proposal(current_value="Unobserved old data"), _proposal(operation="delete"),
        _proposal(proposed_value=""),
        _proposal(field="status", proposed_value="signed"),
        {**_proposal(), "target_id": 999},
        {**_proposal(), "entity_type": "person"},
    ]
    assert _validated_entity_enrichments(invalid, context, source) == []


def test_identical_record_value_is_not_proposed_again():
    context = {"projects": [{"id": 42, "risks": "Recovery wording remains unresolved."}]}
    item = _proposal(current_value="Recovery wording remains unresolved.")
    assert _validated_entity_enrichments([item], context, "Me: Recovery remains unresolved.") == []


def test_pending_project_is_enriched_without_creating_a_database_identity(monkeypatch):
    from app.services import meeting_intelligence_service as service
    source = "Me: I can advise half a day per week, not lead delivery."
    proposal = {"entity_type": "project", "target_id": None, "candidate_key": "new-project-0",
                "confidence": .95, "changes": [{"field": "role", "operation": "append",
                "current_value": None, "proposed_value": "Advisor, half a day weekly; not delivery lead.",
                "evidence_line_ids": [1]}]}
    monkeypatch.setattr(service, "extract_entity_intelligence", lambda *args: [proposal])
    monkeypatch.setattr(service, "review_entity_intelligence", lambda *args: args[-1])
    analysis = {"new_projects": [{"name": "Client systems", "description": "Proposed roadmap"}]}
    assert service._enrich_resolved_analysis(analysis, {}, source, "2026-01-01") == []
    assert analysis["new_projects"][0]["changes"][0]["field"] == "role"
    assert "id" not in analysis["new_projects"][0]


def test_pending_project_rejects_unknown_key_and_fabricated_source():
    context = {"proposed_projects": [{"candidate_key": "new-project-0", "name": "Client systems"}]}
    proposal = {**_proposal(), "target_id": None, "candidate_key": "new-project-0"}
    assert len(_validated_entity_enrichments([proposal], context, "Me: Recovery wording remains unresolved.")) == 1
    assert _validated_entity_enrichments([{**proposal, "candidate_key": "new-project-999"}], context, "Me: Recovery wording remains unresolved.") == []


def test_semantic_review_cannot_retarget_a_change():
    from app.services.meeting_entity_intelligence_service import review_entity_intelligence
    def create(**kwargs):
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=
            '{"entity_enrichments":[{"entity_type":"project","target_id":999,"changes":[]}]}'))])
    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    assert review_entity_intelligence(client, "model", "Me: We need a roadmap.", {}, [_proposal()]) == []


def test_client_discussion_cannot_become_employer_but_employment_can():
    context = {"people": [{"id": 7, "name": "Alex", "organization": None}]}
    item = {"entity_type": "person", "target_id": 7, "confidence": .99, "changes": [{
        "field": "organization", "operation": "replace", "current_value": None,
        "proposed_value": "ClientCo", "evidence_line_ids": [1]}]}
    assert _validated_entity_enrichments([item], context, "A: We are advising ClientCo on its transformation.") == []
    assert _validated_entity_enrichments([item], context, "A: I am employed by ClientCo.")


def test_currency_requires_explicit_support_in_the_cited_evidence():
    context = {"projects": [{"id": 42, "risks": None}]}
    assert _validated_entity_enrichments(
        [_proposal(proposed_value="Discovery costs 95k USD.")], context,
        "Me: Discovery costs 95k. We are discussing a US client.") == []
    assert _validated_entity_enrichments(
        [_proposal(proposed_value="Discovery costs 95k USD.")], context,
        "Me: Discovery costs 95k US dollars.")
    assert _validated_entity_enrichments(
        [_proposal(proposed_value="Discovery costs 95k; currency unspecified.")], context,
        "Me: Discovery costs 95k.")


def test_enrichment_receives_user_identity_not_only_other_attendees(monkeypatch):
    from app.services import meeting_intelligence_service as service
    contexts = []
    def extract(client, model, transcript, context, date):
        contexts.append(context)
        return []
    monkeypatch.setattr(service, "extract_entity_intelligence", extract)
    monkeypatch.setattr(service, "review_entity_intelligence", lambda *args: [])
    identity = {"people": [{"status": "self", "name": "Me", "speaker_label": "Me"}]}
    service._enrich_resolved_analysis({"meeting_resolution": identity}, {},
        "Me: I can advise. Pat can lead.", "2026-01-01", {"name": "Alex", "speaker_label": "Me"})
    assert contexts[0]["current_user"]["name"] == "Alex"
    assert contexts[0]["meeting_identity"] == identity


def test_project_boundary_review_cannot_overwrite_people_or_goals():
    import json
    from app.services.meeting_review_service import review_project_resolution
    calls = []
    def create(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps({
            "primary_project": {"name": "Existing client", "id": 42},
            "additional_projects": [], "people": [], "primary_goal": {}})))])
    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    draft = {"people": [{"name": "Alex"}], "primary_goal": {"title": "Growth"},
             "primary_project": {"name": "New region"}, "additional_projects": []}
    result = review_project_resolution(client, "model", "Me: New region is tentative.\nA: Existing client contract next.",
                                      {"projects": [{"id": 42, "name": "Existing client"}]}, draft)
    assert result["people"] == draft["people"]
    assert result["primary_goal"] == draft["primary_goal"]
    assert result["primary_project"]["id"] == 42
    assert "[2] A: Existing client contract next." in calls[0]["messages"][1]["content"]
