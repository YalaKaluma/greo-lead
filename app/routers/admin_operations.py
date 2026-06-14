from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import OperationsIssueDraft, SystemHealthEvent, User
from app.routers.admin import _log_admin_action, require_admin
from app.services.github.issues import GitHubIssueError, create_github_issue
from app.services.operations_director.health_events import record_health_event
from app.services.operations_director.reviewer import OperationsDirectorReviewer


router = APIRouter(tags=["admin-operations"])


def _iso(value) -> str | None:
    return value.isoformat() if value else None


def _event_to_dict(event: SystemHealthEvent) -> dict[str, Any]:
    return {
        "id": event.id,
        "environment": event.environment,
        "source": event.source,
        "category": event.category or event.event_type,
        "severity": event.severity,
        "message": event.message,
        "details": event.details_json or event.metadata_json or {},
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
        "summary": draft.summary,
        "severity": draft.severity,
        "status": draft.status,
        "environment": draft.environment,
        "category": draft.category,
        "source_event_ids": draft.source_event_ids or [],
        "evidence": draft.evidence_json or {},
        "suspected_root_cause": draft.suspected_root_cause,
        "recommended_action": draft.recommended_action,
        "codex_brief_markdown": draft.codex_brief_markdown,
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
        "health_events": [_event_to_dict(event) for event in events],
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
    return {
        "issue_drafts": [_draft_to_dict(draft) for draft in drafts],
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
        "issue_drafts": [_draft_to_dict(draft) for draft in drafts],
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
            body=draft.codex_brief_markdown,
            labels=draft.github_labels_json or [],
        )
    except (GitHubIssueError, Exception) as exc:
        record_health_event(
            db,
            source="github",
            category="external_service_failure",
            service_name="GitHub",
            message=str(exc),
            details={"operation": "create_issue", "draft_id": draft.id},
        )
        raise HTTPException(status_code=502, detail="GitHub issue creation failed gracefully.") from exc

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
