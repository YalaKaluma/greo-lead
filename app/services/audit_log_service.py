import logging
from typing import Any

from fastapi import Request
from sqlalchemy.orm import Session

from app.models import AuditLog, User
from app.utils.safe_errors import log_failure

logger = logging.getLogger(__name__)

SENSITIVE_METADATA_KEYS = {
    "content",
    "feedback_text",
    "journal_text",
    "message",
    "notes",
    "password",
    "prompt",
    "response_text",
    "secret",
    "text",
    "token",
}


def _clean_metadata(metadata: Any) -> Any:
    if isinstance(metadata, dict):
        clean = {}
        for key, value in metadata.items():
            if str(key).lower() in SENSITIVE_METADATA_KEYS:
                clean[key] = "[REDACTED]"
            else:
                clean[key] = _clean_metadata(value)
        return clean
    if isinstance(metadata, list):
        return [_clean_metadata(item) for item in metadata]
    return metadata


def user_id_for_identifier(db: Session, user_identifier: str | None) -> int | None:
    if not user_identifier:
        return None

    user = db.query(User).filter(
        (User.phone_number == user_identifier) | (User.email == user_identifier)
    ).first()
    return user.id if user else None


def write_audit_log(
    db: Session,
    user_id: int | None,
    event_type: str,
    object_type: str | None = None,
    object_id: Any | None = None,
    metadata: dict[str, Any] | None = None,
    request: Request | None = None,
) -> None:
    """Record a sensitive action without storing private user content."""
    try:
        ip_address = None
        user_agent = None
        if request is not None:
            forwarded_for = request.headers.get("x-forwarded-for")
            ip_address = (forwarded_for.split(",")[0].strip() if forwarded_for else None) or (
                request.client.host if request.client else None
            )
            user_agent = request.headers.get("user-agent")

        db.add(AuditLog(
            user_id=user_id,
            event_type=event_type,
            object_type=object_type,
            object_id=str(object_id) if object_id is not None else None,
            metadata_json=_clean_metadata(metadata or {}),
            ip_address=ip_address,
            user_agent=user_agent,
        ))
        db.commit()
    except Exception as exc:
        try:
            db.rollback()
        except Exception as rollback_exc:
            logger.debug("Could not rollback after audit log failure: %s", rollback_exc)
        log_failure("audit_log_write", exc, level=logging.WARNING)
