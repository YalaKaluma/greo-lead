"""Extract durable entity intelligence independently of leadership coaching."""
import json

from app.services.meeting_resolution_contract import numbered_transcript
from app.utils.ai_safety import UNTRUSTED_CONTEXT_POLICY, parse_bounded_json_object, wrap_untrusted_context


def extract_entity_intelligence(client, model, transcript, context, meeting_date=None):
    if not (context.get("people") or context.get("project") or context.get("projects")):
        return []
    response = client.chat.completions.create(
        model=model, temperature=0.0, max_tokens=6000,
        response_format={"type": "json_object"},
        messages=[{"role": "system", "content": (
            "Extract evidence-backed updates to the supplied existing people and projects. "
            "This is an entity intelligence pass, not leadership coaching or task extraction. "
            "Read the whole transcript and compare each resolved record, including secondary projects. "
            "Capture new scope boundaries, decisions, requirements, dependencies, risks, reported status, "
            "timing and project-specific roles. Do not merely repeat the existing project description. "
            "Return no update when the record already contains the same meaning. Do not invent targets "
            "or infer identities for unknown speakers. Only use the exact numeric IDs in resolved_context. "
            "A named person being discussed is not proof they attended. Do not attribute an unknown "
            "speaker's opinions to a known person based on role similarity. "
            "Preserve proposals, conditions, unresolved questions and speaker attribution IN proposed_value. "
            "Someone's reported frustration is not a verified organizational decision or personality trait. "
            "Do not merge an analytic data window, application deletion policy and recovery backup window. "
            "A proposed contract term is not an implemented capability or signed client agreement. "
            "A proposed meeting date is not client acceptance. Do not interpret discussion as goal completion. "
            "Prefix narrative updates with the meeting date when supplied; never invent a date. "
            "Use append for new narrative history; use replace only to correct a stable factual field "
            "when explicitly supported. Do not erase prior history. "
            "Allowed person fields: organization, team, relation, context, current_goals, "
            "stakeholder_priorities, risks_or_pressures, stakeholder_aspirations, how_i_create_value, "
            "potential_tensions, relationship_strategy. Allowed project fields: description, status, "
            "client, role, objective, timeline, in_scope, out_of_scope, deliverables, core_team, "
            "client_stakeholders, risks. Project status must be active, paused or completed. "
            "Return JSON {entity_enrichments:[{entity_type:person|project,target_id,entity_name,"
            "confidence,rationale,changes:[{field,operation:append|replace,current_value,proposed_value,"
            "rationale,evidence_line_ids}]}]}. Group changes by target. confidence is 0..1. "
            "Each change needs exact numbered source lines supporting that claim, including any "
            "qualification or correction. The application copies the evidence; do not rewrite quotes. "
            "Use a short contiguous span when a naming or qualification turn is split across lines. "
            "current_value must match the supplied record, or null for an empty field. "
            + UNTRUSTED_CONTEXT_POLICY)},
            {"role": "user", "content":
                wrap_untrusted_context("meeting_date", str(meeting_date or "unknown"), 100)
                + wrap_untrusted_context("resolved_context", json.dumps(context, default=str), 60000)
                + wrap_untrusted_context("transcript", numbered_transcript(transcript), 150000)}],
    )
    parsed = parse_bounded_json_object(response.choices[0].message.content, max_characters=100000)
    return parsed.get("entity_enrichments") or []
