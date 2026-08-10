from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import CtoFinding, CtoReview, User
from app.routers.admin import _log_admin_action, require_admin
from app.services.cto_director.reviewer import CtoDirectorReviewer
from app.services.github.issues import GitHubIssueError, create_github_issue
from app.services.operations_director.health_events import record_health_event, sanitize_details, sanitize_text


router = APIRouter(tags=["admin-cto"])

SEVERITY_RANK = {"critical": 0, "high": 1, "warning": 2, "medium": 2, "low": 3, "info": 4}


def _iso(value) -> str | None:
    return value.isoformat() if value else None


def _safe_text(value: Any, limit: int = 700) -> str | None:
    text = sanitize_text(value, limit)
    if text is None:
        return None
    return " ".join(text.split())


def _safe_markdown(value: str | None, limit: int = 16000) -> str:
    return sanitize_text(value or "", limit) or ""


def _review_to_dict(review: CtoReview) -> dict[str, Any]:
    return {
        "id": review.id,
        "environment": review.environment,
        "review_type": review.review_type,
        "status": review.status,
        "architecture_score": review.architecture_score,
        "security_score": review.security_score,
        "maintainability_score": review.maintainability_score,
        "test_coverage_score": review.test_coverage_score,
        "release_readiness_score": review.release_readiness_score,
        "summary": _safe_text(review.summary, 900),
        "top_risks": sanitize_details(review.top_risks_json or []),
        "recommendations": sanitize_details(review.recommendations_json or []),
        "source_snapshot": sanitize_details(review.source_snapshot_json or {}),
        "started_at": _iso(review.started_at),
        "completed_at": _iso(review.completed_at),
        "created_at": _iso(review.created_at),
        "updated_at": _iso(review.updated_at),
    }


def _finding_to_dict(finding: CtoFinding) -> dict[str, Any]:
    return {
        "id": finding.id,
        "cto_review_id": finding.cto_review_id,
        "category": finding.category,
        "severity": finding.severity,
        "title": finding.title,
        "summary": _safe_text(finding.summary, 900),
        "evidence": sanitize_details(finding.evidence_json or {}),
        "affected_files": sanitize_details(finding.affected_files_json or []),
        "affected_modules": sanitize_details(finding.affected_modules_json or []),
        "risk_explanation": _safe_text(finding.risk_explanation, 900),
        "recommended_action": _safe_text(finding.recommended_action, 900),
        "codex_brief_markdown": _safe_markdown(finding.codex_brief_markdown),
        "confidence": finding.confidence,
        "status": finding.status,
        "github_labels": finding.github_labels_json or [],
        "github_issue_number": finding.github_issue_number,
        "github_issue_url": finding.github_issue_url,
        "reviewed_by": finding.reviewed_by,
        "reviewed_at": _iso(finding.reviewed_at),
        "created_at": _iso(finding.created_at),
        "updated_at": _iso(finding.updated_at),
    }


def _severity_sort_key(item: CtoFinding) -> tuple[int, str]:
    return (SEVERITY_RANK.get((item.severity or "").lower(), 5), str(item.created_at or ""))


def _sort_findings(findings: list[CtoFinding]) -> list[CtoFinding]:
    return sorted(findings, key=_severity_sort_key)


def _build_executive_summary(reviews: list[CtoReview], findings: list[CtoFinding]) -> dict[str, Any]:
    latest = reviews[0] if reviews else None
    open_findings = [item for item in findings if item.status == "open"]
    high = [item for item in open_findings if item.severity in {"critical", "high"}]
    converted = [item for item in findings if item.status == "converted_to_issue"]
    top = _sort_findings(open_findings)[0] if open_findings else None
    scores = {
        "architecture": latest.architecture_score if latest else None,
        "security": latest.security_score if latest else None,
        "maintainability": latest.maintainability_score if latest else None,
        "test_readiness": latest.test_coverage_score if latest else None,
        "release_readiness": latest.release_readiness_score if latest else None,
    }
    if top:
        recommendation = f"Review '{top.title}' first and decide whether to create the GitHub issue."
    elif latest and latest.status == "completed":
        recommendation = "No urgent CTO finding is waiting for approval."
    else:
        recommendation = "Run CTO Review to create the latest architecture and release-readiness view."
    return {
        "headline": (
            f"{len(high)} high/critical CTO finding{'s' if len(high) != 1 else ''} "
            f"and {len(open_findings)} open GitHub-ready draft{'s' if len(open_findings) != 1 else ''} need review."
        ),
        "recommendation": recommendation,
        "open_findings": len(open_findings),
        "critical_or_high": len(high),
        "converted_to_issue": len(converted),
        "latest_review_id": latest.id if latest else None,
        "latest_review_status": latest.status if latest else None,
        "latest_review_summary": _safe_text(latest.summary, 700) if latest else None,
        "top_finding_id": top.id if top else None,
        "top_finding_title": top.title if top else None,
        "scores": scores,
    }


def _get_finding(db: Session, finding_id: int) -> CtoFinding:
    finding = db.query(CtoFinding).filter(CtoFinding.id == finding_id).first()
    if not finding:
        raise HTTPException(status_code=404, detail="CTO finding not found")
    return finding


@router.get("/cto/reviews")
def list_cto_reviews(
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    reviews = db.query(CtoReview).order_by(CtoReview.created_at.desc(), CtoReview.id.desc()).limit(50).all()
    findings = db.query(CtoFinding).order_by(CtoFinding.created_at.desc(), CtoFinding.id.desc()).limit(250).all()
    return {
        "reviews": [_review_to_dict(review) for review in reviews],
        "executive_summary": _build_executive_summary(reviews, findings),
        "current_admin_id": admin_user.id,
    }


@router.get("/cto/reviews/{review_id}")
def get_cto_review(
    review_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    review = db.query(CtoReview).filter(CtoReview.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="CTO review not found")
    findings = db.query(CtoFinding).filter(CtoFinding.cto_review_id == review.id).all()
    return {
        "review": _review_to_dict(review),
        "findings": [_finding_to_dict(item) for item in _sort_findings(findings)],
        "current_admin_id": admin_user.id,
    }


@router.post("/cto/reviews/run")
def run_cto_review(
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    review = CtoDirectorReviewer(db).run_review("manual")
    _log_admin_action(db, admin_user, "cto_director_review", None, {"review_id": review.id, "status": review.status})
    db.commit()
    db.refresh(review)
    findings = db.query(CtoFinding).filter(CtoFinding.cto_review_id == review.id).all()
    return {
        "review": _review_to_dict(review),
        "findings": [_finding_to_dict(item) for item in _sort_findings(findings)],
        "current_admin_id": admin_user.id,
    }


@router.get("/cto/findings")
def list_cto_findings(
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    findings = db.query(CtoFinding).order_by(CtoFinding.created_at.desc(), CtoFinding.id.desc()).limit(250).all()
    return {
        "findings": [_finding_to_dict(item) for item in _sort_findings(findings)],
        "current_admin_id": admin_user.id,
    }


@router.post("/cto/findings/{finding_id}/dismiss")
def dismiss_cto_finding(
    finding_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    finding = _get_finding(db, finding_id)
    finding.status = "dismissed"
    finding.reviewed_by = admin_user.email or admin_user.phone_number or str(admin_user.id)
    finding.reviewed_at = datetime.utcnow()
    _log_admin_action(db, admin_user, "cto_finding_dismissed", None, {"finding_id": finding.id})
    db.commit()
    db.refresh(finding)
    return {"finding": _finding_to_dict(finding)}


@router.post("/cto/findings/{finding_id}/create-github-issue")
def create_issue_from_cto_finding(
    finding_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    finding = _get_finding(db, finding_id)
    if finding.status == "converted_to_issue":
        return {"finding": _finding_to_dict(finding)}
    if not finding.codex_brief_markdown:
        raise HTTPException(status_code=400, detail="Codex-ready brief is required before GitHub issue creation.")

    reviewer = admin_user.email or admin_user.phone_number or str(admin_user.id)
    finding.reviewed_by = reviewer
    finding.reviewed_at = datetime.utcnow()
    db.commit()
    db.refresh(finding)

    try:
        issue = create_github_issue(
            title=finding.title,
            body=_safe_markdown(finding.codex_brief_markdown),
            labels=finding.github_labels_json or [],
        )
    except GitHubIssueError as exc:
        record_health_event(
            db,
            source="github",
            category="external_service_failure",
            service_name="GitHub",
            message=type(exc).__name__,
            details={"operation": "create_cto_issue", "finding_id": finding.id},
        )
        raise HTTPException(status_code=503, detail="GitHub issue creation failed") from exc
    except Exception as exc:
        record_health_event(
            db,
            source="github",
            category="external_service_failure",
            service_name="GitHub",
            message=type(exc).__name__,
            details={"operation": "create_cto_issue", "finding_id": finding.id},
        )
        raise HTTPException(
            status_code=502,
            detail="GitHub issue creation failed. Alfred recorded this as a health event.",
        ) from exc

    finding.github_issue_number = issue.get("number")
    finding.github_issue_url = issue.get("url")
    finding.status = "converted_to_issue"
    _log_admin_action(
        db,
        admin_user,
        "cto_finding_created_github_issue",
        None,
        {"finding_id": finding.id, "github_issue_number": finding.github_issue_number},
    )
    db.commit()
    db.refresh(finding)
    return {"finding": _finding_to_dict(finding)}
