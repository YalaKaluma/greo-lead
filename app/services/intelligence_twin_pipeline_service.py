"""Gated, observable build pipeline for Alfred's Executive Digital Twin."""

from __future__ import annotations

import itertools
import re
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import selectinload

from app.db import SessionLocal
from app.models import (
    IntelligenceClaim,
    IntelligenceEvidence,
    IntelligenceEvidenceTag,
    IntelligenceTwinStage,
    IntelligenceWorldEntity,
    IntelligenceWorldRelationship,
    User,
)
from app.services.evidence_memory_service import tag_evidence_batch
from app.services.intelligence_backfill_service import (
    SEED_SOURCE_TYPES,
    build_core_twin_snapshot,
    collect_historical_evidence,
    synthesize_claims,
    upsert_evidence,
)
from app.utils.safe_errors import log_failure


TWIN_STAGE_DEFINITIONS = (
    ("evidence_foundation", 1),
    ("executive_world", 2),
    ("behavioral_profile", 3),
    ("dynamic_state", 4),
)
ACTIVE_STAGE_STATUSES = {"queued", "running"}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _normalize(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w\- ]+", " ", value.lower(), flags=re.UNICODE)).strip()


def ensure_twin_stages(db, user_id: int) -> list[IntelligenceTwinStage]:
    existing = {
        row.stage_key: row
        for row in db.query(IntelligenceTwinStage).filter(IntelligenceTwinStage.user_id == user_id).all()
    }
    changed = False
    for stage_key, stage_order in TWIN_STAGE_DEFINITIONS:
        if stage_key in existing:
            continue
        row = IntelligenceTwinStage(
            user_id=user_id,
            stage_key=stage_key,
            stage_order=stage_order,
            status="ready" if stage_order == 1 else "locked",
        )
        db.add(row)
        existing[stage_key] = row
        changed = True
    if changed:
        db.commit()
    return sorted(existing.values(), key=lambda row: row.stage_order)


def stage_is_unlocked(stages: list[IntelligenceTwinStage], stage_key: str) -> bool:
    by_key = {stage.stage_key: stage for stage in stages}
    stage = by_key.get(stage_key)
    if stage is None:
        return False
    if stage.stage_order == 1:
        return True
    previous = next((item for item in stages if item.stage_order == stage.stage_order - 1), None)
    return bool(previous and previous.status == "completed")


def _append_activity(stage: IntelligenceTwinStage, event: str, details: dict | None = None) -> None:
    activity = list(stage.activity_log or [])[-39:]
    activity.append({"at": _utc_now().isoformat(), "event": event, "details": details or {}})
    stage.activity_log = activity


def _update_progress(db, stage_id: int, percent: int, current: int = 0, total: int = 0, event: str | None = None, details: dict | None = None) -> None:
    row = db.query(IntelligenceTwinStage).filter(IntelligenceTwinStage.id == stage_id).first()
    if row is None:
        return
    row.progress_percent = max(0, min(100, int(percent)))
    row.progress_current = max(0, int(current))
    row.progress_total = max(0, int(total))
    if event:
        _append_activity(row, event, details)
    db.commit()


def _persist_progress(
    stage_id: int,
    percent: int,
    current: int = 0,
    total: int = 0,
    event: str | None = None,
    details: dict | None = None,
) -> None:
    progress_db = SessionLocal()
    try:
        _update_progress(progress_db, stage_id, percent, current, total, event, details)
    finally:
        progress_db.close()


def _persist_activity(stage_id: int, event: str, details: dict | None = None) -> None:
    activity_db = SessionLocal()
    try:
        row = activity_db.query(IntelligenceTwinStage).filter(IntelligenceTwinStage.id == stage_id).first()
        if row is None:
            return
        _append_activity(row, event, details)
        activity_db.commit()
    finally:
        activity_db.close()


def _complete_stage(db, stage: IntelligenceTwinStage, *, metrics: dict, output: dict) -> None:
    stage.status = "completed"
    stage.progress_percent = 100
    stage.progress_current = stage.progress_total
    stage.metrics_json = metrics
    stage.output_json = output
    stage.completed_at = _utc_now()
    stage.error_message = None
    stage.failure_reference = None
    _append_activity(stage, "stage_completed", metrics)
    next_stage = db.query(IntelligenceTwinStage).filter(
        IntelligenceTwinStage.user_id == stage.user_id,
        IntelligenceTwinStage.stage_order == stage.stage_order + 1,
    ).first()
    if next_stage is not None and next_stage.status == "locked":
        next_stage.status = "ready"
    db.commit()


def _run_evidence_foundation(db, stage: IntelligenceTwinStage, user: User, weeks: int | None) -> None:
    _update_progress(db, stage.id, 5, event="collecting_evidence")
    candidates = collect_historical_evidence(db, user)
    window_start = None
    window_end = None
    if candidates and weeks:
        chronological = [item for item in candidates if item.source_type not in SEED_SOURCE_TYPES] or candidates
        window_start = min(_as_utc(item.occurred_at) for item in chronological)
        history_end = max(_as_utc(item.occurred_at) for item in chronological)
        window_end = min(history_end, window_start + timedelta(weeks=weeks))
        candidates = [
            item for item in candidates
            if item.source_type in SEED_SOURCE_TYPES or _as_utc(item.occurred_at) <= window_end
        ]
    elif candidates:
        chronological = [item for item in candidates if item.source_type not in SEED_SOURCE_TYPES] or candidates
        window_start = min(_as_utc(item.occurred_at) for item in chronological)
        window_end = max(_as_utc(item.occurred_at) for item in chronological)
    evidence, _pending, source_counts, delta = upsert_evidence(db, user, candidates)
    total = len(evidence)
    _update_progress(db, stage.id, 20, 0, total, "evidence_prepared", {
        "evidence_count": total,
        "source_count": len(source_counts),
    })
    tag_evidence_batch(
        db,
        user,
        evidence,
        progress_callback=lambda completed, count: _update_progress(
            db,
            stage.id,
            20 + int(75 * completed / max(1, count)),
            completed,
            count,
            "evidence_tagged",
            {"current": completed, "total": count},
        ),
    )
    selected_ids = [row.id for row in evidence]
    selected_links = db.query(IntelligenceEvidenceTag).options(
        selectinload(IntelligenceEvidenceTag.tag),
    ).filter(IntelligenceEvidenceTag.evidence_id.in_(selected_ids)).all()
    tag_counts = dict(Counter(link.tag.tag_type for link in selected_links if link.tag))
    tagged_evidence = db.query(IntelligenceEvidenceTag.evidence_id).join(IntelligenceEvidence).filter(
        IntelligenceEvidence.user_id == user.id,
        IntelligenceEvidenceTag.evidence_id.in_(selected_ids),
    ).distinct().count()
    metrics = {
        "evidence_count": total,
        "source_count": len(source_counts),
        "tagged_evidence_count": tagged_evidence,
        "untagged_evidence_count": max(0, total - tagged_evidence),
        "new_evidence_count": int(delta["new"]),
        "changed_evidence_count": int(delta["changed"]),
    }
    _complete_stage(db, stage, metrics=metrics, output={
        "requested_weeks": weeks,
        "window_start": window_start.isoformat() if window_start else None,
        "window_end": window_end.isoformat() if window_end else None,
        "source_counts": source_counts,
        "tag_counts": tag_counts,
        "coverage_percent": round(100 * tagged_evidence / max(1, total), 1),
    })


def _evidence_in_active_window(db, user_id: int) -> list[IntelligenceEvidence]:
    foundation = db.query(IntelligenceTwinStage).filter(
        IntelligenceTwinStage.user_id == user_id,
        IntelligenceTwinStage.stage_key == "evidence_foundation",
    ).first()
    window_end_value = (foundation.output_json or {}).get("window_end") if foundation else None
    window_end = datetime.fromisoformat(window_end_value) if window_end_value else None
    rows = db.query(IntelligenceEvidence).filter(IntelligenceEvidence.user_id == user_id).all()
    if window_end is None:
        return rows
    return [
        row for row in rows
        if row.source_type in SEED_SOURCE_TYPES or _as_utc(row.occurred_at) <= _as_utc(window_end)
    ]


def _entity_candidates(db, user_id: int, allowed_evidence_ids: set[int]) -> dict[tuple[str, str], dict]:
    grouped: dict[tuple[str, str], dict] = {}
    links = db.query(IntelligenceEvidenceTag).options(
        selectinload(IntelligenceEvidenceTag.tag),
        selectinload(IntelligenceEvidenceTag.evidence),
    ).join(IntelligenceEvidence).filter(IntelligenceEvidence.user_id == user_id).all()
    for link in links:
        if link.evidence_id not in allowed_evidence_ids:
            continue
        if link.tag is None or link.evidence is None or link.tag.tag_type not in {"person", "project", "workstream"}:
            continue
        entity_type = link.tag.tag_type
        key = (entity_type, link.tag.normalized_value)
        bucket = grouped.setdefault(key, {
            "entity_type": entity_type,
            "normalized_name": link.tag.normalized_value,
            "display_name": link.tag.display_value,
            "evidence": [],
        })
        bucket["evidence"].append(link.evidence)

    for row in db.query(IntelligenceEvidence).filter(
        IntelligenceEvidence.user_id == user_id,
        IntelligenceEvidence.source_type.in_(("goal", "team_dynamic")),
    ).all():
        if row.id not in allowed_evidence_ids:
            continue
        name = (row.excerpt or "").splitlines()[0].strip()[:240]
        if not name:
            continue
        entity_type = "goal" if row.source_type == "goal" else "team"
        normalized = _normalize(name)
        key = (entity_type, normalized)
        bucket = grouped.setdefault(key, {
            "entity_type": entity_type,
            "normalized_name": normalized,
            "display_name": name,
            "evidence": [],
        })
        bucket["evidence"].append(row)
    return grouped


def _run_executive_world(db, stage: IntelligenceTwinStage, user: User) -> None:
    allowed_evidence = _evidence_in_active_window(db, user.id)
    allowed_evidence_ids = {row.id for row in allowed_evidence}
    grouped = _entity_candidates(db, user.id, allowed_evidence_ids)
    db.query(IntelligenceWorldRelationship).filter(
        IntelligenceWorldRelationship.user_id == user.id,
    ).delete(synchronize_session=False)
    db.query(IntelligenceWorldEntity).filter(
        IntelligenceWorldEntity.user_id == user.id,
    ).delete(synchronize_session=False)
    db.commit()

    saved: dict[tuple[str, str], IntelligenceWorldEntity] = {}
    items = list(grouped.items())
    for index, (key, item) in enumerate(items, start=1):
        evidence = sorted(item["evidence"], key=lambda row: row.occurred_at)
        excerpts = []
        for row in reversed(evidence):
            text = (row.excerpt or "").strip()
            if text and text not in excerpts:
                excerpts.append(text)
            if len(excerpts) == 3:
                break
        entity = IntelligenceWorldEntity(
            user_id=user.id,
            entity_type=item["entity_type"],
            normalized_name=item["normalized_name"],
            display_name=item["display_name"],
            summary=(excerpts[0][:1200] if excerpts else None),
            confidence_score=max(0.5, min(1.0, 0.5 + len(evidence) * 0.03)),
            evidence_count=len({row.id for row in evidence}),
            first_seen_at=evidence[0].occurred_at if evidence else None,
            last_seen_at=evidence[-1].occurred_at if evidence else None,
            metadata_json={
                "source_types": sorted({row.source_type for row in evidence}),
                "recent_evidence": [value[:500] for value in excerpts],
            },
        )
        db.add(entity)
        db.flush()
        saved[key] = entity
        if index % 50 == 0:
            _update_progress(db, stage.id, 10 + int(60 * index / max(1, len(items))), index, len(items), "world_entities_saved")
    db.commit()

    evidence_entities: dict[int, set[tuple[str, str]]] = defaultdict(set)
    tag_links = db.query(IntelligenceEvidenceTag).options(selectinload(IntelligenceEvidenceTag.tag)).join(
        IntelligenceEvidence,
    ).filter(IntelligenceEvidence.user_id == user.id).all()
    for link in tag_links:
        if link.evidence_id not in allowed_evidence_ids:
            continue
        if link.tag and link.tag.tag_type in {"person", "project", "workstream"}:
            evidence_entities[link.evidence_id].add((link.tag.tag_type, link.tag.normalized_value))
    pair_counts: Counter = Counter()
    for keys in evidence_entities.values():
        valid = sorted(key for key in keys if key in saved)
        for first, second in itertools.combinations(valid, 2):
            pair_counts[(first, second)] += 1
    for (first, second), count in pair_counts.most_common(250):
        if count < 2:
            continue
        source = saved[first]
        target = saved[second]
        db.add(IntelligenceWorldRelationship(
            user_id=user.id,
            source_entity_id=source.id,
            target_entity_id=target.id,
            relationship_type="associated_with",
            summary=f"Connected across {count} evidence points.",
            confidence_score=max(0.5, min(0.95, 0.5 + count * 0.03)),
            evidence_count=count,
        ))
    db.commit()
    counts = Counter(entity.entity_type for entity in saved.values())
    relationship_count = db.query(IntelligenceWorldRelationship.id).filter(
        IntelligenceWorldRelationship.user_id == user.id,
    ).count()
    top_entities = sorted(
        saved.values(),
        key=lambda row: (row.evidence_count, _as_utc(row.last_seen_at) if row.last_seen_at else datetime.min.replace(tzinfo=timezone.utc)),
        reverse=True,
    )[:20]
    metrics = {**{f"{key}_count": value for key, value in counts.items()}, "relationship_count": relationship_count}
    _complete_stage(db, stage, metrics=metrics, output={
        "entity_counts": dict(counts),
        "relationship_count": relationship_count,
        "top_entities": [world_entity_response(row) for row in top_entities],
    })


def _save_behavior_checkpoint(
    stage_id: int,
    plan_hash: str,
    batch_hash: str | None = None,
    claims: list[dict] | None = None,
    completed: int = 0,
    total: int = 0,
    consolidation_hash: str | None = None,
) -> None:
    checkpoint_db = SessionLocal()
    try:
        row = checkpoint_db.query(IntelligenceTwinStage).filter(IntelligenceTwinStage.id == stage_id).first()
        if row is None:
            return
        output = dict(row.output_json or {})
        checkpoint = dict(output.get("checkpoint") or {})
        if checkpoint.get("plan_hash") != plan_hash:
            checkpoint = {"plan_hash": plan_hash, "batches": {}, "consolidations": {}}
        if batch_hash:
            batches = dict(checkpoint.get("batches") or {})
            batches[batch_hash] = claims or []
            checkpoint["batches"] = batches
            checkpoint["completed_count"] = completed
            checkpoint["batch_total"] = total
        if consolidation_hash:
            consolidations = dict(checkpoint.get("consolidations") or {})
            consolidations[consolidation_hash] = claims or []
            checkpoint["consolidations"] = consolidations
        output["checkpoint"] = checkpoint
        row.output_json = output
        checkpoint_db.commit()
    finally:
        checkpoint_db.close()


def _run_behavioral_profile(db, stage: IntelligenceTwinStage, user: User) -> None:
    evidence = _evidence_in_active_window(db, user.id)
    checkpoint_data = dict((stage.output_json or {}).get("checkpoint") or {})
    _update_progress(db, stage.id, 10, 0, len(evidence), "behavior_analysis_started", {"evidence_count": len(evidence)})
    previous_claim_ids = {
        row.id for row in db.query(IntelligenceClaim).filter(
            IntelligenceClaim.user_id == user.id,
            IntelligenceClaim.review_status.in_(("active", "confirmed")),
        ).all()
        if (row.metadata_json or {}).get("origin") in {"historical_backfill", "digital_twin_rebuild"}
    }
    claims = synthesize_claims(
        db,
        user,
        evidence,
        processing_mode="staged_rebuild",
        checkpoint_data=checkpoint_data,
        checkpoint_callback=lambda plan_hash, batch_hash, claims, completed, total: _save_behavior_checkpoint(
            stage.id, plan_hash, batch_hash, claims, completed, total,
        ),
        consolidation_checkpoint_callback=lambda plan_hash, checkpoint_hash, claims: _save_behavior_checkpoint(
            stage.id, plan_hash, claims=claims, consolidation_hash=checkpoint_hash,
        ),
        progress_callback=lambda percent, _name, current, total: _persist_progress(
            stage.id, max(10, min(90, percent)), current, total,
        ),
        activity_callback=lambda event, details: _persist_activity(stage.id, event, details),
    )
    if previous_claim_ids:
        now = _utc_now()
        previous_claims = db.query(IntelligenceClaim).filter(
            IntelligenceClaim.id.in_(previous_claim_ids),
            IntelligenceClaim.review_status.in_(("active", "confirmed")),
        ).all()
        for previous in previous_claims:
            previous.review_status = "expired"
            previous.valid_to = now
        db.commit()
    active_claims = db.query(IntelligenceClaim).filter(
        IntelligenceClaim.user_id == user.id,
        IntelligenceClaim.review_status.in_(("active", "confirmed")),
    ).all()
    snapshot = build_core_twin_snapshot(db, user, active_claims)
    metrics = {"assertion_count": len(active_claims), "new_assertion_count": len(claims)}
    db.refresh(stage)
    _complete_stage(db, stage, metrics=metrics, output={
        "core_twin": snapshot.core_twin,
        "snapshot_id": snapshot.id,
        "checkpoint": (db.query(IntelligenceTwinStage).filter(IntelligenceTwinStage.id == stage.id).first().output_json or {}).get("checkpoint", {}),
    })


def _run_dynamic_state(db, stage: IntelligenceTwinStage, user: User) -> None:
    window_evidence = _evidence_in_active_window(db, user.id)
    latest = max((_as_utc(row.occurred_at) for row in window_evidence), default=_utc_now())
    cutoff = latest - timedelta(days=45)
    recent_ids = {row.id for row in window_evidence if _as_utc(row.occurred_at) >= cutoff}
    recent = db.query(IntelligenceEvidence).options(
        selectinload(IntelligenceEvidence.tag_links).selectinload(IntelligenceEvidenceTag.tag)
    ).filter(IntelligenceEvidence.id.in_(recent_ids)).order_by(IntelligenceEvidence.occurred_at.desc()).all()
    tag_counts = Counter(
        f"{link.tag.tag_type}:{link.tag.display_value}"
        for row in recent
        for link in row.tag_links
        if link.tag and link.tag.tag_type in {"person", "project", "workstream"}
    )
    current_claims = db.query(IntelligenceClaim).filter(
        IntelligenceClaim.user_id == user.id,
        IntelligenceClaim.review_status.in_(("active", "confirmed")),
        IntelligenceClaim.stability == "current",
    ).order_by(IntelligenceClaim.confidence_score.desc()).limit(20).all()
    output = {
        "window_days": 45,
        "active_contexts": [{"label": label, "evidence_count": count} for label, count in tag_counts.most_common(20)],
        "current_findings": [
            {"claim_id": row.id, "title": row.pattern_title, "statement": row.statement,
             "confidence_score": float(row.confidence_score)}
            for row in current_claims
        ],
        "recent_evidence_count": len(recent),
    }
    _complete_stage(db, stage, metrics={
        "recent_evidence_count": len(recent),
        "active_context_count": len(tag_counts),
        "current_finding_count": len(current_claims),
    }, output=output)


def execute_twin_stage(stage_id: int, user_id: int) -> None:
    db = SessionLocal()
    stage = None
    try:
        stage = db.query(IntelligenceTwinStage).filter(
            IntelligenceTwinStage.id == stage_id,
            IntelligenceTwinStage.user_id == user_id,
        ).first()
        user = db.query(User).filter(User.id == user_id).first()
        if stage is None or user is None:
            return
        stage.status = "running"
        stage.started_at = _utc_now()
        stage.completed_at = None
        stage.error_message = None
        stage.failure_reference = None
        stage.progress_percent = 1
        _append_activity(stage, "stage_started")
        db.commit()
        if stage.stage_key == "evidence_foundation":
            weeks = int((stage.output_json or {}).get("requested_weeks") or 0) or None
            _run_evidence_foundation(db, stage, user, weeks)
        elif stage.stage_key == "executive_world":
            _run_executive_world(db, stage, user)
        elif stage.stage_key == "behavioral_profile":
            _run_behavioral_profile(db, stage, user)
        elif stage.stage_key == "dynamic_state":
            _run_dynamic_state(db, stage, user)
        else:
            raise ValueError(f"Unknown Digital Twin stage: {stage.stage_key}")
    except Exception as error:
        db.rollback()
        reference = log_failure(f"digital_twin_stage_{stage_id}", error)
        stage = db.query(IntelligenceTwinStage).filter(IntelligenceTwinStage.id == stage_id).first()
        if stage is not None:
            stage.status = "failed"
            stage.error_message = "Alfred could not complete this Digital Twin stage. Saved outputs from earlier stages were preserved."
            stage.failure_reference = reference
            stage.completed_at = _utc_now()
            _append_activity(stage, "stage_failed", {"reference": reference})
            db.commit()
    finally:
        db.close()


def world_entity_response(entity: IntelligenceWorldEntity) -> dict:
    return {
        "id": entity.id,
        "entity_type": entity.entity_type,
        "display_name": entity.display_name,
        "summary": entity.summary,
        "status": entity.status,
        "confidence_score": float(entity.confidence_score or 0),
        "evidence_count": entity.evidence_count,
        "emotional_stance": entity.emotional_stance,
        "emotional_intensity": entity.emotional_intensity,
        "first_seen_at": entity.first_seen_at,
        "last_seen_at": entity.last_seen_at,
        "metadata": entity.metadata_json or {},
    }


def twin_stage_response(stage: IntelligenceTwinStage) -> dict:
    return {
        "id": stage.id,
        "stage_key": stage.stage_key,
        "stage_order": stage.stage_order,
        "status": stage.status,
        "progress_percent": stage.progress_percent,
        "progress_current": stage.progress_current,
        "progress_total": stage.progress_total,
        "metrics": stage.metrics_json or {},
        "output": stage.output_json or {},
        "activity_log": list(stage.activity_log or []),
        "can_run": stage.status in {"ready", "failed", "completed"},
        "error_message": stage.error_message,
        "failure_reference": stage.failure_reference,
        "started_at": stage.started_at,
        "completed_at": stage.completed_at,
        "updated_at": stage.updated_at,
    }
