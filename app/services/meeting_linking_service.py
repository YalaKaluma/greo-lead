"""Phase one: people, separate initiatives, then their strategic goal.

No enrichment, task extraction or benchmark answers enter this process.
"""
import json

from app.services.meeting_resolution_contract import numbered_transcript, resolution_schema
from app.services.meeting_review_service import review_project_resolution
from app.utils.ai_safety import UNTRUSTED_CONTEXT_POLICY, parse_bounded_json_object, wrap_untrusted_context


def _resolve(client, model, name, properties, instruction, context, transcript):
    schema = {"type": "object", "properties": properties, "required": list(properties),
              "additionalProperties": False}
    response = client.chat.completions.create(
        model=model, temperature=0, max_tokens=7000,
        response_format={"type": "json_schema", "json_schema": {
            "name": name, "strict": True, "schema": schema}},
        messages=[{"role": "system", "content": instruction + (
            " Return exact catalog IDs with their canonical names. New/unknown/none/self IDs are null. "
            "Existing matches require confidence >=.78 and margin >=.12 over a distinct runner-up. "
            "Cite evidence_line_ids from the transcript; include adjacent response lines for short names. "
            "Keep uncertainty explicit in rationale. Do not infer facts from previous model outputs. "
            "Before returning, check all substantive source segments for omitted entities, unsupported "
            "links, and duplicate proposals. Return only the requested JSON. ") + UNTRUSTED_CONTEXT_POLICY},
            {"role": "user", "content": wrap_untrusted_context("linking_context", json.dumps(context), 60000)
             + wrap_untrusted_context("transcript", numbered_transcript(transcript), 150000)}])
    return parse_bounded_json_object(response.choices[0].message.content, max_characters=100000)


def resolve_links(client, model, transcript, catalog, labels, title=None, supplied_context=None):
    properties = resolution_schema(catalog, labels)["properties"]
    context = {"catalog": catalog, "title": title, "user_supplied_context": supplied_context}
    people = _resolve(client, model, "meeting_people_links", {"people": properties["people"]}, (
        "Resolve PEOPLE only. First inventory names throughout the source, then compare each against "
        "existing people using name, role, organization and established project context. "
        "Resolve identity independently from attendance. Include substantively discussed people with "
        "attendance_basis=mentioned; never assign those people a speaking turn. A plan to consult someone, "
        "reported speech, workload assignment or third-person discussion does not establish attendance. "
        "For attendees require an introduction, direct address with a locally plausible reply, or self. "
        "A greeting names its addressee, NOT its speaker. An addressed person may share a noisy speaker "
        "label with another attendee. Keep each independently evidenced person. Mixed diarization must "
        "not erase directly addressed people. Include unknown speakers without inventing names. "
        "observed_name is the actual spelling in the cited source, name is the canonical catalog name. "
        "Compare phonetic variants using corroborating role and work context: a near-spelling alone is "
        "insufficient when more than one candidate fits. User-provided identity corrections are evidence "
        "but are not permission to invent biographies. Me is current_user, never a new person. "
        "Propose new only for an identifiable person for whom no existing candidate fits; unnamed "
        "speakers remain unknown. Do not create a duplicate because the stored job title is narrow."
    ), context, transcript)
    # Project-only review is the project resolver, not another full-context rewrite.
    projects = review_project_resolution(client, model, transcript, catalog,
                                        {"primary_project": {}, "additional_projects": []})
    goal_context = {**context, "resolved_projects": projects}
    goal = _resolve(client, model, "meeting_goal_link", {"primary_goal": properties["primary_goal"]}, (
        "Resolve the GOAL after the supplied project decisions. Read the matched projects' stored goal "
        "and objective fields, then compare against existing goal records. The transcript need not "
        "repeat a strategic goal's title when the substantive project work advances that established "
        "outcome. Cite the meeting work and explain the project-to-goal relationship in rationale. "
        "Honor explicit user-provided goal linking guidance only where its stated scope applies. "
        "General business vocabulary is insufficient. Do not attach an unrelated consulting engagement "
        "to a product goal. Prefer supported existing strategic outcomes over inventing a goal named "
        "after the meeting. Propose new only when a distinct outcome is supported and no existing goal "
        "covers it; otherwise return none with a reason. Do not change people or project decisions."
    ), goal_context, transcript)
    return {**people, **projects, **goal}
