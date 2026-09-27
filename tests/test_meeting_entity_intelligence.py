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
