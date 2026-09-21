"""Safe, shared access to Alfred's two-level Digital Twin.

Personalized reasoning surfaces should use this module instead of querying
Digital Twin tables directly. Factual extractors and classifiers deliberately
do not call it so that prior hypotheses cannot bias source extraction.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models import User
from app.services.intelligence_core_service import IntelligenceCoreService
from app.utils.safe_errors import log_failure


logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class TwinContext:
    """Prompt-ready Twin context plus non-sensitive trace metadata."""

    prompt_context: str = ""
    applied: bool = False
    core_twin_applied: bool = False
    stage: str = "new"
    surface: str = "general"
    snapshot_id: int | None = None
    claim_ids: tuple[int, ...] = ()

    def metadata(self) -> dict:
        return {
            "applied": self.applied,
            "core_twin_applied": self.core_twin_applied,
            "stage": self.stage,
            "surface": self.surface,
            "snapshot_id": self.snapshot_id,
            "claim_ids": list(self.claim_ids),
        }


def get_twin_context(
    db: Session,
    user_number: str,
    *,
    surface: str,
    query: str | None = None,
    limit: int = 8,
) -> TwinContext:
    """Return bounded Twin context without making the calling feature brittle.

    A missing user/Twin is a normal cold-start condition. Unexpected retrieval
    failures are logged, but the product surface continues with its established
    non-personalized behavior.
    """

    try:
        user = db.query(User).filter(
            or_(User.phone_number == user_number, User.email == user_number)
        ).first()
        if user is None:
            return TwinContext(surface=surface)
        compiled = IntelligenceCoreService(db).compile_context(
            user=user,
            surface=surface,
            query=query,
            limit=limit,
        )
    except Exception as exc:
        log_failure(f"twin_context_{surface}", exc, level=logging.WARNING)
        return TwinContext(surface=surface)

    applied = bool(compiled.get("personalization_applied"))
    result = TwinContext(
        prompt_context=str(compiled.get("prompt_context") or "") if applied else "",
        applied=applied,
        core_twin_applied=bool(compiled.get("core_twin_applied")),
        stage=str(compiled.get("stage") or "new"),
        surface=str(compiled.get("surface") or surface),
        snapshot_id=compiled.get("twin_snapshot_id"),
        claim_ids=tuple(
            int(item["id"])
            for item in (compiled.get("claims") or [])
            if item.get("id") is not None
        ),
    )
    logger.info(
        "Twin context prepared surface=%s stage=%s core=%s snapshot_id=%s claim_ids=%s",
        result.surface,
        result.stage,
        result.core_twin_applied,
        result.snapshot_id,
        list(result.claim_ids),
    )
    return result


def append_twin_context(base_context: str, twin: TwinContext) -> str:
    """Append prompt-ready Twin context while preserving cold-start behavior."""

    if not twin.applied or not twin.prompt_context:
        return base_context
    return (
        f"{base_context.rstrip()}\n\n"
        "DIGITAL TWIN GUIDANCE:\n"
        "Use this context to improve relevance, not to override current evidence. "
        "Treat tentative findings as hypotheses and never tell the user that a claim "
        "is certain merely because it appears here.\n"
        f"{twin.prompt_context}"
    )


def build_context_with_twin(
    db: Session,
    user_number: str,
    *,
    surface: str,
    query: str | None,
    base_context: str,
    limit: int = 8,
) -> str:
    """Convenience wrapper for existing services that already build context."""

    twin = get_twin_context(
        db,
        user_number,
        surface=surface,
        query=query,
        limit=limit,
    )
    if not twin.applied or not twin.prompt_context:
        return base_context
    twin_first = append_twin_context("", twin).lstrip()
    if not base_context.strip():
        return twin_first
    return (
        f"{twin_first}\n\n"
        "CURRENT USER AND PRODUCT CONTEXT (prefer this when it conflicts with older Twin findings):\n"
        f"{base_context}"
    )
