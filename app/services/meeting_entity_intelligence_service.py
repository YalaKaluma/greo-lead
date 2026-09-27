"""Extract durable entity intelligence independently of leadership coaching."""
import json

from app.services.meeting_resolution_contract import numbered_transcript
from app.utils.ai_safety import UNTRUSTED_CONTEXT_POLICY, parse_bounded_json_object, wrap_untrusted_context


def extract_entity_intelligence(client, model, transcript, context, meeting_date=None):
    if not (context.get("people") or context.get("project") or context.get("projects") or context.get("proposed_projects")):
        return []
    response = client.chat.completions.create(
        model=model, temperature=0.0, max_tokens=6000,
        response_format={"type": "json_object"},
        messages=[{"role": "system", "content": (
            "Extract evidence-backed updates to the supplied people, existing projects AND pending proposed_projects. "
            "This is an entity intelligence pass, not leadership coaching or task extraction. "
            "Read the whole transcript and compare each resolved record, including secondary projects. "
            "Capture new scope boundaries, decisions, requirements, dependencies, risks, reported status, "
            "timing and project-specific roles. Do not merely repeat the existing project description. "
            "Return no update when the record already contains the same meaning. Do not invent targets "
            "or infer identities for unknown speakers. Use exact numeric IDs for existing records. For pending projects use candidate_key and null target_id; never invent database IDs. "
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
            "A client engagement is NOT employment. Never infer a person organization, team or relation from a client name; these fields require explicit employment/reporting evidence. Put project involvement in context. Preserve the scope of each amount: a whole-program budget is not one workstream budget. Record the final negotiated role and capacity, not a rejected initial request. Report third-party claims with attribution. Pending projects need the same scope, commercial conditions, responsibilities, dates and uncertainties as existing ones. Include explicit disclaimer obligations and completed-versus-planned work. Allowed person fields: organization, team, relation, context, current_goals, "
            "stakeholder_priorities, risks_or_pressures, stakeholder_aspirations, how_i_create_value, "
            "potential_tensions, relationship_strategy. Allowed project fields: description, status, "
            "client, role, objective, timeline, in_scope, out_of_scope, deliverables, core_team, "
            "client_stakeholders, risks. Project status must be active, paused or completed. "
            "Return JSON {entity_enrichments:[{entity_type:person|project,target_id,candidate_key,entity_name,"
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


def review_entity_intelligence(client, model, transcript, context, draft):
    """Check semantic entailment, not merely whether a quoted line exists."""
    if not draft:
        return []
    response = client.chat.completions.create(
        model=model, temperature=0.0, max_tokens=6500,
        response_format={"type": "json_object"},
        messages=[{"role": "system", "content": (
            "Audit each proposed entity change against the full source and return corrected entity_enrichments. "
            "Retain supported details and their evidence_line_ids; remove unsupported changes. "
            "Do not add entities or change target_id/candidate_key/current_value. A real quote is insufficient: "
            "check subject, relationship, scope, attribution, modality and final outcome. "
            "A consultant working for a client is NOT employed by that client. Organization/team/relation "
            "updates require an explicit employment/reporting statement about the resolved person. "
            "Never attach a different speaker's biography or the user's capacity to another attendee. "
            "Preserve conditional agreements, unapproved proposals, reported concerns and disputed facts "
            "inside proposed_value, with date and attribution. Whole-program budgets must not become "
            "workstream budgets. Technical doubts do not establish certification failure. "
            "Later corrections and final agreed capacity override initial requests; retain historical distinction. "
            "For new projects preserve detailed scope, pricing conditions, role boundaries and open questions. "
            "Return JSON {entity_enrichments:[...]} using the input shape. " + UNTRUSTED_CONTEXT_POLICY)},
            {"role": "user", "content": wrap_untrusted_context("resolved_context", json.dumps(context, default=str), 60000)
             + wrap_untrusted_context("draft_not_truth", json.dumps(draft, default=str), 60000)
             + wrap_untrusted_context("transcript", numbered_transcript(transcript), 150000)}])
    parsed = parse_bounded_json_object(response.choices[0].message.content, max_characters=100000)
    # Only the prevalidated targets may survive the semantic review.
    keys = {(x.get("entity_type"), x.get("target_id"), x.get("candidate_key")) for x in draft}
    return [x for x in parsed.get("entity_enrichments") or [] if isinstance(x, dict)
            and (x.get("entity_type"), x.get("target_id"), x.get("candidate_key")) in keys]
