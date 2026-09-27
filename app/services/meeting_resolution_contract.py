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
            properties["shared_speaker_label"] = {"type": "boolean"}
            properties["speaker_label"] = {"type": "string", "enum": speaker_labels}
        return {"type": "object", "properties": properties,
                "required": list(properties), "additionalProperties": False}
    properties = {
        "primary_goal": entity("goals", "title", ["existing", "new", "none"]),
        "people": {"type": "array", "items": entity("people", "name", ["existing", "new", "unknown", "self"])},
        "primary_project": entity("projects", "name", ["existing", "new", "none"]),
        "additional_projects": {"type": "array", "items": entity("projects", "name", ["existing", "new", "none"])},
    }
    return {"type": "object", "properties": properties,
            "required": list(properties), "additionalProperties": False}


def validate_catalog_choices(resolution, catalog, transcript):
    """Reject name/ID disagreement and unsupported quotations before DB retrieval."""
    for key, kind, name_field in [("primary_goal", "goals", "title"),
                                  ("primary_project", "projects", "name"),
                                  ("additional_projects", "projects", "name"),
                                  ("people", "people", "name")]:
        rows = resolution.get(key) or ([] if key == "people" else {})
        for item in rows if isinstance(rows, list) else [rows]:
            item["model_status"] = item.get("status")
            if kind == "people":
                label = re.escape(str(item.get("speaker_label") or ""))
                name = str(item.get("name") or "")
                name = re.sub(rf"^(?:Speaker )?{label}\s*[-:(]\s*|\s*\((?:Speaker )?{label}\)$", "", name, flags=re.I).strip(" )")
                item["name"] = name
                matches = [r for r in catalog.get("people", []) if normalized(r.get("name")) == normalized(name)]
                if item.get("status") == "new" and matches:
                    # A different role description is not proof of a different person.
                    item.update(status="unknown", id=None, validation_reason="existing_name_requires_review")
            if item.get("status") not in {"existing", "new"}:
                item.setdefault("validation_reason", "model_" + str(item.get("status")))
                continue
            item.update(sourced_evidence(item, transcript))
            valid = grounded(item.get("evidence_excerpt"), transcript)
            if item.get("status") == "existing":
                record = next((r for r in catalog.get(kind, []) if r["id"] == item.get("id")), None)
                valid = valid and record is not None and normalized(item.get(name_field)) == normalized(
                    (record or {}).get("name") or (record or {}).get("title"))
            if not valid:
                item.update(status="unknown" if key == "people" else "none", id=None,
                            validation_reason="unsupported_evidence" if not grounded(item.get("evidence_excerpt"), transcript)
                            else "catalog_identity_mismatch")
            else:
                item["validation_reason"] = "validated_catalog_and_evidence"
    return resolution


def canonical_people(people, labels):
    """Keep real labels but allow multiple independently identified attendees per label."""
    by_key = {normalized(label): label for label in labels}
    groups = {label: [] for label in labels}
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
        signature = (candidate.get("id"), normalized(candidate.get("name")), candidate.get("status"))
        if not any((r.get("id"), normalized(r.get("name")), r.get("status")) == signature for r in groups[label]):
            groups[label].append(candidate)
    result = []
    for label, rows in groups.items():
        known = [r for r in rows if r.get("status") in {"existing", "new", "self"}]
        chosen = known or rows[:1] or [{"speaker_label": label, "status": "self" if normalized(label) == "me" else "unknown",
                                      **({"name": "Me"} if normalized(label) == "me" else {})}]
        result.extend({**r, "shared_speaker_label": len(known) > 1 or bool(r.get("shared_speaker_label"))} for r in chosen)
    return result
