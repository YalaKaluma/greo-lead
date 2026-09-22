"""Read-only reporting for the evidence-tagging foundation stage."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session, selectinload

from app.models import (
    IntelligenceEvidence,
    IntelligenceEvidenceTag,
    IntelligenceMemoryTag,
    IntelligenceTwinStage,
)
from app.services.intelligence_backfill_service import SEED_SOURCE_TYPES


ENTITY_TAG_TYPES = ("person", "organization", "initiative")
QUALITY_FILTERS = {"all", "untagged", "no_entity", "low_confidence"}


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _active_window_filters(db: Session, user_id: int) -> list:
    filters = [IntelligenceEvidence.user_id == user_id]
    stage = db.query(IntelligenceTwinStage).filter(
        IntelligenceTwinStage.user_id == user_id,
        IntelligenceTwinStage.stage_key == "evidence_foundation",
    ).first()
    window_end_value = (stage.output_json or {}).get("window_end") if stage else None
    if window_end_value:
        window_end = _as_utc(datetime.fromisoformat(window_end_value))
        filters.append(or_(
            IntelligenceEvidence.source_type.in_(SEED_SOURCE_TYPES),
            IntelligenceEvidence.occurred_at <= window_end,
        ))
    return filters


def evidence_review_reasons(evidence: IntelligenceEvidence) -> list[str]:
    links = list(evidence.tag_links or [])
    if not links:
        return ["untagged"]
    entity_links = [link for link in links if link.tag and link.tag.tag_type in ENTITY_TAG_TYPES]
    reasons = []
    if not entity_links:
        reasons.append("no_entity")
    if any(float(link.confidence_score or 0) < 0.8 for link in entity_links):
        reasons.append("low_confidence")
    return reasons


def _quality_query(query, quality: str):
    entity_link = IntelligenceEvidenceTag.tag.has(
        IntelligenceMemoryTag.tag_type.in_(ENTITY_TAG_TYPES)
    )
    if quality == "untagged":
        return query.filter(~IntelligenceEvidence.tag_links.any())
    if quality == "no_entity":
        return query.filter(~IntelligenceEvidence.tag_links.any(entity_link))
    if quality == "low_confidence":
        return query.filter(IntelligenceEvidence.tag_links.any(and_(
            IntelligenceEvidenceTag.confidence_score < 0.8,
            entity_link,
        )))
    return query


def build_tagging_review(
    db: Session,
    user_id: int,
    *,
    tag_type: str | None = None,
    tag_id: int | None = None,
    source_type: str | None = None,
    quality: str = "all",
    limit: int = 20,
    offset: int = 0,
) -> dict:
    """Return aggregate coverage plus a paginated, source-backed audit sample."""
    if quality not in QUALITY_FILTERS:
        quality = "all"
    window_filters = _active_window_filters(db, user_id)
    base = db.query(IntelligenceEvidence).filter(*window_filters)
    total_evidence = base.count()
    tagged_evidence = base.filter(IntelligenceEvidence.tag_links.any()).count()
    entity_tagged_evidence = base.filter(IntelligenceEvidence.tag_links.any(
        IntelligenceEvidenceTag.tag.has(IntelligenceMemoryTag.tag_type.in_(ENTITY_TAG_TYPES))
    )).count()
    low_confidence_evidence = _quality_query(base, "low_confidence").count()

    source_totals = dict(
        db.query(IntelligenceEvidence.source_type, func.count(IntelligenceEvidence.id))
        .filter(*window_filters)
        .group_by(IntelligenceEvidence.source_type)
        .all()
    )
    source_tagged = dict(
        db.query(IntelligenceEvidence.source_type, func.count(func.distinct(IntelligenceEvidence.id)))
        .join(IntelligenceEvidenceTag, IntelligenceEvidenceTag.evidence_id == IntelligenceEvidence.id)
        .filter(*window_filters)
        .group_by(IntelligenceEvidence.source_type)
        .all()
    )
    source_coverage = [
        {
            "source_type": name,
            "evidence_count": count,
            "tagged_count": int(source_tagged.get(name, 0)),
            "untagged_count": max(0, count - int(source_tagged.get(name, 0))),
            "coverage_percent": round(100 * int(source_tagged.get(name, 0)) / max(1, count), 1),
        }
        for name, count in sorted(source_totals.items(), key=lambda item: (-item[1], item[0]))
    ]

    tag_rows = (
        db.query(
            IntelligenceMemoryTag.id,
            IntelligenceMemoryTag.tag_type,
            IntelligenceMemoryTag.display_value,
            IntelligenceMemoryTag.normalized_value,
            func.count(func.distinct(IntelligenceEvidence.id)).label("evidence_count"),
            func.count(func.distinct(IntelligenceEvidence.source_type)).label("source_count"),
            func.avg(IntelligenceEvidenceTag.confidence_score).label("average_confidence"),
            func.min(IntelligenceEvidence.occurred_at).label("first_seen_at"),
            func.max(IntelligenceEvidence.occurred_at).label("last_seen_at"),
        )
        .join(IntelligenceEvidenceTag, IntelligenceEvidenceTag.tag_id == IntelligenceMemoryTag.id)
        .join(IntelligenceEvidence, IntelligenceEvidence.id == IntelligenceEvidenceTag.evidence_id)
        .filter(IntelligenceMemoryTag.user_id == user_id, *window_filters)
    )
    if tag_type:
        tag_rows = tag_rows.filter(IntelligenceMemoryTag.tag_type == tag_type)
    tag_rows = (
        tag_rows.group_by(
            IntelligenceMemoryTag.id,
            IntelligenceMemoryTag.tag_type,
            IntelligenceMemoryTag.display_value,
            IntelligenceMemoryTag.normalized_value,
        )
        .order_by(func.count(func.distinct(IntelligenceEvidence.id)).desc(), IntelligenceMemoryTag.display_value)
        .limit(250)
        .all()
    )

    item_query = base.options(
        selectinload(IntelligenceEvidence.tag_links).selectinload(IntelligenceEvidenceTag.tag)
    )
    if tag_id is not None:
        item_query = item_query.filter(IntelligenceEvidence.tag_links.any(
            IntelligenceEvidenceTag.tag_id == tag_id
        ))
    if source_type:
        item_query = item_query.filter(IntelligenceEvidence.source_type == source_type)
    item_query = _quality_query(item_query, quality)
    matching_count = item_query.count()
    evidence_rows = (
        item_query.order_by(IntelligenceEvidence.occurred_at.desc(), IntelligenceEvidence.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return {
        "summary": {
            "evidence_count": total_evidence,
            "tagged_evidence_count": tagged_evidence,
            "untagged_evidence_count": max(0, total_evidence - tagged_evidence),
            "entity_tagged_evidence_count": entity_tagged_evidence,
            "without_entity_count": max(0, total_evidence - entity_tagged_evidence),
            "low_confidence_entity_count": low_confidence_evidence,
            "coverage_percent": round(100 * tagged_evidence / max(1, total_evidence), 1),
        },
        "source_coverage": source_coverage,
        "tags": [
            {
                "id": row.id,
                "tag_type": row.tag_type,
                "display_value": row.display_value,
                "normalized_value": row.normalized_value,
                "evidence_count": int(row.evidence_count or 0),
                "source_count": int(row.source_count or 0),
                "average_confidence": round(float(row.average_confidence or 0), 3),
                "first_seen_at": row.first_seen_at,
                "last_seen_at": row.last_seen_at,
            }
            for row in tag_rows
        ],
        "items": [
            {
                "id": row.id,
                "source_type": row.source_type,
                "source_id": row.source_id,
                "evidence_type": row.evidence_type,
                "excerpt": row.excerpt,
                "occurred_at": row.occurred_at,
                "review_reasons": evidence_review_reasons(row),
                "tags": [
                    {
                        "id": link.tag.id,
                        "tag_type": link.tag.tag_type,
                        "display_value": link.tag.display_value,
                        "confidence_score": round(float(link.confidence_score or 0), 3),
                        "source": link.source,
                    }
                    for link in sorted(
                        (link for link in row.tag_links if link.tag),
                        key=lambda link: (link.tag.tag_type, link.tag.display_value.lower()),
                    )
                ],
            }
            for row in evidence_rows
        ],
        "pagination": {
            "offset": offset,
            "limit": limit,
            "matching_count": matching_count,
            "has_more": offset + len(evidence_rows) < matching_count,
        },
    }
