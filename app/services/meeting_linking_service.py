"""Phase one: people, separate initiatives, then their strategic goal.

No enrichment, task extraction or benchmark answers enter this process.
"""
import json
from copy import deepcopy

from app.services.meeting_resolution_contract import numbered_transcript, resolution_schema, normalized, validate_catalog_choices
from app.services.meeting_review_service import review_project_resolution
from app.utils.ai_safety import UNTRUSTED_CONTEXT_POLICY, parse_bounded_json_object, wrap_untrusted_context


def _resolve(client, model, name, properties, instruction, context, transcript):
    schema = {"type": "object", "properties": properties, "required": list(properties),
              "additionalProperties": False}
    response = client.chat.completions.create(
        model=model, temperature=0, max_tokens=14000,
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
    if getattr(response.choices[0], "finish_reason", None) == "length":
        raise ValueError("Entity linking response exceeded its output budget; retry required")
    return parse_bounded_json_object(response.choices[0].message.content, max_characters=100000)


def _explicit_project_goal_links(projects, catalog, transcript):
    """Only a unique, explicit stored relationship can supply a deterministic goal link."""
    checked = validate_catalog_choices(deepcopy(projects), catalog, transcript)
    links = {}
    for project in [checked.get("primary_project") or {}, *(checked.get("additional_projects") or [])]:
        if project.get("status") != "existing" or project.get("confidence", 0) < .78:
            continue
        if project.get("confidence", 0) - project.get("runner_up_confidence", 0) < .12:
            continue
        record = next((p for p in catalog.get("projects", []) if p["id"] == project.get("id")), {})
        stored_goal = normalized(record.get("goal"))
        if not stored_goal:
            continue
        for goal in catalog.get("goals", []):
            title = goal.get("title") or goal.get("name")
            if stored_goal != normalized(title):
                continue
            links[goal["id"]] = {"status": "existing", "id": goal["id"], "title": title,
                "description": goal.get("description") or "", "confidence": project["confidence"],
                "runner_up_id": None, "runner_up_confidence": 0,
                "evidence_excerpt": project["evidence_excerpt"],
                "evidence_line_ids": project.get("evidence_line_ids"),
                "rationale": f"The evidenced project {record.get('title') or record.get('name')} explicitly stores this goal. "
                             "The goal title need not be repeated in the meeting.",
                "link_basis": "stored_project_goal"}
    return list(links.values())


def resolve_links(client, model, transcript, catalog, labels, title=None, supplied_context=None):
    properties = resolution_schema(catalog, labels)["properties"]
    context = {"catalog": catalog, "title": title, "user_supplied_context": supplied_context}
    people = _resolve(client, model, "meeting_people_links", {"people": properties["people"]}, (
        "Resolve PEOPLE only. First inventory names throughout the source, then compare each against "
        "existing people using name, role, organization and established project context. "
        "Resolve identity independently from attendance. Include substantively discussed people with "
        "attendance_basis=mentioned; never assign those people a speaking turn. A plan to consult someone, "
        "reported speech, workload assignment or third-person discussion does not establish attendance. "
        "For attendees require an introduction, conversational direct address, or self. A reply is not "
        "mandatory: a direct question, second-person reference to their contribution, or telling a named "
        "colleague that we need to leave establishes attendance even if a following sentence refers to "
        "them in third person. Inspect every name occurrence before deciding mentioned-only. "
        "If attendance and identity are clear but the speaker label is not, use Unattributed attendee "
        "with shared_speaker_label=true. Do not discard the person or demote them to merely mentioned. "
        "A greeting names its addressee, NOT its speaker. An addressed person may share a noisy speaker "
        "label with another attendee. Keep each independently evidenced person. Mixed diarization must "
        "not erase directly addressed people. Include unknown speakers without inventing names. "
        "observed_name is the actual spelling in the cited source, name is the canonical catalog name. "
        "Compare phonetic variants using corroborating role and work context: a near-spelling alone is "
        "insufficient when more than one candidate fits. User-provided identity corrections are evidence "
        "but are not permission to invent biographies. Me is current_user, never a new person. "
        "Propose new only for an identifiable person for whom no existing candidate fits; unnamed "
        "speakers remain unknown. Do not create a duplicate because the stored job title is narrow. "
        "identity_basis distinguishes named_person, hypothetical and uncertain_name. Fictional scenario "
        "examples are hypothetical and must never create or link records. Before proposing a new person, "
        "compare nearby spelling variants and the whole conversation: an awaited colleague greeted later "
        "may be one person, not two. A noisy isolated name with no distinguishing context is uncertain_name "
        "and unknown, not a new record. Do not treat products, organizations or tools as people."
    ), context, transcript)
    # Project-only review is the project resolver, not another full-context rewrite.
    projects = review_project_resolution(client, model, transcript, catalog,
                                        {"primary_project": {}, "additional_projects": []}, supplied_context, title)
    explicit_goal_links = _explicit_project_goal_links(projects, catalog, transcript)
    goal_context = {"explicit_project_goal_links": explicit_goal_links,"goals": catalog.get("goals", []), "project_catalog": catalog.get("projects", []),
                    "user_supplied_context": supplied_context, "resolved_projects": projects}
    goal = _resolve(client, model, "meeting_goal_link", {"primary_goal": properties["primary_goal"]}, (
        "Resolve the GOAL after the supplied project decisions. Read the matched projects' stored goal "
        "and objective fields, then compare against existing goal records. The transcript need not "
        "repeat a strategic goal's title when the substantive project work advances that established "
        "outcome. Cite the meeting work and explain the project-to-goal relationship in rationale. "
        "Honor explicit user-provided goal linking guidance only where its stated scope applies. "
        "Do not return none merely because the strategic title is absent from the transcript. "
        "For none, explain why NONE of the resolved substantive projects advances any catalog goal, "
        "including any applicable user guidance and stored project goal. Distinguish shared product "
        "development from unrelated client consulting. General business vocabulary alone is insufficient. "
        "Do not attach an unrelated consulting engagement "
        "to a product goal. Prefer supported existing strategic outcomes over inventing a goal named "
        "after the meeting. Propose new only when a distinct outcome is supported and no existing goal "
        "covers it; otherwise return none with a reason. Do not change people or project decisions."
    ), goal_context, transcript)
    checked_goal = validate_catalog_choices(deepcopy(goal), catalog, transcript)
    if (checked_goal.get("primary_goal") or {}).get("status") == "none" and len(explicit_goal_links) == 1:
        goal["primary_goal"] = explicit_goal_links[0]
    return {**people, **projects, **goal}
