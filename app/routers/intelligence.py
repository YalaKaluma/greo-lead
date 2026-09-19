from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import IntelligenceBackfillRun, User
from app.routers.auth import require_authenticated_user
from app.services.intelligence_backfill_service import OPENAI_MODEL, PROMPT_VERSION, execute_backfill_run
from app.services.intelligence_core_service import IntelligenceCoreService


router = APIRouter()


def _backfill_response(run: IntelligenceBackfillRun | None):
    if run is None:
        return None
    return {
        "id": run.id,
        "status": run.status,
        "evidence_count": run.evidence_count,
        "claims_created": run.claims_created,
        "source_counts": run.source_counts or {},
        "error_message": run.error_message,
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
    statement: str = Field(min_length=1, max_length=4000)
    epistemic_status: Literal["fact", "user_statement", "observation", "hypothesis", "validated_pattern"]
    confidence_score: float = Field(ge=0, le=1)
    evidence_ids: list[int] = Field(default_factory=list, max_length=20)
    subject_type: str | None = Field(default=None, max_length=40)
    subject_id: str | None = Field(default=None, max_length=120)
    metadata: dict | None = None


class ClaimReview(BaseModel):
    action: Literal["confirm", "reject", "correct"]
    corrected_statement: str | None = Field(default=None, max_length=4000)


@router.post("/backfill")
def start_historical_backfill(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authenticated_user),
):
    active = (
        db.query(IntelligenceBackfillRun)
        .filter(
            IntelligenceBackfillRun.user_id == current_user.id,
            IntelligenceBackfillRun.status.in_(("queued", "ingesting", "synthesizing")),
            IntelligenceBackfillRun.created_at >= datetime.now(timezone.utc) - timedelta(hours=1),
        )
        .order_by(IntelligenceBackfillRun.created_at.desc())
        .first()
    )
    if active is not None:
        return _backfill_response(active)

    run = IntelligenceBackfillRun(
        user_id=current_user.id,
        status="queued",
        prompt_version=PROMPT_VERSION,
        model_version=OPENAI_MODEL,
    )
    db.add(run)
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
    }


def _claim_response(claim):
    return {
        "id": claim.id,
        "claim_type": claim.claim_type,
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
        "evidence": [
            {
                **_evidence_response(link.evidence),
                "relationship_type": link.relationship_type,
                "relevance_score": link.relevance_score,
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
        raise HTTPException(status_code=400, detail=str(error)) from error
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


@router.patch("/claims/{claim_id}")
def review_claim(
    claim_id: int,
    request: ClaimReview,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authenticated_user),
):
    try:
        claim = IntelligenceCoreService(db).review_claim(
            user=current_user,
            claim_id=claim_id,
            **request.model_dump(),
        )
    except LookupError as error:
        raise HTTPException(status_code=404, detail="Claim not found") from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return _claim_response(claim)


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
