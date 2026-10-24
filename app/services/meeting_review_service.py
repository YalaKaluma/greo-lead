"""Independent coverage and evidence review before meeting results are persisted."""
import json
from copy import deepcopy
import re

from app.services.meeting_resolution_contract import grounded, numbered_transcript, sourced_evidence, resolution_schema, normalized
from app.utils.ai_safety import UNTRUSTED_CONTEXT_POLICY, parse_bounded_json_object, wrap_untrusted_context


def commitment_windows(transcript):
    """Surface local commitment turns so long discussions do not bury follow-ups."""
    lines = transcript.splitlines()
    cues = re.compile(r"\b(i will|i'll|let me|i can|i need to|i would|can you|could you|will you|we will|we'll|je vais|je peux|je dois|je partage|je demande|je prends|on va|tu peux|pourrais.tu)\b", re.I)
    selected = set()
    for i, line in enumerate(lines):
        if cues.search(line):
            selected.update(range(max(0, i-3), min(len(lines), i+5)))
    return "\n".join(f"[{i+1}] {lines[i]}" for i in sorted(selected))


def review_resolution(client, model, transcript, catalog, labels, draft, supplied_context=None):
    response = client.chat.completions.create(
        model=model, temperature=0.0, max_tokens=7000,
        response_format={"type": "json_schema", "json_schema": {
            "name": "reviewed_meeting_resolution", "strict": True, "schema": resolution_schema(catalog, labels)}},
        messages=[{"role": "system", "content": (
            "Independently audit the draft context against the FULL transcript and return corrected JSON. "
            "First enumerate all directly greeted, introduced or addressed attendees, including those sharing "
            "a diarization label. Check each named greeting so no known attendee is omitted. "
            "Direct references to an interlocutor's contribution ('your framing, Matt') and requests to an "
            "interlocutor ('Daniel, we have to drop') also support attendance; a greeting is not mandatory. "
            "A person to call tomorrow, a client contact discussed, or a manager mentioned is NOT thereby attending. "
            "A phrase 'thanks NAME, I will do X' addresses NAME; the committing speaker is somebody else. "
            "Use current_user identity to avoid proposing transcription variants of the user as new people. "
            "Require evidence_line_ids including the actual naming/greeting/response, not generic technical talk. "
            "Include adjacent lines when a name is on its own short line; cite the whole local address and reply. "
            "Do not discard a directly addressed attendee merely because the diarization label is shared. "
            "A genuine phonetic name ambiguity between catalog people must remain explicitly unresolved. "
            "Mixed labels and concatenated conversations require local attribution; preserve multiple attendees. "
            "Second identify which client owns the main contract/delivery discussion from substantive details. "
            "The title and opening topic may be misleading. A brief expansion opportunity must not erase the "
            "main client's contract or go-live project. Recognize phonetic client transcription variants using "
            "catalog descriptions and corroborating context. Keep substantive secondary initiatives separately. "
            "Do not include cases used only as analogies. Match exact catalog IDs and names together. "
            "Audit additional_projects too: retain each substantive client delivery discussion even when the "
            "main topic is an internal product initiative. Do not let the primary project absorb other clients. "
            "Substantive internal architecture and ownership discussions also deserve an additional project "
            "match when the catalog has that initiative; additional projects are not restricted to clients. "
            "Use existing only with confidence >=.78 and margin >=.12; runners-up must be distinct IDs. "
            "Use null ID for new/self/unknown/none. Be conservative about goals. All confidences are 0..1. "
            "attendance_basis must describe actual evidence: direct_address, introduction, self, mentioned or unknown. A name merely occurring in a quote is not direct address. Repeated references, assigned work and future consultation remain mentioned. Inspect every substantive topic across the full transcript, including smaller delivery updates, before deciding additional_projects. Prefer an existing strategic growth goal when this client/product work demonstrably advances it; do not invent a meeting-shaped goal when that outcome already exists. "
            "Return the full corrected result using the schema, not a critique. " + UNTRUSTED_CONTEXT_POLICY)},
            {"role": "user", "content":
                wrap_untrusted_context("supplied_meeting_context", supplied_context or "", 10000)
                + wrap_untrusted_context("catalog", json.dumps(catalog), 50000)
                + wrap_untrusted_context("draft_context_not_ground_truth", json.dumps(draft), 26000)
                + wrap_untrusted_context("transcript", numbered_transcript(transcript), 150000)}])
    return parse_bounded_json_object(response.choices[0].message.content, max_characters=100000)


def project_coverage_candidates(transcript, catalog):
    """Literal mentions nominate review candidates, never automatic project links."""
    source = " " + normalized(transcript) + " "
    generic = {"project", "product", "platform", "data", "internal", "shared", "client", "new", "ai", "the"}
    result = []
    for row in catalog.get("projects", []):
        title = row.get("title") or row.get("name") or ""
        first = title.split()[0] if title.split() else ""
        anchors = [row.get("client"), title]
        if len(first) >= 4 and first[0].isupper() and normalized(first) not in generic:
            anchors.append(first)
        if any(len(normalized(a)) >= 4 and " " + normalized(a) + " " in source for a in anchors if a):
            result.append(row)
    return result


def review_project_resolution(client, model, transcript, catalog, draft, supplied_context=None, supplied_title=None):
    """Review project boundaries separately from identity and goal resolution."""
    full = resolution_schema(catalog, ["Me"])
    properties = {key: full["properties"][key] for key in ("primary_project", "additional_projects")}
    # Make every new-project decision compare the closest existing initiative.
    for key, value in properties.items():
        entity = value["items"] if key == "additional_projects" else value
        entity["properties"]["initiative_scope"] = {"type": "string", "enum": ["product", "client", "internal", "unknown"]}
        entity["properties"]["closest_existing_id"] = {"type": ["integer", "null"],
            "enum": [None, *[p["id"] for p in catalog.get("projects", [])]]}
        entity["properties"]["existing_candidate_rejection_reason"] = {"type": "string"}
        entity["required"] += ["initiative_scope", "closest_existing_id", "existing_candidate_rejection_reason"]
    candidates = project_coverage_candidates(transcript, catalog)
    if candidates:
        decision = deepcopy(properties["primary_project"])
        decision["properties"]["status"]["enum"] = ["existing", "new", "none", "unresolved"]
        coverage_properties = {str(row["id"]): {"$ref": "#/$defs/coverage_decision"} for row in candidates}
        properties["project_coverage"] = {"type": "object", "properties": coverage_properties,
            "required": list(coverage_properties), "additionalProperties": False}
    schema = {"type": "object", "properties": properties,
              "required": list(properties), "additionalProperties": False}
    if candidates:
        schema["$defs"] = {"coverage_decision": decision}
    response = client.chat.completions.create(
        model=model, temperature=0.0, max_tokens=6000,
        response_format={"type": "json_schema", "json_schema": {
            "name": "meeting_project_boundaries", "strict": True, "schema": schema}},
        messages=[{"role": "system", "content": (
            "Resolve ONLY project boundaries against the full transcript and supplied project catalog. "
            "For EVERY key in project_coverage, independently assess that catalog candidate against "
            "the full transcript. A literal mention nominates a review, NOT a link: reject examples, "
            "analogies and unrelated work as none with an explicit rationale and source line IDs. "
            "Substantive delivery/status updates count even when the product roadmap dominates. "
            "Inspect ALL occurrences of a candidate and their surrounding discussion before rejecting it. "
            "A later analogy does not cancel an earlier factual delivery update. A topic transition "
            "can name the client of the preceding operational discussion: read both sides of it. "
            "Resolve references using corroborating scope, people and deliverables; do not link on a "
            "client name alone. If primary/additional_projects contains a candidate, its coverage "
            "decision must agree; contradictory decisions will be returned for review, not linked. "
            "Use existing for a supported match, new for a distinct initiative without a catalog match, "
            "or unresolved with a reason when ambiguous. Each coverage decision is authoritative for "
            "that candidate; include all other substantive initiatives in primary/additional_projects. "
            "Runner-up means an alternative identity for the SAME initiative, not another valid "
            "project discussed in this meeting. Two real projects are not competing matches. "
            "First distinguish reusable PRODUCT initiatives, INTERNAL work and CLIENT deployments. "
            "A shared product initiative does not need a client. Never relabel product roadmap, reusable "
            "onboarding capabilities or platform productization as an unknown-client project merely "
            "because clients also occur in the discussion. A product initiative and its client "
            "deployments may all be substantive and must retain their separate existing records. "
            "Match equivalent work by objective, deliverable and product scope, including French/English "
            "paraphrases; exact title wording is not required. Before proposing NEW, compare the closest "
            "existing record and return closest_existing_id plus a concrete scope/client distinction "
            "in existing_candidate_rejection_reason. Different wording, missing client name or a "
            "new feature within the same initiative is NOT a reason to duplicate an existing project. "
            "The previous draft is fallible. Read the source in segments, identify the client/initiative "
            "for each substantive segment, then choose primary and secondary projects. "
            "A new opportunity mentioned at the opening is not necessarily the client whose existing "
            "contract, security checklist or go-live is discussed later. Match that later client's "
            "existing project using explicit references, including supported phonetic transcription variants. "
            "Do not transfer one client's contractual terms or requirements to another opportunity. "
            "Keep distinct client opportunities separate even when they share an offer or demo agenda. "
            "Inventory each client with its own demo, proposal, delivery or next step. For every such "
            "client make an independent existing/new/none decision; a shared preparation workstream "
            "must not replace the separate opportunities. Never put two independent buyers in one "
            "new project name. Choose the most substantive one as primary and retain the other(s) "
            "in additional_projects, even if neither exists in the catalog. "
            "Retain smaller substantive delivery updates for existing clients as additional projects. "
            "Examples, workload comparisons and case studies do not establish projects of this meeting. "
            "Keep an unknown client's identity unknown. When substantive project work has no catalog match, "
            "propose a neutral new project with the client explicitly unknown; do not discard the initiative. "
            "Return evidence_line_ids with actual bracketed transcript line numbers for EVERY existing "
            "or new project. Empty citations are invalid. New projects require confidence >=.78. "
            "For each match cite short source spans establishing client identity AND the substantive "
            "discussion; explain the boundary in rationale. Use exact catalog IDs/names. Existing "
            "requires confidence >=.78 and margin >=.12. New/none IDs must be null. "
            "Do not change people or goals. Return the requested JSON. " + UNTRUSTED_CONTEXT_POLICY)},
            {"role": "user", "content":
                wrap_untrusted_context("meeting_supplied_context", json.dumps({"title": supplied_title, "context": supplied_context}), 12000)
                + wrap_untrusted_context("project_catalog", json.dumps(catalog.get("projects", [])), 30000)
                + wrap_untrusted_context("previous_draft_not_truth", json.dumps({key: draft.get(key) for key in properties}), 18000)
                + wrap_untrusted_context("transcript", numbered_transcript(transcript), 150000)}])
    if getattr(response.choices[0], "finish_reason", None) == "length":
        raise ValueError("Project resolution exceeded its output budget")
    result = parse_bounded_json_object(response.choices[0].message.content, max_characters=70000)
    if not isinstance(result.get("primary_project"), dict) or not isinstance(result.get("additional_projects"), list):
        raise ValueError("Project boundary review returned an incomplete result")
    return reconcile_project_coverage(result, candidates, draft)


def reconcile_project_coverage(result, candidates, draft):
    """Keep contradictions and rejected candidates visible; never force a link."""
    raw_result = deepcopy(result)
    coverage = result.get("project_coverage") or {}
    rows = [result["primary_project"], *result["additional_projects"]]
    for candidate in candidates:
        decision = coverage.get(str(candidate["id"]))
        if not isinstance(decision, dict):
            decision = {"status": "unresolved", "name": candidate.get("title") or candidate.get("name"),
                        "rationale": "coverage_decision_missing"}
        if decision.get("status") == "existing" and decision.get("id") != candidate["id"]:
            decision = {**decision, "status": "unresolved", "id": None,
                        "name": candidate.get("title") or candidate.get("name"),
                        "validation_reason": "catalog_identity_mismatch"}
        if not decision.get("name"):
            decision = {**decision, "name": candidate.get("title") or candidate.get("name")}
        decision = {**decision, "coverage_candidate_id": candidate["id"]}
        prior = [r for r in rows if r.get("status") == "existing" and r.get("id") == candidate["id"]]
        if prior and decision.get("status") != "existing":
            decision = {**decision, "status": "unresolved", "id": None,
                        "name": candidate.get("title") or candidate.get("name"),
                        "validation_reason": "conflicting_project_decisions",
                        "rationale": "Project matching and coverage review disagree. "
                                     + str(decision.get("rationale") or ""),
                        "conflicting_decisions": deepcopy(prior)}
        elif decision.get("status") == "none":
            # A negative model decision is still a reviewable result, not a
            # reason to erase the candidate from the downstream UI.
            decision = {**decision, "validation_reason": "model_rejected_candidate"}
        # One authoritative decision per candidate; unrelated initiatives remain separate.
        rows = [r for r in rows if not (r.get("status") == "existing" and r.get("id") == candidate["id"])]
        rows.append(decision)
    original_primary = result["primary_project"]
    primary = next((r for r in rows if r.get("status") in {"existing", "new"}
                    and (r.get("id"), normalized(r.get("name"))) ==
                        (original_primary.get("id"), normalized(original_primary.get("name")))),
                   next((r for r in rows if r.get("status") in {"existing", "new"}), rows[0]))
    return {**draft, "project_model_output": raw_result, "primary_project": primary,
            "additional_projects": [r for r in rows if r is not primary],
            "project_coverage_candidates": [{"id": r["id"], "name": r.get("title") or r.get("name")} for r in candidates]}



def review_actions(client, model, transcript, analysis, candidates):
    response = client.chat.completions.create(
        model=model, temperature=0.0, response_format={"type": "json_object"}, max_tokens=7000,
        messages=[{"role": "system", "content": (
            "Return JSON only. Audit meeting action completeness and accuracy. Read the ENTIRE transcript in order, especially "
            "the closing turns. Return the complete corrected list, not only additions. Find every explicit "
            "commitment: introductions/contacting people, sharing material or rates, confirming attendance, "
            "reviewing drafts, requesting metrics, updating wording and producing quotes. Preserve distinct "
            "deliverables; consolidate only genuine duplicates. Do not promote ideas into promises. "
            "Remove completed work ('we enabled X'), status updates, standing policy reminders and hypothetical "
            "contract clauses unless somebody explicitly commits to follow-up work. Do not replace a concrete "
            "follow-up ('discuss recovery with Nico tomorrow') with a vague contract drafting task. "
            "Check every highlighted commitment window, but a request alone is not an accepted commitment. "
            "French present-tense promises ('je demande à Laura', 'je t'envoie', 'je te tiens au courant') "
            "are commitments. Review those turns explicitly. 'Je vais peut-être' is tentative, not firm. "
            "A question about the next step is NOT a promise to perform it. 'We can test' does not assign "
            "implementation to the person suggesting it. The accepting speaker may be a different person. "
            "Keeping a feature for a later discussion is a scope decision, not a task. Exclude it unless "
            "someone commits to a concrete deliverable. Include source lines with acceptance, not just proposal. "
            "Do not assign an unaddressed group request to Me. Keep owner unknown if nobody accepts it. "
            "Resolve first-person commitments by Me to owner_name='Me', even without a personal name. "
            "Distinguish the local consulting team from the client and from Engine. Do not transfer work "
            "between them. Mixed diarization labels may represent several people, including Me; assign named "
            "owners only when supported by explicit context. A vocative is the ADDRESSEE, not the speaker: "
            "'Thanks Yala, I'll finish the proposal' is the OTHER speaker's commitment, not Yala's. "
            "Otherwise retain the speaker label. Preserve explicit counterparty commitments such as asking Ross; "
            "Transcripts may concatenate meetings. After a goodbye and new greeting, reassess identity locally; "
            "the same label can be another person. Recognize commitments and relative dates in French as well as English. "
            "a conditional user offer to contact someone is not a replacement for those commitments. "
            "Due dates use the meeting date, not today's date. Do not turn a date range into a firm first-day deadline. "
            "The meeting date itself is NEVER a deadline. A due date requires source lines stating a temporal "
            "commitment for that action; otherwise null. Cite these in due_date_evidence_line_ids (or []). "
            "Return {action_items:[{description,owner_name,due_date,confidence,evidence_excerpt,evidence_line_ids,due_date_evidence_line_ids}]}. "
            "Dates are ISO strings or null; confidence is 0..1. evidence_excerpt may be empty: provide exact "
            "supporting numbered line IDs and the application copies the quote. " + UNTRUSTED_CONTEXT_POLICY)},
            {"role": "user", "content": f"Meeting date: {analysis.get('meeting_date') or 'unknown'}\n"
             + wrap_untrusted_context("candidate_actions", json.dumps(candidates), 24000)
             + wrap_untrusted_context("identities", json.dumps(analysis.get('meeting_resolution') or {}), 18000)
             + wrap_untrusted_context("commitment_windows_not_automatically_tasks", commitment_windows(transcript), 50000)
             + wrap_untrusted_context("transcript", numbered_transcript(transcript), 150000)}])
    return parse_bounded_json_object(response.choices[0].message.content, max_characters=100000)


def explicit_self_owner(item):
    """Recover an explicit self commitment without inferring ownership from a mere request."""
    if item.get("owner_name") not in (None, "", "Unclear", "Unknown"):
        return item
    excerpt = item.get("evidence_excerpt") or ""
    labels = set(re.findall(r"(?m)^([^:\n]{1,80}):", excerpt))
    if labels == {"Me"} and re.search(r"(?i)\b(let me|I will|I'll|I can|I should|I shall)\b", excerpt):
        return {**item, "owner_name": "Me"}
    return item


def supported_self_owner(item):
    """Reject user ownership supported solely by somebody else's quoted request."""
    if item.get("owner_name") == "Me":
        excerpt = item.get("evidence_excerpt") or ""
        own_turns = " ".join(re.findall(r"(?m)^Me:\s*(.*)$", excerpt))
        # A self label alone is not an assignment: questions and collective design
        # suggestions routinely appear in the same excerpt as another person's acceptance.
        commitment = r"\b(i will|i['’]ll|let me|i shall|i can|i agree to|happy to (?:prepare|build|discuss|connect|share)|je vais|je peux|je m['’]engage|je demande|je prends|je partage|je t['’]envoie|j['’]envoie|je te tiens)\b"
        tentative = r"\b(je vais peut[- ]être|i can perhaps|i can maybe)\b"
        if not re.search(commitment, own_turns, re.I) or re.search(tentative, own_turns, re.I):
            return {**item, "owner_name": None}
    return item


def review_coaching(client, model, transcript, analysis, coaching):
    response = client.chat.completions.create(
        model=model, temperature=0.0, response_format={"type": "json_object"}, max_tokens=6500,
        messages=[{"role": "system", "content": (
            "Return JSON only. You are an evidence reviewer, not a critic looking for something to criticize. Audit this coaching "
            "against the entire transcript. Return the same top-level fields with corrected contents. "
            "Extracted actions are fallible drafts, not confirmed facts. Never praise or criticize a deadline "
            "on the basis of action metadata alone; verify the actual timing words in the transcript. "
            "Check every negative claim for counterevidence: 'this weekend', named dates, assigned ownership, "
            "expressed limits or explicit invitations count. Never say a deadline or boundary was absent when "
            "it was stated. Do not impose generic coaching because a template has a Growth edge field. "
            "If no material gap is evidenced say that, with a light optional next experiment. Do not infer a "
            "deficiency from the mere absence of a behavior: 'invite quieter voices', 'check energy', and "
            "'request feedback' are optional experiments unless a specific neglected person, overload, or "
            "missed learning opportunity is evidenced. Do not put those generic suggestions in Growth edge. "
            "Do not infer a longitudinal pattern from one meeting. Distinguish colleagues from clients. "
            "Me normally identifies the user, but a locally explicit introduction or direct address can contradict "
            "even Me. Exclude such disputed turns from user coaching. Transcripts may concatenate conversations: "
            "do not carry a speaker identity across a new greeting without evidence. Other labels can contain errors; do not "
            "score the user on those turns alone. Remove claims whose attribution remains uncertain. "
            "For each domain_assessment, leadership_observation and profile_suggestion return evidence_line_ids "
            "for a short verbatim supporting span. Never insert commentary, ellipses or invented words into quotes. "
            "Keep exactly five domains: Vision, People, Prioritize & Execute, Time & Energy, Learning & Development. "
            "Each domain has domain, score (1..5 or null), feedback with Demonstrated:/Growth edge:/Next meeting: "
            "parts, evidence_line_ids. Preserve the input schema for other fields, adding evidence_line_ids. "
            "Return no profile suggestions unless strongly supported. Keep entity_enrichments unchanged. "
            + UNTRUSTED_CONTEXT_POLICY)}, {"role": "user", "content":
                wrap_untrusted_context("draft_coaching", json.dumps(coaching), 45000)
                + wrap_untrusted_context("draft_extracted_actions", json.dumps(analysis.get('action_items') or []), 16000)
                + wrap_untrusted_context("transcript", numbered_transcript(transcript), 150000)}])
    if getattr(response.choices[0], "finish_reason", None) == "length":
        raise ValueError("Leadership review was truncated")
    result = parse_bounded_json_object(response.choices[0].message.content, max_characters=140000)
    for key in ("domain_assessments", "leadership_observations", "profile_suggestions"):
        kept = []
        for raw in result.get(key) or []:
            item = sourced_evidence(raw, transcript)
            quote = item.get("evidence_excerpt") or ""
            if grounded(quote, transcript) and re.search(r"(?m)^Me:", quote):
                kept.append(item)
            elif key == "domain_assessments":
                kept.append({"domain": item.get("domain"), "score": None,
                             "feedback": "Insufficient reliably attributed evidence to assess this domain.",
                             "evidence_excerpt": None})
        result[key] = kept
    result["entity_enrichments"] = coaching.get("entity_enrichments") or []
    return result
