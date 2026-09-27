"""Strict output contract and grounding checks for meeting entity resolution."""
import re


def normalized(value):
    return " ".join(re.findall(r"\w+", str(value or "").casefold()))


def grounded(excerpt, transcript):
    quote = normalized(excerpt)
    if len(quote) < 8:
        return False
    if quote in normalized(transcript):
        return True
    # Diarization labels are metadata, not spoken words. Preserve word order.
    spoken = re.sub(r"(?m)^\s*[^:\n]{1,80}:\s+", "", transcript or "")
    return quote in normalized(spoken)


def numbered_transcript(transcript):
    return "\n".join(f"[{i}] {line}" for i, line in enumerate(transcript.splitlines(), 1))


def sourced_evidence(item, transcript):
    """Materialize source references; never rely on a model rewriting quotations."""
    ids = item.get("evidence_line_ids")
    if ids is None:
        return item
    lines = transcript.splitlines()
    if not ids or any(type(i) is not int or i < 1 or i > len(lines) for i in ids):
        return {**item, "evidence_excerpt": ""}
    # Use the complete span, including intervening words, to retain context.
    return {**item, "evidence_excerpt": "\n".join(lines[min(ids)-1:max(ids)])}


def resolution_schema(catalog, speaker_labels):
    def entity(kind, name_field, statuses):
        ids = [row["id"] for row in catalog.get(kind, [])]
        properties = {
            "status": {"type": "string", "enum": statuses},
            "id": {"type": ["integer", "null"], "enum": [None, *ids]},
            name_field: {"type": "string"},
            "description": {"type": "string"},
            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
            "runner_up_id": {"type": ["integer", "null"], "enum": [None, *ids]},
            "runner_up_confidence": {"type": "number", "minimum": 0, "maximum": 1},
            "evidence_excerpt": {"type": "string"},
            "evidence_line_ids": {"type": "array", "items": {"type": "integer"}},
            "rationale": {"type": "string"},
        }
        if kind == "people":
            properties["speaker_label"] = {"type": "string", "enum": speaker_labels}
        return {"type": "object", "properties": properties,
                "required": list(properties), "additionalProperties": False}
    properties = {
        "primary_goal": entity("goals", "title", ["existing", "new", "none"]),
        "people": {"type": "array", "items": entity("people", "name", ["existing", "new", "unknown", "self"])},
        "primary_project": entity("projects", "name", ["existing", "new", "none"]),
    }
    return {"type": "object", "properties": properties,
            "required": list(properties), "additionalProperties": False}


def validate_catalog_choices(resolution, catalog, transcript):
    """Reject name/ID disagreement and unsupported quotations before DB retrieval."""
    for key, kind, name_field in [("primary_goal", "goals", "title"),
                                  ("primary_project", "projects", "name"),
                                  ("people", "people", "name")]:
        rows = resolution.get(key) or ([] if key == "people" else {})
        for item in rows if isinstance(rows, list) else [rows]:
            if item.get("status") not in {"existing", "new"}:
                continue
            item.update(sourced_evidence(item, transcript))
            valid = grounded(item.get("evidence_excerpt"), transcript)
            if item.get("status") == "existing":
                record = next((r for r in catalog.get(kind, []) if r["id"] == item.get("id")), None)
                valid = valid and record is not None and normalized(item.get(name_field)) == normalized(
                    (record or {}).get("name") or (record or {}).get("title"))
            if not valid:
                item.update(status="unknown" if key == "people" else "none", id=None)
    return resolution


def canonical_people(people, labels):
    """Only real transcript labels may appear, once each; Me is always self."""
    by_key = {normalized(label): label for label in labels}
    selected = {}
    for item in people or []:
        key = normalized(re.sub(r"(?i)^(speaker|participant)\s+", "", str(item.get("speaker_label") or "")))
        if key not in by_key:
            continue
        label = by_key[key]
        candidate = {**item, "speaker_label": label}
        if key == "me":
            candidate = {"speaker_label": label, "status": "self", "name": "Me"}
        elif candidate.get("status") == "self" and "me" in by_key:
            candidate = {"speaker_label": label, "status": "unknown"}
        if label not in selected or candidate.get("status") in {"existing", "new", "self"}:
            selected[label] = candidate
    return [selected.get(label, {"speaker_label": label, "status": "self" if normalized(label) == "me" else "unknown",
                               **({"name": "Me"} if normalized(label) == "me" else {})}) for label in labels]
