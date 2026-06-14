from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.models import OperationsIssueDraft, SystemHealthEvent
from app.services.operations_director.health_events import severity_for


DRAFT_ACTIVE_STATUSES = {"draft", "approved", "known_issue"}
logger = logging.getLogger(__name__)


class OperationsDirectorReviewer:
    def __init__(self, db: Session):
        self.db = db

    def review_recent_events(self, lookback_hours: int = 168) -> list[OperationsIssueDraft]:
        events = self._recent_unresolved_events(lookback_hours)
        created: list[OperationsIssueDraft] = []
        for event in events:
            if self._has_active_duplicate(event):
                continue
            draft = self._draft_for_event(event)
            self.db.add(draft)
            created.append(draft)

        if created:
            self.db.commit()
            for draft in created:
                try:
                    self.db.refresh(draft)
                except Exception as exc:
                    logger.debug("Could not refresh operations issue draft after commit: %s", exc)
        return created

    def _recent_unresolved_events(self, lookback_hours: int) -> list[SystemHealthEvent]:
        if hasattr(self.db, "system_health_events"):
            cutoff = datetime.utcnow() - timedelta(hours=lookback_hours)
            return [
                event for event in self.db.system_health_events
                if not event.resolved_at and (event.last_seen_at or event.created_at or cutoff) >= cutoff
            ]

        cutoff = datetime.utcnow() - timedelta(hours=lookback_hours)
        return (
            self.db.query(SystemHealthEvent)
            .filter(SystemHealthEvent.resolved_at.is_(None), SystemHealthEvent.last_seen_at >= cutoff)
            .order_by(SystemHealthEvent.last_seen_at.desc(), SystemHealthEvent.id.desc())
            .limit(100)
            .all()
        )

    def _has_active_duplicate(self, event: SystemHealthEvent) -> bool:
        dedupe_key = event.dedupe_key
        if hasattr(self.db, "operations_issue_drafts"):
            for draft in self.db.operations_issue_drafts:
                evidence = draft.evidence_json or {}
                if draft.status in DRAFT_ACTIVE_STATUSES and evidence.get("dedupe_key") == dedupe_key:
                    return True
            return False

        drafts = (
            self.db.query(OperationsIssueDraft)
            .filter(OperationsIssueDraft.status.in_(DRAFT_ACTIVE_STATUSES))
            .limit(250)
            .all()
        )
        return any((draft.evidence_json or {}).get("dedupe_key") == dedupe_key for draft in drafts)

    def _draft_for_event(self, event: SystemHealthEvent) -> OperationsIssueDraft:
        category = event.category or event.event_type or "backend_500"
        severity = self._draft_severity(event)
        target = event.endpoint or event.job_name or (event.details_json or {}).get("service_name") or event.source or "system"
        title = f"{severity.title()} {self._category_label(category)} in {target}"[:220]
        summary = self._summary(event, target)
        evidence = self._evidence(event, target)
        suspected_root_cause = self._suspected_root_cause(event)
        recommended_action = self._recommended_action(event)
        labels = self._labels(event, severity)
        codex_brief = build_codex_brief(
            title=title,
            context=f"Alfred Operations Director detected a recurring {self._category_label(category).lower()} signal.",
            problem=summary,
            evidence=evidence,
            suspected_root_cause=suspected_root_cause,
            objective=f"Investigate and fix the {self._category_label(category).lower()} affecting {target}.",
            recommended_implementation=recommended_action,
            likely_files=self._likely_files(event),
            validation_steps="Reproduce the failure signal, apply the fix, run the relevant backend checks, and confirm the health event no longer recurs.",
        )
        return OperationsIssueDraft(
            title=title,
            summary=summary,
            severity=severity,
            status="draft",
            environment=event.environment,
            category=category,
            source_event_ids=[event.id] if event.id is not None else [],
            evidence_json=evidence,
            suspected_root_cause=suspected_root_cause,
            recommended_action=recommended_action,
            codex_brief_markdown=codex_brief,
            github_labels_json=labels,
            created_by_agent="operations_director",
        )

    def _draft_severity(self, event: SystemHealthEvent) -> str:
        if event.severity in {"critical", "high", "medium", "low"}:
            return event.severity
        return severity_for(event.category or event.event_type or "backend_500", event.status_code, event.occurrence_count or 1)

    def _category_label(self, category: str) -> str:
        labels = {
            "backend_500": "Backend 500 error",
            "cron_failure": "Cron/nudge failure",
            "external_service_failure": "External service failure",
            "database_failure": "Database/migration failure",
        }
        return labels.get(category, category.replace("_", " "))

    def _summary(self, event: SystemHealthEvent, target: str) -> str:
        count = event.occurrence_count or 1
        category = self._category_label(event.category or event.event_type or "backend_500")
        return (
            f"{category} occurred {count} time{'s' if count != 1 else ''} in "
            f"{event.environment or 'unknown'} for {target}. Latest sanitized message: "
            f"{event.message or 'No message captured.'}"
        )

    def _evidence(self, event: SystemHealthEvent, target: str) -> dict[str, Any]:
        return {
            "environment": event.environment,
            "first_seen": event.first_seen_at.isoformat() if event.first_seen_at else None,
            "last_seen": event.last_seen_at.isoformat() if event.last_seen_at else None,
            "occurrences": event.occurrence_count or 1,
            "affected_target": target,
            "affected_users": event.user_number or "unknown",
            "related_health_events": [event.id] if event.id is not None else [],
            "dedupe_key": event.dedupe_key,
            "details": event.details_json or event.metadata_json or {},
        }

    def _suspected_root_cause(self, event: SystemHealthEvent) -> str:
        category = event.category or event.event_type
        if category == "database_failure":
            return "Database connectivity, schema drift, or a failed write/migration is the likely source. Confidence: medium."
        if category == "external_service_failure":
            service = (event.details_json or {}).get("service_name") or event.source or "external service"
            return f"{service} returned an error or was unavailable after retry handling. Confidence: medium."
        if category == "cron_failure":
            return "The scheduled nudge/job path failed during context building, AI generation, persistence, or downstream delivery. Confidence: medium."
        return "An unhandled backend exception or 500 response escaped the API path. Confidence: medium."

    def _recommended_action(self, event: SystemHealthEvent) -> str:
        category = event.category or event.event_type
        if category == "database_failure":
            return "Inspect the failing query/write path, verify the schema or migration state, add a regression check, and keep health-event logging sanitized."
        if category == "external_service_failure":
            return "Inspect the service operation, retry and timeout handling, error mapping, and fallback behavior. Add a test for the failed path."
        if category == "cron_failure":
            return "Run the affected scheduled job locally, isolate the failing step, add defensive handling around that step, and test the job failure capture."
        return "Reproduce the endpoint failure, identify the exception source, implement the fix, and add a regression test for the failing API behavior."

    def _labels(self, event: SystemHealthEvent, severity: str) -> list[str]:
        labels = ["operations-director", "system-health", "bug", severity, "codex-ready"]
        category_labels = {
            "backend_500": "backend",
            "cron_failure": "cron",
            "external_service_failure": "external-service",
            "database_failure": "db",
        }
        env = (event.environment or "").lower()
        if env in {"prod", "production", "staging", "dev", "development"}:
            labels.append("prod" if env == "production" else "dev" if env == "development" else env)
        labels.append(category_labels.get(event.category or event.event_type, "backend"))
        return sorted(set(labels))

    def _likely_files(self, event: SystemHealthEvent) -> list[str]:
        category = event.category or event.event_type
        if category == "cron_failure":
            return ["app/routers/nudge.py", "app/services/operations_director/health_events.py"]
        if category == "external_service_failure":
            return ["app/services/openai_service.py", "app/routers/nudge.py", "app/routers/webhook.py"]
        if category == "database_failure":
            return ["app/models.py", "db_migrations/", "app/db.py"]
        return ["app/main.py", event.endpoint or "affected router/service"]


def build_codex_brief(
    *,
    title: str,
    context: str,
    problem: str,
    evidence: dict[str, Any],
    suspected_root_cause: str,
    objective: str,
    recommended_implementation: str,
    likely_files: list[str],
    validation_steps: str,
) -> str:
    files = "\n".join(f"- {item}" for item in likely_files)
    related = evidence.get("related_health_events") or []
    return f"""# Codex Brief - {title}

## Context

{context}

## Problem

{problem}

## Evidence

- Environment: {evidence.get("environment") or "unknown"}
- First seen: {evidence.get("first_seen") or "unknown"}
- Last seen: {evidence.get("last_seen") or "unknown"}
- Occurrences: {evidence.get("occurrences") or 0}
- Affected endpoint/job/service: {evidence.get("affected_target") or "unknown"}
- Affected users if known: {evidence.get("affected_users") or "unknown"}
- Related health events: {", ".join(str(item) for item in related) if related else "none"}

## Suspected Root Cause

{suspected_root_cause}

## Objective

{objective}

## Recommended Implementation

{recommended_implementation}

## Files / Areas Likely Involved

{files}

## Acceptance Criteria

- [ ] Issue is reproduced or root cause is confirmed.
- [ ] Fix is implemented.
- [ ] Regression test is added where practical.
- [ ] Existing tests pass.
- [ ] No secrets or private user data are exposed in logs.
- [ ] Operational health event is marked resolved or no longer recurring.

## Validation Steps

{validation_steps}

## Notes

Generated by Alfred Operations Director.
Approved by Yala before GitHub issue creation.
"""
