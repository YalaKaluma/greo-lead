from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import (
    IntelligenceBackfillRun,
    IntelligenceClaim,
    IntelligenceClaimContext,
    IntelligenceClaimEvidence,
    IntelligenceEvidence,
    IntelligencePatternFeedback,
    IntelligenceTwinSnapshot,
    User,
)
from app.routers.auth import require_authenticated_user
from app.services.intelligence_backfill_service import (
    OPENAI_MODEL,
    PROMPT_VERSION,
    TWIN_DIMENSIONS,
    execute_backfill_run,
)
from app.services.intelligence_core_service import IntelligenceCoreService


router = APIRouter()
ACTIVE_BACKFILL_STATUSES = ("queued", "ingesting", "synthesizing")
BACKFILL_STALE_AFTER = timedelta(minutes=5)


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _run_is_stale(run: IntelligenceBackfillRun, now: datetime | None = None) -> bool:
    if run.status not in ACTIVE_BACKFILL_STATUSES:
        return False
    last_activity = _as_utc(run.heartbeat_at or run.started_at or run.created_at)
    return bool(last_activity and last_activity < (now or datetime.now(timezone.utc)) - BACKFILL_STALE_AFTER)


def _mark_run_stalled(run: IntelligenceBackfillRun) -> None:
    run.status = "failed"
    run.error_message = (
        "The model update stopped before it completed. Retry to resume safely; "
        "your source data was not changed."
    )
    run.failure_stage = "worker_interrupted"
    run.progress_stage = "failed"
    run.completed_at = datetime.now(timezone.utc)


def _refresh_stalled_run(db: Session, run: IntelligenceBackfillRun | None) -> IntelligenceBackfillRun | None:
    if run is not None and _run_is_stale(run):
        _mark_run_stalled(run)
        db.commit()
        db.refresh(run)
    return run


def _backfill_response(run: IntelligenceBackfillRun | None):
    if run is None:
        return None
    return {
        "id": run.id,
        "status": run.status,
        "evidence_count": run.evidence_count,
        "claims_created": run.claims_created,
        "processing_mode": run.processing_mode,
        "new_evidence_count": run.new_evidence_count,
        "changed_evidence_count": run.changed_evidence_count,
        "unchanged_evidence_count": run.unchanged_evidence_count,
        "progress_percent": run.progress_percent,
        "progress_stage": run.progress_stage,
        "progress_current": run.progress_current,
        "progress_total": run.progress_total,
        "heartbeat_at": run.heartbeat_at,
        "activity_log": list(run.activity_log or []),
        "can_resume": run.status == "failed",
        "source_counts": run.source_counts or {},
        "window_weeks": getattr(run, "window_weeks", None),
        "window_start": getattr(run, "window_start", None),
        "window_end": getattr(run, "window_end", None),
        "error_message": run.error_message,
        "failure_stage": run.failure_stage,
        "failure_reference": run.failure_reference,
        "started_at": run.started_at,
        "completed_at": run.completed_at,
        "created_at": run.created_at,
    }


class EvidenceCreate(BaseModel):
    source_type: str = Field(min_length=1, max_length=40)
    source_id: str = Field(min_length=1, max_length=120)
    evidence_key: str = Field(default="primary", min_length=1, max_length=120)
    evidence_type: Literal["fact", "user_statement", "observation", "outcome"] = "observation"
    excerpt: str | None = Field(default=None, max_length=2000)
    payload: dict | None = None
    occurred_at: datetime


class ClaimCreate(BaseModel):
    claim_type: str = Field(min_length=1, max_length=40)
    object_type: Literal["intent", "attribute", "state", "relationship", "pattern", "capability"] = "attribute"
    scope: str | None = Field(default="general", max_length=80)
    stability: Literal["current", "recurring", "stable"] = "recurring"
    statement: str = Field(min_length=1, max_length=4000)
    epistemic_status: Literal["fact", "user_statement", "observation", "hypothesis", "validated_pattern"]
    confidence_score: float = Field(ge=0, le=1)
    evidence_ids: list[int] = Field(default_factory=list, max_length=20)
    subject_type: str | None = Field(default=None, max_length=40)
    subject_id: str | None = Field(default=None, max_length=120)
    metadata: dict | None = None


class BackfillStart(BaseModel):
    weeks: int | None = Field(default=None, ge=1, le=520)


def _reset_legacy_twin_for_user(db: Session, user_id: int) -> None:
    """Delete one user's generated twin while preserving every source record."""
    claim_ids = [
        row[0]
        for row in db.query(IntelligenceClaim.id).filter(IntelligenceClaim.user_id == user_id).all()
    ]
    if claim_ids:
        db.query(IntelligenceClaimContext).filter(
            IntelligenceClaimContext.claim_id.in_(claim_ids)
        ).delete(synchronize_session=False)
        db.query(IntelligenceClaimEvidence).filter(
            IntelligenceClaimEvidence.claim_id.in_(claim_ids)
        ).delete(synchronize_session=False)
    db.query(IntelligencePatternFeedback).filter(
        IntelligencePatternFeedback.user_id == user_id
    ).delete(synchronize_session=False)
    db.query(IntelligenceClaim).filter(
        IntelligenceClaim.user_id == user_id
    ).delete(synchronize_session=False)
    db.query(IntelligenceEvidence).filter(
        IntelligenceEvidence.user_id == user_id
    ).delete(synchronize_session=False)
    db.query(IntelligenceTwinSnapshot).filter(
        IntelligenceTwinSnapshot.user_id == user_id
    ).delete(synchronize_session=False)
    db.query(IntelligenceBackfillRun).filter(
        IntelligenceBackfillRun.user_id == user_id
    ).delete(synchronize_session=False)
    db.commit()


@router.post("/backfill")
def start_historical_backfill(
    background_tasks: BackgroundTasks,
    request: BackfillStart | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authenticated_user),
):
    requested_weeks = request.weeks if request else None
    active = (
        db.query(IntelligenceBackfillRun)
        .filter(
            IntelligenceBackfillRun.user_id == current_user.id,
            IntelligenceBackfillRun.status.in_(ACTIVE_BACKFILL_STATUSES),
        )
        .order_by(IntelligenceBackfillRun.created_at.desc())
        .first()
    )
    if active is not None:
        if active.prompt_version == PROMPT_VERSION and not _run_is_stale(active):
            return _backfill_response(active)
        _mark_run_stalled(active)
        db.commit()

    has_v1_run = db.query(IntelligenceBackfillRun.id).filter(
        IntelligenceBackfillRun.user_id == current_user.id,
        IntelligenceBackfillRun.prompt_version == PROMPT_VERSION,
    ).first() is not None
    if not has_v1_run:
        _reset_legacy_twin_for_user(db, current_user.id)

    resumable_runs = (
        db.query(IntelligenceBackfillRun)
        .filter(
            IntelligenceBackfillRun.user_id == current_user.id,
            IntelligenceBackfillRun.status == "failed",
            IntelligenceBackfillRun.prompt_version == PROMPT_VERSION,
            IntelligenceBackfillRun.model_version == OPENAI_MODEL,
        )
        .order_by(IntelligenceBackfillRun.created_at.desc())
        .all()
    )
    run = next((candidate for candidate in resumable_runs if candidate.window_weeks == requested_weeks), None)
    if run is None:
        previous = (
            db.query(IntelligenceBackfillRun)
            .filter(
                IntelligenceBackfillRun.user_id == current_user.id,
                IntelligenceBackfillRun.prompt_version == PROMPT_VERSION,
                IntelligenceBackfillRun.model_version == OPENAI_MODEL,
            )
            .order_by(IntelligenceBackfillRun.created_at.desc())
            .first()
        )
        run = IntelligenceBackfillRun(
            user_id=current_user.id,
            status="queued",
            prompt_version=PROMPT_VERSION,
            model_version=OPENAI_MODEL,
            window_weeks=requested_weeks,
            checkpoint_data=dict(previous.checkpoint_data or {}) if previous else None,
        )
        db.add(run)
    else:
        checkpoint = run.checkpoint_data or {}
        completed_count = int(checkpoint.get("completed_count") or 0)
        batch_total = int(checkpoint.get("batch_total") or 0)
        run.status = "queued"
        run.progress_stage = "queued"
        run.progress_current = completed_count
        run.progress_total = batch_total
        run.progress_percent = 20 + int(60 * completed_count / max(1, batch_total)) if batch_total else 0
        run.error_message = None
        run.failure_stage = None
        run.failure_reference = None
        run.completed_at = None
        run.heartbeat_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(run)
    background_tasks.add_task(execute_backfill_run, run.id, current_user.id)
    return _backfill_response(run)


@router.get("/backfill/latest")
def latest_historical_backfill(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authenticated_user),
):
    run = (
        db.query(IntelligenceBackfillRun)
        .filter(IntelligenceBackfillRun.user_id == current_user.id)
        .order_by(IntelligenceBackfillRun.created_at.desc())
        .first()
    )
    run = _refresh_stalled_run(db, run)
    return {"run": _backfill_response(run)}


def _evidence_response(evidence):
    return {
        "id": evidence.id,
        "source_type": evidence.source_type,
        "source_id": evidence.source_id,
        "evidence_key": evidence.evidence_key,
        "evidence_type": evidence.evidence_type,
        "excerpt": evidence.excerpt,
        "payload": evidence.payload,
        "occurred_at": evidence.occurred_at,
        "observed_at": evidence.observed_at,
        "synthesized_at": evidence.synthesized_at,
    }


def _claim_response(claim):
    dimensions = list((claim.metadata_json or {}).get("twin_dimensions") or [])
    return {
        "id": claim.id,
        "claim_type": claim.claim_type,
        "object_type": claim.object_type,
        "scope": claim.scope,
        "stability": claim.stability,
        "subject_type": claim.subject_type,
        "subject_id": claim.subject_id,
        "statement": claim.statement,
        "epistemic_status": claim.epistemic_status,
        "confidence_score": float(claim.confidence_score),
        "review_status": claim.review_status,
        "valid_from": claim.valid_from,
        "valid_to": claim.valid_to,
        "confirmed_at": claim.confirmed_at,
        "contradicted_at": claim.contradicted_at,
        "superseded_by_id": claim.superseded_by_id,
        "metadata": claim.metadata_json,
        "dimensions": dimensions,
        "pattern_key": claim.pattern_key,
        "pattern_title": claim.pattern_title,
        "interpretation": claim.interpretation,
        "trajectory": claim.trajectory,
        "context_summary": claim.context_summary,
        "alternative_explanation": claim.alternative_explanation,
        "coaching_implication": claim.coaching_implication,
        "first_seen_at": claim.first_seen_at,
        "last_seen_at": claim.last_seen_at,
        "contexts": [
            {"context_type": item.context_type, "label": item.label,
             "applicability": item.applicability, "notes": item.notes}
            for item in claim.contexts
        ],
        "evidence": [
            {
                **_evidence_response(link.evidence),
                "relationship_type": link.relationship_type,
                "relevance_score": link.relevance_score,
                "rationale": link.rationale,
                "independence_group": link.independence_group,
            }
            for link in claim.evidence_links
            if link.evidence is not None
        ],
        "created_at": claim.created_at,
        "updated_at": claim.updated_at,
    }


@router.post("/evidence")
def create_evidence(
    request: EvidenceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authenticated_user),
):
    evidence = IntelligenceCoreService(db).record_evidence(user=current_user, **request.model_dump())
    return _evidence_response(evidence)


@router.post("/claims")
def create_claim(
    request: ClaimCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authenticated_user),
):
    try:
        claim = IntelligenceCoreService(db).record_claim(user=current_user, **request.model_dump())
    except ValueError as error:
        raise HTTPException(status_code=400, detail="Claim evidence is invalid or unavailable.") from error
    return _claim_response(claim)


@router.get("/claims")
def list_claims(
    include_inactive: bool = False,
    limit: int = Query(default=100, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authenticated_user),
):
    claims = IntelligenceCoreService(db).list_claims(
        current_user.id,
        include_inactive=include_inactive,
        limit=limit,
    )
    return [_claim_response(claim) for claim in claims]


MODEL_SECTIONS = ("direction", "current_context", "how_i_operate", "relationships", "growth")
OPERATING_MODEL_AREAS = (
    "direction",
    "strengths",
    "operating_patterns",
    "current_pressures",
    "relationships",
    "development_edges",
)


def model_section(claim) -> str:
    object_type = str(getattr(claim, "object_type", "") or "")
    claim_type = str(getattr(claim, "claim_type", "") or "")
    if object_type == "state" or claim_type == "state":
        return "current_context"
    if object_type == "relationship" or claim_type == "relationship":
        return "relationships"
    if object_type == "capability" or claim_type in {"strength", "development_area"}:
        return "growth"
    if object_type == "intent" or claim_type in {"identity", "value", "goal", "commitment", "priority"}:
        return "direction"
    return "how_i_operate"


def operating_model_area(claim) -> str:
    """Place each assertion in one primary, user-facing operating-model area."""
    object_type = str(getattr(claim, "object_type", "") or "")
    claim_type = str(getattr(claim, "claim_type", "") or "")
    if object_type == "state" or claim_type == "state":
        return "current_pressures"
    if object_type == "relationship" or claim_type == "relationship":
        return "relationships"
    if claim_type in {"development_area", "constraint"}:
        return "development_edges"
    if object_type == "capability" or claim_type == "strength":
        return "strengths"
    if object_type == "intent" or claim_type in {
        "identity", "value", "goal", "commitment", "priority",
    }:
        return "direction"
    return "operating_patterns"


def _operating_model_item(claim, *, coaching: bool = False) -> dict:
    links = list(getattr(claim, "evidence_links", []) or [])
    statement = claim.coaching_implication if coaching else claim.statement
    return {
        "claim_id": claim.id,
        "title": claim.pattern_title,
        "statement": statement,
        "interpretation": claim.interpretation,
        "trajectory": claim.trajectory,
        "scope": claim.scope,
        "confidence_score": float(claim.confidence_score),
        "review_status": claim.review_status,
        "evidence_count": len(links),
        "counterevidence_count": sum(
            1 for link in links if link.relationship_type == "counters"
        ),
    }


def build_operating_model(claims: list) -> dict:
    """Create a concise map while keeping every summary linked to its dossier."""
    ranked = sorted(
        claims,
        key=lambda claim: (
            getattr(claim, "review_status", "") == "confirmed",
            getattr(claim, "epistemic_status", "") == "validated_pattern",
            float(getattr(claim, "confidence_score", 0) or 0),
            len(getattr(claim, "evidence_links", []) or []),
        ),
        reverse=True,
    )
    areas = {area: [] for area in OPERATING_MODEL_AREAS}
    for claim in ranked:
        area = operating_model_area(claim)
        if len(areas[area]) < 3:
            areas[area].append(_operating_model_item(claim))
    coaching_priorities = [
        _operating_model_item(claim, coaching=True)
        for claim in ranked
        if getattr(claim, "coaching_implication", None)
    ][:3]
    return {**areas, "coaching_priorities": coaching_priorities}


def build_full_twin(claims: list) -> dict:
    """Expose one characteristic through every dimension it informs."""
    grouped = {dimension: [] for dimension in TWIN_DIMENSIONS}
    for claim in claims:
        payload = _claim_response(claim)
        dimensions = [
            dimension for dimension in payload["dimensions"]
            if dimension in grouped
        ]
        if not dimensions:
            dimensions = ["operating_model"]
        for dimension in dimensions:
            grouped[dimension].append(payload)
    for items in grouped.values():
        items.sort(
            key=lambda item: (
                item["confidence_score"],
                len(item["evidence"]),
                item["updated_at"],
            ),
            reverse=True,
        )
    return grouped


@router.get("/model")
def get_executive_model(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authenticated_user),
):
    service = IntelligenceCoreService(db)
    claims = service.list_claims(current_user.id, limit=200)
    context = service.compile_context(user=current_user, surface="general", limit=12)
    core_snapshot = (
        db.query(IntelligenceTwinSnapshot)
        .filter(
            IntelligenceTwinSnapshot.user_id == current_user.id,
            IntelligenceTwinSnapshot.is_current.is_(True),
        )
        .order_by(IntelligenceTwinSnapshot.created_at.desc())
        .first()
    )
    run = (
        db.query(IntelligenceBackfillRun)
        .filter(IntelligenceBackfillRun.user_id == current_user.id)
        .order_by(IntelligenceBackfillRun.created_at.desc())
        .first()
    )
    run = _refresh_stalled_run(db, run)
    history_start, history_end = db.query(
        func.min(IntelligenceEvidence.occurred_at),
        func.max(IntelligenceEvidence.occurred_at),
    ).filter(IntelligenceEvidence.user_id == current_user.id).one()
    history_weeks = None
    if history_start and history_end:
        history_weeks = max(1, ((history_end - history_start).days // 7) + 1)
    return {
        "stage": context["stage"],
        "evidence_count": context["evidence_count"],
        "source_count": context["source_count"],
        "assertion_count": len(claims),
        "needs_review": 0,
        "core_twin": core_snapshot.core_twin if core_snapshot else None,
        "core_twin_updated_at": core_snapshot.created_at if core_snapshot else None,
        "full_twin": build_full_twin(claims),
        "last_run": _backfill_response(run),
        "history_start": history_start,
        "history_end": history_end,
        "history_weeks": history_weeks,
    }


@router.get("/context")
def compile_context(
    surface: Literal["general", "mtn", "meeting", "journal", "coaching", "email", "nudge"] = "general",
    query: str | None = Query(default=None, max_length=2000),
    limit: int = Query(default=12, ge=1, le=12),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authenticated_user),
):
    return IntelligenceCoreService(db).compile_context(
        user=current_user,
        surface=surface,
        query=query,
        limit=limit,
    )
