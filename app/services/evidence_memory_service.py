"""Shared Level-3 evidence memory for meetings, journals, and email context."""

from __future__ import annotations

import hashlib
import json
import math
import re
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy.orm import Session, selectinload
from openai import OpenAI

from app.config import OPENAI_API_KEY, OPENAI_MODEL
from app.models import (
    IntelligenceEvidence,
    IntelligenceEvidenceTag,
    IntelligenceMemoryTag,
    JournalEntry,
    JourneyPerson,
    JourneyProject,
    Meeting,
    Message,
    Task,
    User,
)
from app.services.intelligence_backfill_service import (
    EvidenceCandidate,
    collect_historical_evidence,
    upsert_evidence,
)
from app.utils.ai_safety import UNTRUSTED_CONTEXT_POLICY, wrap_untrusted_context
from app.utils.ai_safety import parse_bounded_json_object


TAG_TYPES = {"person", "organization", "initiative"}
MEMORY_SOURCE_TYPES = {
    "journal", "message", "meeting", "meeting_transcript", "meeting_decision",
    "meeting_action", "meeting_observation", "task",
}
STOPWORDS = {
    "about", "after", "again", "also", "been", "being", "could", "from", "have", "into",
    "just", "more", "need", "that", "their", "them", "then", "there", "these", "they", "this",
    "those", "through", "very", "want", "what", "when", "where", "which", "with", "would", "your",
    "actually", "because", "either", "going", "know", "like", "make", "okay", "really", "said",
    "show", "speak", "talk", "think", "yeah",
    "pour", "avec", "dans", "mais", "nous", "vous", "cette", "comme", "plus", "faire", "être", "avoir",
}
MEETING_SOURCE_TYPES = {
    "meeting", "meeting_transcript", "meeting_decision", "meeting_action", "meeting_observation",
}


@dataclass(frozen=True)
class MemoryResult:
    evidence_id: int
    source_type: str
    source_id: str
    excerpt: str
    occurred_at: datetime
    tags: tuple[str, ...]
    score: float
    label: str | None = None
    supporting_items: int = 1


@dataclass(frozen=True)
class EntityDiscoveryEnvelope:
    """One model input with links back to the raw evidence it represents."""

    envelope_id: str
    source_type: str
    occurred_at: datetime
    text: str
    evidence_ids: tuple[int, ...]
    representative_evidence_id: int


def _normalize(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w\- ]+", " ", value.lower(), flags=re.UNICODE)).strip()


def _as_utc(value: datetime | None) -> datetime:
    if value is None:
        return datetime.min.replace(tzinfo=timezone.utc)
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _terms(value: str) -> set[str]:
    return {
        token for token in re.findall(r"[\w\-]+", _normalize(value), flags=re.UNICODE)
        if len(token) >= 4 and token not in STOPWORDS and not token.isdigit()
    }


def _entity_tags(db: Session, user: User, text: str) -> list[tuple[str, str, float]]:
    normalized = f" {_normalize(text)} "
    tags: list[tuple[str, str, float]] = []
    for person in db.query(JourneyPerson).filter(JourneyPerson.user_number == user.phone_number).all():
        name = (person.name or "").strip()
        if name and f" {_normalize(name)} " in normalized:
            tags.append(("person", name, 1.0))
    for project in db.query(JourneyProject).filter(JourneyProject.user_number == user.phone_number).all():
        name = (project.project_name or "").strip()
        if name and f" {_normalize(name)} " in normalized:
            tags.append(("initiative", name, 1.0))
    return tags


def set_evidence_tags(
    db: Session,
    evidence: IntelligenceEvidence,
    tags: list[tuple[str, str, float]],
    *,
    source: str = "automatic",
    replace_automatic: bool = True,
) -> None:
    if replace_automatic:
        db.query(IntelligenceEvidenceTag).filter(
            IntelligenceEvidenceTag.evidence_id == evidence.id,
            IntelligenceEvidenceTag.source == source,
        ).delete(synchronize_session=False)
    seen: set[tuple[str, str]] = set()
    for tag_type, display_value, confidence in tags:
        normalized = _normalize(display_value)[:240]
        if tag_type not in TAG_TYPES or not normalized or (tag_type, normalized) in seen:
            continue
        seen.add((tag_type, normalized))
        tag = db.query(IntelligenceMemoryTag).filter(
            IntelligenceMemoryTag.user_id == evidence.user_id,
            IntelligenceMemoryTag.tag_type == tag_type,
            IntelligenceMemoryTag.normalized_value == normalized,
        ).first()
        if tag is None:
            tag = IntelligenceMemoryTag(
                user_id=evidence.user_id,
                tag_type=tag_type,
                normalized_value=normalized,
                display_value=display_value.strip()[:240],
            )
            db.add(tag)
            db.flush()
        confidence_score = max(0.0, min(1.0, confidence))
        existing_link = db.query(IntelligenceEvidenceTag).filter(
            IntelligenceEvidenceTag.evidence_id == evidence.id,
            IntelligenceEvidenceTag.tag_id == tag.id,
        ).first()
        if existing_link is not None:
            existing_link.confidence_score = max(
                float(existing_link.confidence_score or 0), confidence_score,
            )
            source_priority = {"automatic": 0, "model": 1, "manual": 2}
            if source_priority.get(source, 1) > source_priority.get(existing_link.source, 1):
                existing_link.source = source
            continue
        db.add(IntelligenceEvidenceTag(
            evidence_id=evidence.id,
            tag_id=tag.id,
            confidence_score=confidence_score,
            source=source,
        ))


def tag_evidence(db: Session, user: User, evidence: IntelligenceEvidence) -> None:
    text = evidence.excerpt or ""
    tags = _entity_tags(db, user, text)
    payload = evidence.payload or {}
    for value in payload.get("participants", []) or []:
        tags.append(("person", str(value), 1.0))
    for value in payload.get("projects", []) or []:
        tags.append(("initiative", str(value), 1.0))
    for value in payload.get("people", []) or []:
        tags.append(("person", str(value), 1.0))
    for value in payload.get("workstreams", []) or []:
        tags.append(("initiative", str(value), 0.9))
    for value in payload.get("organizations", []) or []:
        tags.append(("organization", str(value), 0.95))
    set_evidence_tags(db, evidence, tags)


def tag_evidence_batch(
    db: Session,
    user: User,
    evidence_rows: list[IntelligenceEvidence],
    *,
    batch_size: int = 500,
    progress_callback=None,
) -> None:
    """Tag large histories without repeating entity and tag lookups for every record."""
    people = [
        (person.name.strip(), _normalize(person.name))
        for person in db.query(JourneyPerson).filter(JourneyPerson.user_number == user.phone_number).all()
        if (person.name or "").strip()
    ]
    projects = [
        (project.project_name.strip(), _normalize(project.project_name))
        for project in db.query(JourneyProject).filter(JourneyProject.user_number == user.phone_number).all()
        if (project.project_name or "").strip()
    ]
    tag_cache = {
        (tag.tag_type, tag.normalized_value): tag
        for tag in db.query(IntelligenceMemoryTag).filter(IntelligenceMemoryTag.user_id == user.id).all()
    }
    total = len(evidence_rows)
    for offset in range(0, total, batch_size):
        batch = evidence_rows[offset:offset + batch_size]
        proposed: dict[int, list[tuple[str, str, str, float]]] = {}
        missing: dict[tuple[str, str], str] = {}
        for evidence in batch:
            text = evidence.excerpt or ""
            normalized_text = f" {_normalize(text)} "
            tags = [
                ("person", display, 1.0)
                for display, normalized in people
                if f" {normalized} " in normalized_text
            ]
            tags.extend(
                ("initiative", display, 1.0)
                for display, normalized in projects
                if f" {normalized} " in normalized_text
            )
            payload = evidence.payload or {}
            for value in payload.get("participants", []) or []:
                tags.append(("person", str(value), 1.0))
            for value in payload.get("projects", []) or []:
                tags.append(("initiative", str(value), 1.0))
            for value in payload.get("people", []) or []:
                tags.append(("person", str(value), 1.0))
            for value in payload.get("workstreams", []) or []:
                tags.append(("initiative", str(value), 0.9))
            for value in payload.get("organizations", []) or []:
                tags.append(("organization", str(value), 0.95))

            seen = set()
            normalized_tags = []
            for tag_type, display_value, confidence in tags:
                normalized_value = _normalize(display_value)[:240]
                key = (tag_type, normalized_value)
                if tag_type not in TAG_TYPES or not normalized_value or key in seen:
                    continue
                seen.add(key)
                normalized_tags.append((tag_type, normalized_value, display_value.strip()[:240], confidence))
                if key not in tag_cache:
                    missing.setdefault(key, display_value.strip()[:240])
            proposed[evidence.id] = normalized_tags

        for (tag_type, normalized_value), display_value in missing.items():
            tag = IntelligenceMemoryTag(
                user_id=user.id,
                tag_type=tag_type,
                normalized_value=normalized_value,
                display_value=display_value,
            )
            db.add(tag)
            tag_cache[(tag_type, normalized_value)] = tag
        db.flush()
        evidence_ids = [row.id for row in batch]
        manual_pairs = {
            (link.evidence_id, link.tag_id)
            for link in db.query(IntelligenceEvidenceTag).filter(
                IntelligenceEvidenceTag.evidence_id.in_(evidence_ids),
                IntelligenceEvidenceTag.source != "automatic",
            ).all()
        }
        db.query(IntelligenceEvidenceTag).filter(
            IntelligenceEvidenceTag.evidence_id.in_(evidence_ids),
            IntelligenceEvidenceTag.source == "automatic",
        ).delete(synchronize_session=False)
        for evidence_id, tags in proposed.items():
            for tag_type, normalized_value, _display_value, confidence in tags:
                tag_id = tag_cache[(tag_type, normalized_value)].id
                if (evidence_id, tag_id) in manual_pairs:
                    continue
                db.add(IntelligenceEvidenceTag(
                    evidence_id=evidence_id,
                    tag_id=tag_id,
                    confidence_score=max(0.0, min(1.0, confidence)),
                    source="automatic",
                ))
        db.commit()
        completed = min(offset + len(batch), total)
        if progress_callback:
            progress_callback(completed, total)


def _meeting_envelope_text(rows: list[IntelligenceEvidence], *, max_characters: int = 18_000) -> str:
    """Keep meeting-level context while avoiding one model record per transcript segment."""
    priority = {
        "meeting": 0,
        "meeting_decision": 1,
        "meeting_action": 2,
        "meeting_observation": 3,
        "meeting_transcript": 4,
    }
    ordered = sorted(rows, key=lambda row: (
        priority.get(row.source_type, 9),
        _as_utc(row.occurred_at),
        row.id,
    ))
    unique_parts: list[str] = []
    seen: set[str] = set()
    for row in ordered:
        excerpt = (row.excerpt or "").strip()
        normalized = _normalize(excerpt)
        if not excerpt or normalized in seen:
            continue
        seen.add(normalized)
        unique_parts.append(f"[{row.source_type}] {excerpt}")

    if sum(len(part) + 1 for part in unique_parts) <= max_characters:
        return "\n".join(unique_parts)

    contextual = [part for part in unique_parts if not part.startswith("[meeting_transcript]")]
    transcripts = [part for part in unique_parts if part.startswith("[meeting_transcript]")]
    kept = contextual[:]
    remaining = max(0, max_characters - sum(len(part) + 1 for part in kept))
    if transcripts and remaining:
        average_slots = max(1, remaining // 900)
        if len(transcripts) <= average_slots:
            sampled = transcripts
        elif average_slots == 1:
            sampled = [transcripts[0]]
        else:
            indexes = {
                round(index * (len(transcripts) - 1) / (average_slots - 1))
                for index in range(average_slots)
            }
            sampled = [transcripts[index] for index in sorted(indexes)]
        kept.extend(sampled)
    return "\n".join(kept)[:max_characters]


def build_entity_discovery_envelopes(
    evidence_rows: list[IntelligenceEvidence],
) -> list[EntityDiscoveryEnvelope]:
    """Consolidate transcript-heavy meetings before model-assisted entity discovery."""
    meeting_groups: dict[str, list[IntelligenceEvidence]] = {}
    individual: list[IntelligenceEvidence] = []
    for row in evidence_rows:
        payload = row.payload or {}
        meeting_id = payload.get("meeting_id")
        if row.source_type in MEETING_SOURCE_TYPES and meeting_id is not None:
            meeting_groups.setdefault(str(meeting_id), []).append(row)
        else:
            individual.append(row)

    envelopes: list[EntityDiscoveryEnvelope] = []
    for meeting_id, rows in meeting_groups.items():
        representative = next((row for row in rows if row.source_type == "meeting"), rows[0])
        envelopes.append(EntityDiscoveryEnvelope(
            envelope_id=f"meeting:{meeting_id}",
            source_type="meeting",
            occurred_at=min((_as_utc(row.occurred_at) for row in rows), default=_as_utc(representative.occurred_at)),
            text=_meeting_envelope_text(rows),
            evidence_ids=tuple(sorted(row.id for row in rows)),
            representative_evidence_id=representative.id,
        ))
    envelopes.extend(
        EntityDiscoveryEnvelope(
            envelope_id=f"evidence:{row.id}",
            source_type=row.source_type,
            occurred_at=_as_utc(row.occurred_at),
            text=(row.excerpt or "")[:5000],
            evidence_ids=(row.id,),
            representative_evidence_id=row.id,
        )
        for row in individual
        if (row.excerpt or "").strip()
    )
    return sorted(envelopes, key=lambda item: (_as_utc(item.occurred_at), item.envelope_id))


def _entity_discovery_batches(
    envelopes: list[EntityDiscoveryEnvelope],
    *,
    max_records: int = 120,
    max_characters: int = 55_000,
) -> list[list[EntityDiscoveryEnvelope]]:
    batches: list[list[EntityDiscoveryEnvelope]] = []
    current: list[EntityDiscoveryEnvelope] = []
    size = 0
    for envelope in envelopes:
        row_size = len(envelope.text) + 100
        if current and (len(current) >= max_records or size + row_size > max_characters):
            batches.append(current)
            current = []
            size = 0
        current.append(envelope)
        size += row_size
    if current:
        batches.append(current)
    return batches


def discover_evidence_entities(
    db: Session,
    user: User,
    evidence_rows: list[IntelligenceEvidence],
    *,
    progress_callback=None,
    checkpoint_data: dict | None = None,
    checkpoint_callback=None,
) -> dict:
    """Discover People, Organizations, and Initiatives across mixed evidence batches.

    This intentionally runs only during the explicit Stage 1 historical build. Live
    writes keep using the deterministic, inexpensive tagger above.
    """
    if not OPENAI_API_KEY or not evidence_rows:
        return {"plan_hash": None, "completed_batches": [], "batch_total": 0, "envelope_count": 0}
    client = OpenAI(api_key=OPENAI_API_KEY, timeout=90.0, max_retries=1)
    envelopes = build_entity_discovery_envelopes(evidence_rows)
    batches = _entity_discovery_batches(envelopes)
    batch_hashes = [hashlib.sha256(json.dumps([
        (item.envelope_id, hashlib.sha256(item.text.encode("utf-8")).hexdigest())
        for item in batch
    ], separators=(",", ":")).encode("utf-8")).hexdigest() for batch in batches]
    plan_hash = hashlib.sha256("|".join(batch_hashes).encode("utf-8")).hexdigest()
    checkpoint_data = checkpoint_data or {}
    completed_batches = set(checkpoint_data.get("completed_batches") or []) \
        if checkpoint_data.get("plan_hash") == plan_hash else set()
    evidence_by_id = {row.id: row for row in evidence_rows}
    if progress_callback and completed_batches:
        progress_callback(len(completed_batches), len(batches), True)
    for index, batch in enumerate(batches, start=1):
        batch_hash = batch_hashes[index - 1]
        if batch_hash in completed_batches:
            continue
        records = [
            {
                "envelope_id": item.envelope_id,
                "source_type": item.source_type,
                "occurred_at": item.occurred_at.date().isoformat(),
                "text": item.text,
            }
            for item in batch if item.text.strip()
        ]
        if not records:
            continue
        response = client.chat.completions.create(
            model=OPENAI_MODEL,
            response_format={"type": "json_object"},
            temperature=0,
            max_tokens=6000,
            messages=[
                {
                    "role": "system",
                    "content": (
                        f"{UNTRUSTED_CONTEXT_POLICY}\n"
                        "Identify only named People, Organizations, and Initiatives in each record. "
                        "An Initiative is a named project, product, program, workstream, or major venture. "
                        "Do not create generic themes, activities, emotions, goals, or behavioral traits. "
                        "Use the clearest canonical name visible in the data. Do not invent identities. "
                        "Return JSON: {\"records\":[{\"envelope_id\":\"meeting:1\",\"entities\":["
                        "{\"type\":\"person|organization|initiative\",\"name\":\"...\","
                        "\"confidence\":0.0}]}]}."
                    ),
                },
                {
                    "role": "user",
                    "content": wrap_untrusted_context(
                        "mixed_historical_evidence",
                        json.dumps(records, ensure_ascii=False, default=str),
                        70_000,
                    ),
                },
            ],
        )
        parsed = parse_bounded_json_object(
            response.choices[0].message.content,
            max_characters=180_000,
            max_nodes=12_000,
        )
        by_id = {item.envelope_id: item for item in batch}
        tags_by_evidence: dict[int, list[tuple[str, str, float]]] = {}
        for item in parsed.get("records", [])[: len(records) * 2]:
            if not isinstance(item, dict):
                continue
            envelope_id = str(item.get("envelope_id") or "")
            if envelope_id not in by_id:
                continue
            envelope = by_id[envelope_id]
            for entity in item.get("entities", [])[:30]:
                if not isinstance(entity, dict):
                    continue
                tag_type = str(entity.get("type") or "").strip().lower()
                name = str(entity.get("name") or "").strip()
                try:
                    confidence = float(entity.get("confidence", 0.75))
                except (TypeError, ValueError):
                    confidence = 0.75
                if tag_type in TAG_TYPES and 1 < len(name) <= 240:
                    normalized_name = _normalize(name)
                    targets = {envelope.representative_evidence_id}
                    targets.update(
                        evidence_id for evidence_id in envelope.evidence_ids
                        if normalized_name and f" {normalized_name} " in f" {_normalize(evidence_by_id[evidence_id].excerpt or '')} "
                    )
                    for evidence_id in targets:
                        tags_by_evidence.setdefault(evidence_id, []).append((tag_type, name, confidence))
        for evidence_id, tags in tags_by_evidence.items():
            set_evidence_tags(db, evidence_by_id[evidence_id], tags, source="model")
        db.commit()
        completed_batches.add(batch_hash)
        if checkpoint_callback:
            checkpoint_callback(plan_hash, sorted(completed_batches), len(batches), len(envelopes))
        if progress_callback:
            progress_callback(len(completed_batches), len(batches), False)
    return {
        "plan_hash": plan_hash,
        "completed_batches": sorted(completed_batches),
        "batch_total": len(batches),
        "envelope_count": len(envelopes),
    }


def sync_candidates(db: Session, user: User, candidates: list[EvidenceCandidate]) -> list[IntelligenceEvidence]:
    saved, _, _, _ = upsert_evidence(db, user, candidates)
    for evidence in saved:
        tag_evidence(db, user, evidence)
    db.commit()
    return saved


def sync_journal_entry(db: Session, user: User, entry: JournalEntry) -> None:
    sync_candidates(db, user, [EvidenceCandidate(
        source_type="journal",
        source_id=str(entry.id),
        evidence_key="entry",
        evidence_type="user_statement",
        excerpt=(entry.text or "")[:4000],
        occurred_at=entry.created_at or datetime.now(timezone.utc),
    )])


def sync_email_context(db: Session, user: User, message_id: int, context: str) -> None:
    sync_candidates(db, user, [EvidenceCandidate(
        source_type="message",
        source_id=str(message_id),
        evidence_key="content",
        evidence_type="user_statement",
        excerpt=context[:4000],
        occurred_at=datetime.now(timezone.utc),
        payload={"conversation_type": "email", "message_type": "email_draft"},
    )])


def sync_journal_message(db: Session, user: User, message: Message) -> None:
    sync_candidates(db, user, [EvidenceCandidate(
        source_type="message",
        source_id=str(message.id),
        evidence_key="content",
        evidence_type="user_statement",
        excerpt=(message.content or "")[:4000],
        occurred_at=message.timestamp or datetime.now(timezone.utc),
        payload={"conversation_type": "journal", "message_type": message.message_type},
    )])


def sync_task_evidence(db: Session, user: User, task: Task) -> None:
    text = "\n".join(value for value in (task.title, task.notes, task.strategic_intent) if value)
    payload = {
        "status": task.status,
        "projects": [task.project] if task.project else [],
        "people": [task.delegated_to] if task.delegated_to else [],
    }
    sync_candidates(db, user, [EvidenceCandidate(
        source_type="task",
        source_id=str(task.id),
        evidence_key="state",
        evidence_type="outcome" if task.status == "completed" else "fact",
        excerpt=text[:4000],
        occurred_at=task.completed_at or task.updated_at or task.created_at or datetime.now(timezone.utc),
        payload=payload,
    )])


def source_tags(db: Session, user_id: int, source_type: str, source_id: str) -> list[dict]:
    evidence = db.query(IntelligenceEvidence).options(
        selectinload(IntelligenceEvidence.tag_links).selectinload(IntelligenceEvidenceTag.tag)
    ).filter(
        IntelligenceEvidence.user_id == user_id,
        IntelligenceEvidence.source_type == source_type,
        IntelligenceEvidence.source_id == str(source_id),
    ).first()
    if evidence is None:
        return []
    return [
        {"type": link.tag.tag_type, "value": link.tag.display_value, "source": link.source}
        for link in sorted(evidence.tag_links, key=lambda item: (item.tag.tag_type, item.tag.display_value.lower()))
    ]


def sync_meeting_evidence(db: Session, user: User, meeting_id: int) -> None:
    candidates = []
    for item in collect_historical_evidence(db, user):
        payload = item.payload or {}
        belongs = (
            item.source_type == "meeting" and item.source_id == str(meeting_id)
        ) or str(payload.get("meeting_id", "")) == str(meeting_id)
        if belongs:
            candidates.append(item)
    if not candidates:
        return
    saved = sync_candidates(db, user, candidates)
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if meeting is None:
        return
    participants = [row.display_name for row in meeting.participants if row.display_name and not row.is_current_user]
    projects = [row.project.project_name for row in meeting.project_links if row.project and row.project.project_name]
    contextual = [("person", name, 1.0) for name in participants] + [("initiative", name, 1.0) for name in projects]
    if meeting.title and meeting.title != "Untitled meeting":
        contextual.append(("initiative", meeting.title, 0.8))
    for evidence in saved:
        existing = [
            (link.tag.tag_type, link.tag.display_value, link.confidence_score)
            for link in evidence.tag_links
            if link.source == "automatic"
        ]
        set_evidence_tags(db, evidence, existing + contextual)
    db.commit()


def ensure_memory_index(db: Session, user: User) -> None:
    count = db.query(IntelligenceEvidence.id).filter(
        IntelligenceEvidence.user_id == user.id,
        IntelligenceEvidence.source_type.in_(MEMORY_SOURCE_TYPES),
    ).count()
    if count == 0:
        candidates = [item for item in collect_historical_evidence(db, user) if item.source_type in MEMORY_SOURCE_TYPES]
        if candidates:
            sync_candidates(db, user, candidates)


def retrieve_evidence(db: Session, user_number: str, query: str, limit: int = 8) -> list[MemoryResult]:
    user = db.query(User).filter(User.phone_number == user_number).first()
    if user is None:
        return []
    ensure_memory_index(db, user)
    def load_rows() -> list[IntelligenceEvidence]:
        return db.query(IntelligenceEvidence).options(
            selectinload(IntelligenceEvidence.tag_links).selectinload(IntelligenceEvidenceTag.tag)
        ).filter(
            IntelligenceEvidence.user_id == user.id,
            IntelligenceEvidence.source_type.in_(MEMORY_SOURCE_TYPES),
        ).order_by(IntelligenceEvidence.occurred_at.desc()).limit(500).all()

    rows = load_rows()
    needs_retag = [
        row for row in rows
        if not row.tag_links
    ]
    if needs_retag:
        for row in needs_retag:
            tag_evidence(db, user, row)
        db.commit()
        rows = load_rows()
    query_terms = _terms(query)
    query_normalized = _normalize(query)
    now = datetime.now(timezone.utc)
    ranked: list[tuple[MemoryResult, IntelligenceEvidence]] = []
    for row in rows:
        excerpt = row.excerpt or ""
        text_terms = _terms(excerpt)
        lexical = len(query_terms & text_terms) / max(1, len(query_terms))
        labels = tuple(f"{link.tag.tag_type}:{link.tag.display_value}" for link in row.tag_links)
        tag_overlap = sum(1 for link in row.tag_links if link.tag.normalized_value in query_normalized)
        occurred = row.occurred_at
        aware = occurred.replace(tzinfo=timezone.utc) if occurred.tzinfo is None else occurred.astimezone(timezone.utc)
        age_days = max(0.0, (now - aware).total_seconds() / 86400)
        recency = math.exp(-age_days / 120)
        score = (lexical * 0.55) + (min(tag_overlap, 3) / 3 * 0.3) + (recency * 0.15)
        if lexical > 0 or tag_overlap > 0:
            ranked.append((MemoryResult(row.id, row.source_type, row.source_id, excerpt, aware, labels, score), row))
    ranked.sort(key=lambda item: (item[0].score, item[0].occurred_at), reverse=True)
    return _consolidate_meeting_results(db, ranked, limit)


def _consolidate_meeting_results(
    db: Session,
    ranked: list[tuple[MemoryResult, IntelligenceEvidence]],
    limit: int,
) -> list[MemoryResult]:
    """Treat one meeting as one retrieval source, even when many transcript chunks match."""
    meeting_groups: dict[str, list[tuple[MemoryResult, IntelligenceEvidence]]] = {}
    standalone: list[MemoryResult] = []
    for result, row in ranked:
        if result.source_type not in MEETING_SOURCE_TYPES:
            standalone.append(result)
            continue
        payload = row.payload or {}
        meeting_id = str(payload.get("meeting_id") or (result.source_id if result.source_type == "meeting" else ""))
        if not meeting_id:
            standalone.append(result)
            continue
        meeting_groups.setdefault(meeting_id, []).append((result, row))

    numeric_ids = [int(value) for value in meeting_groups if value.isdigit()]
    meetings = {
        str(item.id): item
        for item in db.query(Meeting).filter(Meeting.id.in_(numeric_ids)).all()
    } if numeric_ids else {}
    bundled: list[MemoryResult] = []
    for meeting_id, items in meeting_groups.items():
        meeting = meetings.get(meeting_id)
        best = items[0][0]
        details: list[str] = []
        transcripts = 0
        for result, _row in items:
            if result.source_type == "meeting":
                continue
            if result.source_type == "meeting_transcript":
                if transcripts >= 2:
                    continue
                transcripts += 1
            if len(details) >= 4:
                break
            detail_type = result.source_type.removeprefix("meeting_").replace("_", " ").title()
            details.append(f"- {detail_type}: {result.excerpt[:700]}")
        summary = ""
        if meeting is not None:
            summary = meeting.executive_summary or meeting.one_line_summary or meeting.user_notes or ""
        parts = [f"Meeting: {(meeting.title if meeting else None) or 'Untitled meeting'}"]
        if summary:
            parts.append(f"Summary: {summary[:1400]}")
        if details:
            parts.append("Relevant details:\n" + "\n".join(details))
        unique_tags = list(dict.fromkeys(tag for result, _row in items for tag in result.tags))
        unique_tags.sort(key=lambda tag: (tag.startswith("theme:"), tag.lower()))
        tags = tuple(unique_tags[:8])
        occurred_at = meeting.started_at if meeting and meeting.started_at else best.occurred_at
        if occurred_at.tzinfo is None:
            occurred_at = occurred_at.replace(tzinfo=timezone.utc)
        bundled.append(MemoryResult(
            evidence_id=best.evidence_id,
            source_type="meeting",
            source_id=meeting_id,
            excerpt="\n".join(parts),
            occurred_at=occurred_at,
            tags=tags,
            score=best.score,
            label=(meeting.title if meeting else None),
            supporting_items=len(items),
        ))

    combined = standalone + bundled
    return sorted(combined, key=lambda item: (item.score, item.occurred_at), reverse=True)[:limit]


def format_evidence_context(results: list[MemoryResult]) -> str:
    if not results:
        return ""
    lines = [
        "CURRENT SOURCE EVIDENCE (more specific than Digital Twin patterns):",
        UNTRUSTED_CONTEXT_POLICY,
    ]
    for item in results:
        tags = ", ".join(item.tags) if item.tags else "untagged"
        metadata = f"[{item.source_type}; {item.occurred_at.date().isoformat()}; {tags}]"
        lines.append(f"- {metadata}\n{wrap_untrusted_context(item.source_type, item.excerpt, 1200)}")
    return "\n".join(lines)
