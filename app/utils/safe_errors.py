"""Privacy-preserving helpers for unexpected API failures."""

from __future__ import annotations

import logging
import uuid

from fastapi import HTTPException


logger = logging.getLogger("app.security.errors")


def log_failure(context: str, error: Exception, *, level: int = logging.ERROR) -> str:
    """Record a failure without persisting exception text or private payloads."""

    incident_id = uuid.uuid4().hex[:12]
    logger.log(
        level,
        "Operation failed context=%s incident_id=%s error_type=%s",
        context,
        incident_id,
        type(error).__name__,
    )
    return incident_id


def internal_error(context: str, error: Exception, public_detail: str) -> HTTPException:
    """Log only an incident reference and exception type, never exception text."""

    incident_id = log_failure(context, error)
    return HTTPException(status_code=500, detail=f"{public_detail} Reference: {incident_id}")
