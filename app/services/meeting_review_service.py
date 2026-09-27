"""Independent coverage and evidence review before meeting results are persisted."""
import json
import re

from app.services.meeting_resolution_contract import grounded, numbered_transcript, sourced_evidence
from app.utils.ai_safety import UNTRUSTED_CONTEXT_POLICY, parse_bounded_json_object, wrap_untrusted_context


def review_actions(client, model, transcript, analysis, candidates):
    response = client.chat.completions.create(
        model=model, temperature=0.0, response_format={"type": "json_object"}, max_tokens=7000,
        messages=[{"role": "system", "content": (
            "Return JSON only. Audit meeting action completeness and accuracy. Read the ENTIRE transcript in order, especially "
            "the closing turns. Return the complete corrected list, not only additions. Find every explicit "
            "commitment: introductions/contacting people, sharing material or rates, confirming attendance, "
            "reviewing drafts, requesting metrics, updating wording and producing quotes. Preserve distinct "
            "deliverables; consolidate only genuine duplicates. Do not promote ideas into promises. "
            "Resolve first-person commitments by Me to owner_name='Me', even without a personal name. "
            "Distinguish the local consulting team from the client and from Engine. Do not transfer work "
            "between them. Mixed diarization labels may represent several people, including Me; assign named "
            "owners only when supported by explicit context. A vocative is the ADDRESSEE, not the speaker: "
            "'Thanks Yala, I'll finish the proposal' is the OTHER speaker's commitment, not Yala's. "
            "Otherwise retain the speaker label. Preserve explicit counterparty commitments such as asking Ross; "
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
            "longitudinal pattern from one meeting. Distinguish colleagues from clients. "
            "Me is the user's reliable speaker label. Other labels can contain transcription errors; do not "
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
