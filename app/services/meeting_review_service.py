"""Independent coverage and evidence review before meeting results are persisted."""
import json
import re

from app.services.meeting_resolution_contract import grounded, numbered_transcript, sourced_evidence, resolution_schema
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


def review_resolution(client, model, transcript, catalog, labels, draft):
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
            "Return the full corrected result using the schema, not a critique. " + UNTRUSTED_CONTEXT_POLICY)},
            {"role": "user", "content":
                wrap_untrusted_context("catalog", json.dumps(catalog), 50000)
                + wrap_untrusted_context("draft_context_not_ground_truth", json.dumps(draft), 26000)
                + wrap_untrusted_context("transcript", numbered_transcript(transcript), 150000)}])
    return parse_bounded_json_object(response.choices[0].message.content, max_characters=100000)


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
