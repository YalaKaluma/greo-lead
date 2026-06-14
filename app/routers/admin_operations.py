from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import OperationsIssueDraft, SystemHealthEvent, User
from app.routers.admin import _log_admin_action, require_admin
from app.services.github.issues import GitHubIssueError, create_github_issue
from app.services.operations_director.health_events import record_health_event, sanitize_details, sanitize_text
from app.services.operations_director.reviewer import OperationsDirectorReviewer


router = APIRouter(tags=["admin-operations"])


SEVERITY_RANK = {"critical": 0, "high": 1, "medium": 2, "low": 3, "error": 1, "warning": 2, "info": 3}


class OperationsChatRequest(BaseModel):
    message: str


def _iso(value) -> str | None:
    return value.isoformat() if value else None


def _safe_text(value: Any, limit: int = 500) -> str | None:
    text = sanitize_text(value, limit)
    if text is None:
        return None
    return " ".join(text.split())


def _safe_markdown(value: str | None, limit: int = 12000) -> str:
    return sanitize_text(value or "", limit) or ""


def _event_to_dict(event: SystemHealthEvent) -> dict[str, Any]:
    return {
        "id": event.id,
        "environment": event.environment,
        "source": event.source,
        "category": event.category or event.event_type,
        "severity": event.severity,
        "message": _safe_text(event.message, 300),
        "details": sanitize_details(event.details_json or event.metadata_json or {}),
        "endpoint": event.endpoint or event.path,
        "method": event.method,
        "status_code": event.status_code,
        "user_number": event.user_number,
        "request_id": event.request_id,
        "release_version": event.release_version,
        "job_name": event.job_name,
        "dedupe_key": event.dedupe_key,
        "first_seen_at": _iso(event.first_seen_at or event.created_at),
        "last_seen_at": _iso(event.last_seen_at or event.created_at),
        "occurrence_count": event.occurrence_count or 1,
        "resolved_at": _iso(event.resolved_at),
        "created_at": _iso(event.created_at),
        "updated_at": _iso(event.updated_at),
    }


def _draft_to_dict(draft: OperationsIssueDraft) -> dict[str, Any]:
    return {
        "id": draft.id,
        "title": draft.title,
        "summary": _safe_text(draft.summary, 700),
        "severity": draft.severity,
        "status": draft.status,
        "environment": draft.environment,
        "category": draft.category,
        "source_event_ids": draft.source_event_ids or [],
        "evidence": sanitize_details(draft.evidence_json or {}),
        "suspected_root_cause": _safe_text(draft.suspected_root_cause, 500),
        "recommended_action": _safe_text(draft.recommended_action, 500),
        "codex_brief_markdown": _safe_markdown(draft.codex_brief_markdown),
        "github_labels": draft.github_labels_json or [],
        "github_issue_number": draft.github_issue_number,
        "github_issue_url": draft.github_issue_url,
        "created_by_agent": draft.created_by_agent,
        "reviewed_by": draft.reviewed_by,
        "reviewed_at": _iso(draft.reviewed_at),
        "created_at": _iso(draft.created_at),
        "updated_at": _iso(draft.updated_at),
    }


def _get_draft(db: Session, draft_id: int) -> OperationsIssueDraft:
    draft = db.query(OperationsIssueDraft).filter(OperationsIssueDraft.id == draft_id).first()
    if not draft:
        raise HTTPException(status_code=404, detail="Issue draft not found")
    return draft


def _severity_sort_key(item: Any) -> tuple[int, str]:
    severity = (getattr(item, "severity", None) or "").lower()
    last_seen = getattr(item, "last_seen_at", None) or getattr(item, "created_at", None)
    return (SEVERITY_RANK.get(severity, 4), str(last_seen or ""))


def _sort_by_criticality(items: list[Any]) -> list[Any]:
    return sorted(items, key=_severity_sort_key)


def _build_executive_summary(drafts: list[OperationsIssueDraft], events: list[SystemHealthEvent]) -> dict[str, Any]:
    open_drafts = [draft for draft in drafts if draft.status in {"draft", "approved", "known_issue"}]
    github_created = [draft for draft in drafts if draft.status == "github_created"]
    critical_or_high = [
        draft for draft in open_drafts
        if (draft.severity or "").lower() in {"critical", "high", "error"}
    ]
    recurring_events = [
        event for event in events
        if (event.occurrence_count or 1) >= 3 and not event.resolved_at
    ]
    top_issue = _sort_by_criticality(open_drafts)[0] if open_drafts else None

    if top_issue:
        recommendation = f"Review '{top_issue.title}' first and decide whether to create the GitHub issue."
    elif recurring_events:
        recommendation = "Run review to convert recurring health events into issue drafts."
    else:
        recommendation = "No urgent operations action is waiting right now."

    return {
        "headline": (
            f"{len(critical_or_high)} critical/high draft{'s' if len(critical_or_high) != 1 else ''} "
            f"and {len(recurring_events)} recurring health signal{'s' if len(recurring_events) != 1 else ''} need review."
        ),
        "recommendation": recommendation,
        "open_drafts": len(open_drafts),
        "github_created": len(github_created),
        "health_events": len(events),
        "critical_or_high": len(critical_or_high),
        "recurring_events": len(recurring_events),
        "top_issue_id": top_issue.id if top_issue else None,
        "top_issue_title": top_issue.title if top_issue else None,
    }


def _operations_chat_response(message: str, drafts: list[OperationsIssueDraft], events: list[SystemHealthEvent]) -> str:
    question = (message or "").strip().lower()
    sorted_drafts = _sort_by_criticality(drafts)
    open_drafts = [draft for draft in sorted_drafts if draft.status in {"draft", "approved", "known_issue"}]
    summary = _build_executive_summary(drafts, events)

    if not question:
        return "Ask me about the highest-risk issue, recurring failures, GitHub-ready drafts, or what to review next."

    if any(term in question for term in ["critical", "highest", "priority", "first", "next"]):
        if not open_drafts:
            return "There are no open issue drafts. Run review if new health events have appeared."
        draft = open_drafts[0]
        return (
            f"Start with '{draft.title}' ({draft.severity}). "
            f"{_safe_text(draft.summary, 400)} Recommended action: "
            f"{_safe_text(draft.recommended_action, 300) or 'Confirm the failure and prepare the GitHub issue.'}"
        )

    if any(term in question for term in ["recurring", "repeat", "again", "events", "signals"]):
        recurring = [event for event in _sort_by_criticality(events) if (event.occurrence_count or 1) >= 3 and not event.resolved_at]
        if not recurring:
            return "I do not see recurring unresolved health signals above the review threshold."
        lines = [
            f"- {(event.category or event.event_type)} in {event.environment or 'unknown'}: {event.occurrence_count or 1} occurrences, latest target {event.endpoint or event.job_name or event.source or 'unknown'}"
            for event in recurring[:5]
        ]
        return "Recurring signals I would watch:\n" + "\n".join(lines)

    if any(term in question for term in ["github", "issue", "draft", "codex"]):
        if not open_drafts:
            return "No GitHub-ready drafts are waiting for approval."
        lines = [
            f"- {draft.title} ({draft.severity}, {draft.status})"
            for draft in open_drafts[:5]
        ]
        return "GitHub-ready drafts, sorted by criticality:\n" + "\n".join(lines)

    return (
        f"Executive summary: {summary['headline']} "
        f"My recommendation: {summary['recommendation']}"
    )


@router.get("/operations/health-events")
def list_health_events(
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    events = (
        db.query(SystemHealthEvent)
        .order_by(SystemHealthEvent.last_seen_at.desc().nullslast(), SystemHealthEvent.id.desc())
        .limit(250)
        .all()
    )
    return {
        "health_events": [_event_to_dict(event) for event in _sort_by_criticality(events)],
        "current_admin_id": admin_user.id,
    }


@router.get("/operations/issue-drafts")
def list_issue_drafts(
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    drafts = (
        db.query(OperationsIssueDraft)
        .order_by(OperationsIssueDraft.created_at.desc(), OperationsIssueDraft.id.desc())
        .limit(250)
        .all()
    )
    events = (
        db.query(SystemHealthEvent)
        .order_by(SystemHealthEvent.last_seen_at.desc().nullslast(), SystemHealthEvent.id.desc())
        .limit(250)
        .all()
    )
    sorted_drafts = _sort_by_criticality(drafts)
    return {
        "issue_drafts": [_draft_to_dict(draft) for draft in sorted_drafts],
        "executive_summary": _build_executive_summary(sorted_drafts, events),
        "current_admin_id": admin_user.id,
    }


@router.post("/operations/review")
def run_operations_review(
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    reviewer = OperationsDirectorReviewer(db)
    drafts = reviewer.review_recent_events()
    _log_admin_action(
        db,
        admin_user,
        "operations_director_review",
        None,
        {"created_draft_count": len(drafts)},
    )
    db.commit()
    return {
        "created_draft_count": len(drafts),
        "issue_drafts": [_draft_to_dict(draft) for draft in _sort_by_criticality(drafts)],
        "current_admin_id": admin_user.id,
    }


@router.post("/operations/chat")
def chat_with_operations_director(
    request: OperationsChatRequest,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    drafts = (
        db.query(OperationsIssueDraft)
        .order_by(OperationsIssueDraft.created_at.desc(), OperationsIssueDraft.id.desc())
        .limit(250)
        .all()
    )
    events = (
        db.query(SystemHealthEvent)
        .order_by(SystemHealthEvent.last_seen_at.desc().nullslast(), SystemHealthEvent.id.desc())
        .limit(250)
        .all()
    )
    _log_admin_action(
        db,
        admin_user,
        "operations_director_chat",
        None,
        {"message_length": len(request.message or "")},
    )
    db.commit()
    return {
        "reply": _operations_chat_response(request.message, drafts, events),
        "executive_summary": _build_executive_summary(drafts, events),
        "current_admin_id": admin_user.id,
    }


@router.post("/operations/issue-drafts/{draft_id}/dismiss")
def dismiss_issue_draft(
    draft_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    draft = _get_draft(db, draft_id)
    draft.status = "dismissed"
    draft.reviewed_by = admin_user.email or admin_user.phone_number or str(admin_user.id)
    draft.reviewed_at = datetime.utcnow()
    _log_admin_action(db, admin_user, "operations_issue_draft_dismissed", None, {"draft_id": draft.id})
    db.commit()
    db.refresh(draft)
    return {"issue_draft": _draft_to_dict(draft)}


@router.post("/operations/issue-drafts/{draft_id}/mark-known")
def mark_issue_draft_known(
    draft_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    draft = _get_draft(db, draft_id)
    draft.status = "known_issue"
    draft.reviewed_by = admin_user.email or admin_user.phone_number or str(admin_user.id)
    draft.reviewed_at = datetime.utcnow()
    _log_admin_action(db, admin_user, "operations_issue_draft_marked_known", None, {"draft_id": draft.id})
    db.commit()
    db.refresh(draft)
    return {"issue_draft": _draft_to_dict(draft)}


@router.post("/operations/issue-drafts/{draft_id}/create-github-issue")
def create_issue_from_draft(
    draft_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    draft = _get_draft(db, draft_id)
    if draft.status == "github_created":
        return {"issue_draft": _draft_to_dict(draft)}
    if not draft.codex_brief_markdown:
        raise HTTPException(status_code=400, detail="Codex-ready brief is required before GitHub issue creation.")

    reviewer = admin_user.email or admin_user.phone_number or str(admin_user.id)
    draft.status = "approved"
    draft.reviewed_by = reviewer
    draft.reviewed_at = datetime.utcnow()
    db.commit()
    db.refresh(draft)

    try:
        issue = create_github_issue(
            title=draft.title,
            body=_safe_markdown(draft.codex_brief_markdown),
            labels=draft.github_labels_json or [],
        )
    except GitHubIssueError as exc:
        record_health_event(
            db,
            source="github",
            category="external_service_failure",
            service_name="GitHub",
            message=str(exc),
            details={"operation": "create_issue", "draft_id": draft.id},
        )
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        record_health_event(
            db,
            source="github",
            category="external_service_failure",
            service_name="GitHub",
            message=str(exc),
            details={"operation": "create_issue", "draft_id": draft.id},
        )
        raise HTTPException(
            status_code=502,
            detail="GitHub issue creation failed. Alfred recorded this as a health event.",
        ) from exc

    draft.github_issue_number = issue.get("number")
    draft.github_issue_url = issue.get("url")
    draft.status = "github_created"
    _log_admin_action(
        db,
        admin_user,
        "operations_issue_draft_created_github_issue",
        None,
        {"draft_id": draft.id, "github_issue_number": draft.github_issue_number},
    )
    db.commit()
    db.refresh(draft)
    return {"issue_draft": _draft_to_dict(draft)}
