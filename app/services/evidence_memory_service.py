"""Shared Level-3 evidence memory for meetings, journals, and email context."""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy.orm import Session, selectinload

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


TAG_TYPES = {"person", "project", "workstream", "theme"}
MEMORY_SOURCE_TYPES = {
    "journal", "message", "meeting", "meeting_transcript", "meeting_decision",
    "meeting_action", "meeting_observation", "task",
}
STOPWORDS = {
    "about", "after", "again", "also", "been", "being", "could", "from", "have", "into",
    "just", "more", "need", "that", "their", "them", "then", "there", "these", "they", "this",
    "those", "through", "very", "want", "what", "when", "where", "which", "with", "would", "your",
    "pour", "avec", "dans", "mais", "nous", "vous", "cette", "comme", "plus", "faire", "être", "avoir",
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


def _normalize(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w\- ]+", " ", value.lower(), flags=re.UNICODE)).strip()


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
            tags.append(("project", name, 1.0))
    return tags


def _theme_tags(text: str, limit: int = 6) -> list[tuple[str, str, float]]:
    # Stable, explainable topical anchors provide a useful fallback before richer entities are known.
    terms = sorted(_terms(text), key=lambda term: (-text.lower().count(term), term))
    return [("theme", term, 0.65) for term in terms[:limit]]


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
        db.add(IntelligenceEvidenceTag(
            evidence_id=evidence.id,
            tag_id=tag.id,
            confidence_score=max(0.0, min(1.0, confidence)),
            source=source,
        ))


def tag_evidence(db: Session, user: User, evidence: IntelligenceEvidence) -> None:
    text = evidence.excerpt or ""
    tags = _entity_tags(db, user, text) + _theme_tags(text)
    payload = evidence.payload or {}
    for value in payload.get("participants", []) or []:
        tags.append(("person", str(value), 1.0))
    for value in payload.get("projects", []) or []:
        tags.append(("project", str(value), 1.0))
    for value in payload.get("people", []) or []:
        tags.append(("person", str(value), 1.0))
    for value in payload.get("workstreams", []) or []:
        tags.append(("workstream", str(value), 0.9))
    set_evidence_tags(db, evidence, tags)


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
    contextual = [("person", name, 1.0) for name in participants] + [("project", name, 1.0) for name in projects]
    if meeting.title and meeting.title != "Untitled meeting":
        contextual.append(("workstream", meeting.title, 0.8))
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
    untagged = [row for row in rows if not row.tag_links]
    if untagged:
        for row in untagged:
            tag_evidence(db, user, row)
        db.commit()
        rows = load_rows()
    query_terms = _terms(query)
    query_normalized = _normalize(query)
    now = datetime.now(timezone.utc)
    ranked: list[MemoryResult] = []
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
            ranked.append(MemoryResult(row.id, row.source_type, row.source_id, excerpt, aware, labels, score))
    return sorted(ranked, key=lambda item: (item.score, item.occurred_at), reverse=True)[:limit]


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
