"""Shared longitudinal intelligence for every Alfred product surface.

This service deliberately separates stored evidence from Alfred's inferences.
Consumers receive default guidance for cold-start users and progressively more
personal context only when the available claims clear confidence thresholds.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable, Sequence

from sqlalchemy.orm import Session, selectinload

from app.models import (
    IntelligenceClaim,
    IntelligenceClaimEvidence,
    IntelligenceEvidence,
    User,
)
from app.utils.ai_safety import UNTRUSTED_CONTEXT_POLICY, wrap_untrusted_context


DEFAULT_SURFACE_GUIDANCE = {
    "general": "Use Alfred's established coaching logic and the current request. Do not invent personal history.",
    "mtn": "Prioritize using goal alignment, urgency, leverage, dependencies, effort, and cost of delay.",
    "meeting": "Use the selected meeting evidence; separate facts, interpretations, decisions, and candidate actions.",
    "journal": "Brief the user on available events and ask focused reflection questions. Never write the journal entry.",
    "coaching": "Use sound coaching questions, clarify the user's framing, and avoid asserting an unsupported pattern.",
    "email": "Use the supplied email, requested intent, relationship information explicitly provided, and professional defaults.",
    "nudge": "Choose one timely, actionable intervention from current tasks, commitments, and deadlines.",
}

SURFACE_CLAIM_TYPES = {
    "mtn": {"commitment", "priority", "goal", "pattern", "state", "constraint"},
    "meeting": {"relationship", "pattern", "commitment", "goal", "state", "preference"},
    "journal": {"state", "pattern", "commitment", "goal", "relationship"},
    "coaching": {"identity", "value", "goal", "pattern", "state", "relationship", "constraint"},
    "email": {"communication", "preference", "relationship", "commitment", "decision", "goal"},
    "nudge": {"commitment", "priority", "goal", "pattern", "state", "constraint"},
}

HIGH_CONFIDENCE = 0.80
TENTATIVE_CONFIDENCE = 0.65
MAX_CANDIDATE_CLAIMS = 200
MAX_CONTEXT_ITEMS = 12


@dataclass(frozen=True)
class CompiledClaim:
    id: int
    statement: str
    claim_type: str
    epistemic_status: str
    confidence_score: float
    usage: str
    evidence: tuple[dict, ...]


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _normalized_terms(value: str | None) -> set[str]:
    return {
        term
        for term in re.findall(r"[a-zA-ZÀ-ÿ0-9]{3,}", str(value or "").casefold())
        if term not in {"the", "and", "for", "with", "that", "this", "une", "les", "des", "pour", "avec"}
    }


def infer_intelligence_stage(*, evidence_count: int, source_count: int, claims: Sequence) -> str:
    usable = [claim for claim in claims if _claim_usage(claim) is not None]
    validated_patterns = sum(
        1
        for claim in usable
        if getattr(claim, "epistemic_status", None) == "validated_pattern"
    )
    outcome_claims = sum(
        1
        for claim in usable
        if getattr(claim, "claim_type", None) in {"prediction_outcome", "recommendation_outcome"}
    )
    if evidence_count == 0 and not usable:
        return "new"
    if outcome_claims >= 10 and source_count >= 4 and validated_patterns >= 3:
        return "predictive"
    if evidence_count >= 20 and source_count >= 3 and len(usable) >= 5:
        return "personalized"
    return "learning"


def _claim_usage(claim, *, now: datetime | None = None) -> str | None:
    now = now or _now_utc()
    review_status = str(getattr(claim, "review_status", "active") or "active")
    if review_status in {"rejected", "corrected", "expired"}:
        return None
    valid_to = getattr(claim, "valid_to", None)
    if valid_to is not None:
        if valid_to.tzinfo is None:
            valid_to = valid_to.replace(tzinfo=timezone.utc)
        if valid_to < now:
            return None

    confidence = float(getattr(claim, "confidence_score", 0.0) or 0.0)
    epistemic_status = str(getattr(claim, "epistemic_status", "hypothesis") or "hypothesis")
    if review_status == "confirmed" or epistemic_status == "validated_pattern":
        return "trusted"
    if epistemic_status in {"fact", "user_statement"} and confidence >= HIGH_CONFIDENCE:
        return "trusted"
    if confidence >= TENTATIVE_CONFIDENCE:
        return "tentative"
    return None


def _claim_relevance(claim, *, surface: str, query_terms: set[str]) -> float:
    confidence = float(getattr(claim, "confidence_score", 0.0) or 0.0)
    claim_type = str(getattr(claim, "claim_type", "") or "")
    statement_terms = _normalized_terms(getattr(claim, "statement", ""))
    overlap = len(statement_terms & query_terms)
    surface_bonus = 0.35 if claim_type in SURFACE_CLAIM_TYPES.get(surface, set()) else 0.0
    confirmed_bonus = 0.3 if getattr(claim, "review_status", None) == "confirmed" else 0.0
    overlap_bonus = min(overlap * 0.18, 0.72)
    return confidence + surface_bonus + confirmed_bonus + overlap_bonus


def _sort_datetime(value: datetime | None) -> float:
    if value is None:
        return 0.0
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.timestamp()


def select_context_claims(
    claims: Iterable,
    *,
    surface: str,
    query: str | None = None,
    limit: int = MAX_CONTEXT_ITEMS,
) -> list:
    query_terms = _normalized_terms(query)
    usable = [claim for claim in claims if _claim_usage(claim) is not None]
    usable.sort(
        key=lambda claim: (
            _claim_relevance(claim, surface=surface, query_terms=query_terms),
            _sort_datetime(getattr(claim, "updated_at", None) or getattr(claim, "created_at", None)),
        ),
        reverse=True,
    )
    return usable[: max(1, min(limit, MAX_CONTEXT_ITEMS))]


def _evidence_payload(claim) -> tuple[dict, ...]:
    items = []
    for link in getattr(claim, "evidence_links", []) or []:
        evidence = getattr(link, "evidence", None)
        if evidence is None:
            continue
        items.append(
            {
                "id": evidence.id,
                "source_type": evidence.source_type,
                "source_id": evidence.source_id,
                "occurred_at": evidence.occurred_at,
                "excerpt": (evidence.excerpt or "")[:500] or None,
                "relationship_type": link.relationship_type,
            }
        )
    return tuple(items[:5])


class IntelligenceCoreService:
    def __init__(self, db: Session):
        self.db = db

    def record_evidence(
        self,
        *,
        user: User,
        source_type: str,
        source_id: str,
        evidence_key: str,
        evidence_type: str,
        occurred_at: datetime,
        excerpt: str | None = None,
        payload: dict | None = None,
    ) -> IntelligenceEvidence:
        evidence = (
            self.db.query(IntelligenceEvidence)
            .filter(
                IntelligenceEvidence.user_id == user.id,
                IntelligenceEvidence.source_type == source_type,
                IntelligenceEvidence.source_id == source_id,
                IntelligenceEvidence.evidence_key == evidence_key,
            )
            .first()
        )
        if evidence is None:
            evidence = IntelligenceEvidence(
                user_id=user.id,
                user_number=user.phone_number,
                source_type=source_type,
                source_id=source_id,
                evidence_key=evidence_key,
            )
            self.db.add(evidence)
        evidence.evidence_type = evidence_type
        evidence.occurred_at = occurred_at
        evidence.excerpt = (excerpt or "")[:2000] or None
        evidence.payload = payload
        self.db.commit()
        self.db.refresh(evidence)
        return evidence

    def record_claim(
        self,
        *,
        user: User,
        claim_type: str,
        statement: str,
        epistemic_status: str,
        confidence_score: float,
        evidence_ids: Sequence[int] = (),
        object_type: str = "attribute",
        scope: str | None = "general",
        stability: str = "recurring",
        subject_type: str | None = None,
        subject_id: str | None = None,
        metadata: dict | None = None,
    ) -> IntelligenceClaim:
        evidence = []
        if evidence_ids:
            evidence = (
                self.db.query(IntelligenceEvidence)
                .filter(
                    IntelligenceEvidence.user_id == user.id,
                    IntelligenceEvidence.id.in_(set(evidence_ids)),
                )
                .all()
            )
            if len(evidence) != len(set(evidence_ids)):
                raise ValueError("One or more evidence records are unavailable")
        if epistemic_status not in {"fact", "user_statement"} and not evidence:
            raise ValueError("Inferred claims require linked evidence")

        claim = IntelligenceClaim(
            user_id=user.id,
            user_number=user.phone_number,
            claim_type=claim_type,
            object_type=object_type,
            scope=scope,
            stability=stability,
            subject_type=subject_type,
            subject_id=subject_id,
            statement=statement[:4000],
            epistemic_status=epistemic_status,
            confidence_score=max(0.0, min(float(confidence_score), 1.0)),
            metadata_json=metadata,
        )
        self.db.add(claim)
        self.db.flush()
        for item in evidence:
            self.db.add(
                IntelligenceClaimEvidence(
                    claim_id=claim.id,
                    evidence_id=item.id,
                    relationship_type="supports",
                )
            )
        self.db.commit()
        return self.get_claim(user.id, claim.id)

    def get_claim(self, user_id: int, claim_id: int) -> IntelligenceClaim | None:
        return (
            self.db.query(IntelligenceClaim)
            .options(selectinload(IntelligenceClaim.evidence_links).selectinload(IntelligenceClaimEvidence.evidence))
            .options(selectinload(IntelligenceClaim.contexts))
            .filter(IntelligenceClaim.id == claim_id, IntelligenceClaim.user_id == user_id)
            .first()
        )

    def list_claims(self, user_id: int, *, include_inactive: bool = False, limit: int = 100) -> list[IntelligenceClaim]:
        query = (
            self.db.query(IntelligenceClaim)
            .options(selectinload(IntelligenceClaim.evidence_links).selectinload(IntelligenceClaimEvidence.evidence))
            .options(selectinload(IntelligenceClaim.contexts))
            .filter(IntelligenceClaim.user_id == user_id)
        )
        if not include_inactive:
            query = query.filter(IntelligenceClaim.review_status.in_(("active", "confirmed")))
        return query.order_by(IntelligenceClaim.updated_at.desc()).limit(max(1, min(limit, 200))).all()

    def review_claim(
        self,
        *,
        user: User,
        claim_id: int,
        action: str,
        corrected_statement: str | None = None,
    ) -> IntelligenceClaim:
        claim = self.get_claim(user.id, claim_id)
        if claim is None:
            raise LookupError("Claim not found")
        now = _now_utc()
        if action == "confirm":
            claim.review_status = "confirmed"
            claim.confirmed_at = now
            claim.confidence_score = 1.0
        elif action == "reject":
            claim.review_status = "rejected"
            claim.contradicted_at = now
        elif action == "correct":
            if not corrected_statement or not corrected_statement.strip():
                raise ValueError("A corrected statement is required")
            replacement = IntelligenceClaim(
                user_id=user.id,
                user_number=user.phone_number,
                claim_type=claim.claim_type,
                object_type=claim.object_type,
                scope=claim.scope,
                stability=claim.stability,
                subject_type=claim.subject_type,
                subject_id=claim.subject_id,
                statement=corrected_statement.strip()[:4000],
                epistemic_status="user_statement",
                confidence_score=1.0,
                review_status="confirmed",
                confirmed_at=now,
                metadata_json={"corrects_claim_id": claim.id},
            )
            self.db.add(replacement)
            self.db.flush()
            claim.review_status = "corrected"
            claim.contradicted_at = now
            claim.superseded_by_id = replacement.id
            self.db.commit()
            return self.get_claim(user.id, replacement.id)
        else:
            raise ValueError("Unsupported review action")
        self.db.commit()
        return self.get_claim(user.id, claim.id)

    def compile_context(
        self,
        *,
        user: User,
        surface: str = "general",
        query: str | None = None,
        limit: int = MAX_CONTEXT_ITEMS,
    ) -> dict:
        surface = surface if surface in DEFAULT_SURFACE_GUIDANCE else "general"
        claims = self.list_claims(user.id, limit=MAX_CANDIDATE_CLAIMS)
        evidence_rows = (
            self.db.query(IntelligenceEvidence.source_type, IntelligenceEvidence.payload)
            .filter(IntelligenceEvidence.user_id == user.id)
            .all()
        )
        primary_evidence = [
            row for row in evidence_rows
            if not (row.payload or {}).get("secondary_ai_derived")
            and not (row.payload or {}).get("context_only")
        ]
        evidence_count = len(primary_evidence)
        source_count = len({row.source_type for row in primary_evidence})
        selected = select_context_claims(claims, surface=surface, query=query, limit=limit)
        compiled = [
            CompiledClaim(
                id=claim.id,
                statement=claim.statement,
                claim_type=claim.claim_type,
                epistemic_status=claim.epistemic_status,
                confidence_score=float(claim.confidence_score),
                usage=_claim_usage(claim) or "excluded",
                evidence=_evidence_payload(claim),
            )
            for claim in selected
        ]
        stage = infer_intelligence_stage(
            evidence_count=int(evidence_count),
            source_count=int(source_count),
            claims=claims,
        )
        lines = [
            "ALFRED INTELLIGENCE CONTEXT",
            f"Intelligence stage: {stage}",
            f"Default behavior: {DEFAULT_SURFACE_GUIDANCE[surface]}",
        ]
        if not compiled:
            lines.append("No reliable personal claims are available. Use default behavior only.")
        else:
            lines.append("Personal context (trusted statements may be used; tentative hypotheses must be framed as questions):")
            for item in compiled:
                label = "TRUSTED" if item.usage == "trusted" else "TENTATIVE"
                lines.append(
                    wrap_untrusted_context(
                        f"{label}_{item.claim_type}",
                        f"{item.statement}\nConfidence: {item.confidence_score:.2f}",
                        4500,
                    )
                )
        return {
            "stage": stage,
            "surface": surface,
            "default_guidance": DEFAULT_SURFACE_GUIDANCE[surface],
            "personalization_applied": bool(compiled),
            "evidence_count": int(evidence_count),
            "source_count": int(source_count),
            "claims": [item.__dict__ for item in compiled],
            "prompt_context": f"{UNTRUSTED_CONTEXT_POLICY}\n\n" + "\n".join(lines),
        }
