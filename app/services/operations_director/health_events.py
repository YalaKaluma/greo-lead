import hashlib
import logging
import os
import re
import traceback
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import SystemHealthEvent


logger = logging.getLogger(__name__)

SECRET_KEYWORDS = {
    "authorization",
    "token",
    "access_token",
    "refresh_token",
    "api_key",
    "apikey",
    "password",
    "secret",
    "database_url",
    "db_url",
    "body",
    "content",
    "journal",
    "coaching",
}
REDACTION = "[REDACTED]"
MAX_MESSAGE_LENGTH = 500
MAX_STACK_LENGTH = 4000


def runtime_environment() -> str:
    value = (
        os.getenv("APP_ENV")
        or os.getenv("ENVIRONMENT")
        or os.getenv("RAILWAY_ENVIRONMENT_NAME")
        or "development"
    )
    return value.strip().lower() or "development"


def release_version() -> str | None:
    return os.getenv("RAILWAY_GIT_COMMIT_SHA") or os.getenv("GIT_COMMIT_SHA")


def normalize_category(category: str | None, source: str | None = None, status_code: int | None = None) -> str:
    text = f"{category or ''} {source or ''}".lower()
    if any(term in text for term in ("cron", "nudge", "job", "scheduled")):
        return "cron_failure"
    if any(term in text for term in ("openai", "twilio", "mailgun", "gmail", "github", "external")):
        return "external_service_failure"
    if any(term in text for term in ("database", "db", "sqlalchemy", "psycopg", "migration", "schema")):
        return "database_failure"
    if status_code and status_code >= 500:
        return "backend_500"
    if category:
        return category.strip().lower().replace(" ", "_")[:80]
    return "backend_500"


def severity_for(category: str, status_code: int | None = None, occurrence_count: int = 1) -> str:
    if category == "database_failure" or status_code and status_code >= 500 and occurrence_count >= 10:
        return "critical"
    if category in {"backend_500", "external_service_failure"} or occurrence_count >= 3:
        return "high"
    if category == "cron_failure":
        return "medium"
    return "low"


def sanitize_text(value: Any, limit: int = MAX_MESSAGE_LENGTH) -> str | None:
    if value is None:
        return None
    text = str(value)
    text = re.sub(r"(?is)\[SQL:.*?\]", "[SQL: REDACTED]", text)
    text = re.sub(r"(?is)\[parameters:.*?\]", "[parameters: REDACTED]", text)
    text = re.sub(r"(?is)\bDETAIL:\s*Key\s*\([^)]+\)=\([^)]+\)", "DETAIL: Key values redacted", text)
    text = re.sub(r"(?i)(bearer\s+)[a-z0-9._\-]+", rf"\1{REDACTION}", text)
    text = re.sub(r"(?i)(token|api[_-]?key|password|secret)=([^&\s]+)", rf"\1={REDACTION}", text)
    text = re.sub(r"(?i)(postgres(?:ql)?|mysql)://[^\s]+", REDACTION, text)
    text = re.sub(r"(?i)whatsapp:\+\d[\d\s().-]{6,}\d", "whatsapp:+[REDACTED]", text)
    text = re.sub(r"\+\d{7,15}", "+[REDACTED]", text)
    text = re.sub(r"(?i)\b[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}\b", "[REDACTED_EMAIL]", text)
    return text[:limit]


def sanitize_user_number(value: str | None) -> str | None:
    if not value:
        return None
    text = str(value)
    if len(text) <= 4:
        return REDACTION
    return f"{REDACTION}{text[-4:]}"


def sanitize_details(value: Any) -> Any:
    if value is None:
        return {}
    if isinstance(value, dict):
        safe = {}
        for key, item in value.items():
            lowered = str(key).lower()
            if any(secret in lowered for secret in SECRET_KEYWORDS):
                safe[key] = REDACTION
            else:
                safe[key] = sanitize_details(item)
        return safe
    if isinstance(value, list):
        return [sanitize_details(item) for item in value[:20]]
    if isinstance(value, (str, int, float, bool)):
        return sanitize_text(value, 300) if isinstance(value, str) else value
    return sanitize_text(value, 300)


def normalize_message(message: str | None) -> str:
    text = sanitize_text(message or "", 240) or ""
    text = re.sub(r"\b\d+\b", "#", text.lower())
    text = re.sub(r"\s+", " ", text).strip()
    return text


def build_dedupe_key(
    *,
    environment: str,
    category: str,
    endpoint: str | None = None,
    job_name: str | None = None,
    service_name: str | None = None,
    exception_type: str | None = None,
    message: str | None = None,
) -> str:
    raw = "|".join([
        environment,
        category,
        endpoint or job_name or service_name or "unknown",
        exception_type or "unknown",
        normalize_message(message),
    ])
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]
    return f"{raw[:420]}|{digest}"


class HealthEventService:
    def __init__(self, db: Session):
        self.db = db

    def record_health_event(
        self,
        *,
        source: str,
        category: str | None = None,
        severity: str | None = None,
        message: str | None = None,
        details: dict[str, Any] | None = None,
        stack_trace: str | None = None,
        endpoint: str | None = None,
        method: str | None = None,
        status_code: int | None = None,
        user_number: str | None = None,
        request_id: str | None = None,
        job_name: str | None = None,
        service_name: str | None = None,
        exception_type: str | None = None,
        environment: str | None = None,
        commit: bool = True,
    ) -> SystemHealthEvent:
        now = datetime.utcnow()
        normalized_environment = environment or runtime_environment()
        normalized_category = normalize_category(category, source, status_code)
        safe_message = sanitize_text(message)
        safe_details = sanitize_details({
            **(details or {}),
            **({"service_name": service_name} if service_name else {}),
            **({"exception_type": exception_type} if exception_type else {}),
        })
        safe_stack = sanitize_text(stack_trace, MAX_STACK_LENGTH)
        dedupe_key = build_dedupe_key(
            environment=normalized_environment,
            category=normalized_category,
            endpoint=endpoint,
            job_name=job_name,
            service_name=service_name,
            exception_type=exception_type,
            message=safe_message,
        )

        event = self._find_existing_event(dedupe_key)
        if event:
            event.last_seen_at = now
            event.updated_at = now
            event.occurrence_count = (event.occurrence_count or 1) + 1
            event.severity = severity or severity_for(normalized_category, status_code, event.occurrence_count)
            event.message = safe_message or event.message
            event.details_json = safe_details
            event.metadata_json = safe_details
            event.stack_trace = safe_stack or event.stack_trace
        else:
            event = SystemHealthEvent(
                event_type=normalized_category,
                environment=normalized_environment,
                category=normalized_category,
                severity=severity or severity_for(normalized_category, status_code, 1),
                source=source[:80] if source else None,
                details_json=safe_details,
                stack_trace=safe_stack,
                endpoint=endpoint[:240] if endpoint else None,
                path=endpoint[:240] if endpoint else None,
                method=method[:12] if method else None,
                status_code=status_code,
                user_number=sanitize_user_number(user_number),
                request_id=(request_id or "")[:120] or None,
                release_version=release_version(),
                job_name=job_name[:120] if job_name else None,
                dedupe_key=dedupe_key,
                first_seen_at=now,
                last_seen_at=now,
                occurrence_count=1,
                response_time_ms=(details or {}).get("response_time_ms") if isinstance(details, dict) else None,
                message=safe_message,
                metadata_json=safe_details,
                created_at=now,
                updated_at=now,
            )
            self.db.add(event)

        if commit:
            self.db.commit()
            try:
                self.db.refresh(event)
            except Exception as exc:
                logger.debug("Could not refresh health event after commit: %s", exc)
        else:
            try:
                self.db.flush()
            except Exception as exc:
                logger.debug("Could not flush health event before returning: %s", exc)
        return event

    def _find_existing_event(self, dedupe_key: str) -> SystemHealthEvent | None:
        if hasattr(self.db, "system_health_events"):
            for event in self.db.system_health_events:
                if event.dedupe_key == dedupe_key and not event.resolved_at:
                    return event
            return None

        return (
            self.db.query(SystemHealthEvent)
            .filter(SystemHealthEvent.dedupe_key == dedupe_key, SystemHealthEvent.resolved_at.is_(None))
            .first()
        )


def record_health_event(db: Session, **kwargs) -> SystemHealthEvent:
    return HealthEventService(db).record_health_event(**kwargs)


def record_health_event_with_new_session(**kwargs) -> None:
    db = SessionLocal()
    try:
        HealthEventService(db).record_health_event(**kwargs)
    except Exception as exc:
        logger.warning("Could not record operations health event: %s", exc)
        try:
            db.rollback()
        except Exception as rollback_exc:
            logger.debug("Could not roll back failed health event session: %s", rollback_exc)
    finally:
        db.close()


def record_exception(db: Session, *, source: str, exc: Exception, **kwargs) -> SystemHealthEvent:
    return record_health_event(
        db,
        source=source,
        message=str(exc),
        exception_type=type(exc).__name__,
        stack_trace="".join(traceback.format_exception(type(exc), exc, exc.__traceback__)),
        **kwargs,
    )


def record_job_failure(db: Session, *, job_name: str, error: Exception | str, **kwargs) -> SystemHealthEvent:
    return record_health_event(
        db,
        source=kwargs.pop("source", "cron"),
        category="cron_failure",
        job_name=job_name,
        message=str(error),
        exception_type=type(error).__name__ if isinstance(error, Exception) else None,
        **kwargs,
    )


def record_external_service_failure_with_new_session(
    *,
    service_name: str,
    operation: str,
    error: Exception | str,
    retry_status: str | None = None,
) -> None:
    record_health_event_with_new_session(
        source=service_name.lower(),
        category="external_service_failure",
        service_name=service_name,
        message=str(error),
        details={"operation": operation, "retry_status": retry_status},
        exception_type=type(error).__name__ if isinstance(error, Exception) else None,
    )
