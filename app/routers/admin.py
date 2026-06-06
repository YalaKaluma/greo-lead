import os
import json
from datetime import datetime, timedelta
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import AdminAuditLog, Message, MessageFeedback, Task, TaskPriorityDecision, User
from app.services.gmail_service import send_email
from app.utils.security import generate_temporary_password, hash_password


router = APIRouter(tags=["admin"])


class CreateAdminUserRequest(BaseModel):
    first_name: str
    last_name: str
    email: str
    is_admin: bool = False


class UpdateAdminUserRequest(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    is_admin: Optional[bool] = None


class UpdateFeedbackStatusRequest(BaseModel):
    status: str


FEEDBACK_STATUSES = {"New", "Reviewed", "Resolved", "Ignored"}


def _split_name(name: str | None) -> tuple[str, str]:
    parts = (name or "").strip().split()
    if not parts:
        return "", ""
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], " ".join(parts[1:])


def _normalize_email(email: str) -> str:
    normalized = email.strip().lower()
    if "@" not in normalized or "." not in normalized.split("@")[-1]:
        raise HTTPException(status_code=422, detail="A valid email address is required")
    return normalized


def _display_user(user: User) -> dict[str, Any]:
    return {
        "id": user.id,
        "name": user.name or "",
        "first_name": _split_name(user.name)[0],
        "last_name": _split_name(user.name)[1],
        "email": user.email or "",
        "role": "Admin" if getattr(user, "is_admin", False) else "User",
        "is_admin": bool(getattr(user, "is_admin", False)),
        "status": "Active" if getattr(user, "is_active", True) else "Inactive",
        "is_active": bool(getattr(user, "is_active", True)),
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "last_login_at": user.last_login_at.isoformat() if getattr(user, "last_login_at", None) else None,
    }


def _display_feedback(feedback: MessageFeedback) -> dict[str, Any]:
    user = feedback.user
    message = feedback.message
    source_page, feedback_type = _message_feedback_labels(feedback, message)
    return {
        "id": f"message:{feedback.id}",
        "raw_id": feedback.id,
        "kind": "message",
        "user": user.name if user and user.name else "Unknown",
        "user_email": user.email if user else "",
        "user_id": user.id if user else None,
        "date": feedback.created_at.isoformat() if feedback.created_at else None,
        "source_page": source_page,
        "feedback_type": feedback_type,
        "rating": feedback.rating,
        "comment": feedback.feedback_text or "",
        "status": getattr(feedback, "status", None) or "New",
        "message_id": feedback.message_id,
        "message_excerpt": (message.content[:180] if message and message.content else ""),
        "reviewed_at": feedback.reviewed_at.isoformat() if getattr(feedback, "reviewed_at", None) else None,
        "resolved_at": feedback.resolved_at.isoformat() if getattr(feedback, "resolved_at", None) else None,
    }


def _message_feedback_labels(feedback: MessageFeedback, message: Message | None) -> tuple[str, str]:
    source_context = (feedback.source_context or "").strip().lower()
    message_type = (getattr(message, "message_type", "") or "").strip().lower()
    conversation_type = (getattr(message, "conversation_type", "") or "").strip().lower()

    if message_type == "nudge":
        return "Nudge", "Nudge Feedback"
    if source_context == "journal" or conversation_type == "journal" or message_type == "journal":
        return "Journal", "Journal Message Feedback"
    if source_context == "coaching_session" or conversation_type in {"goal_coaching", "team_coaching", "leadership_coaching"}:
        labels = {
            "goal_coaching": "Goal Coaching",
            "team_coaching": "People Coaching",
            "leadership_coaching": "Leadership Coaching",
        }
        return labels.get(conversation_type, "Coaching"), "Coaching Message Feedback"
    if source_context == "messages" or conversation_type == "messages":
        return "Messages", "General Chat Feedback"
    return source_context.replace("_", " ").title() or "Unknown", "Message Feedback"


def _parse_priority_feedback(decision: TaskPriorityDecision) -> dict[str, Any]:
    try:
        parsed = json.loads(decision.user_reason or "{}")
        return parsed if isinstance(parsed, dict) else {}
    except (TypeError, json.JSONDecodeError):
        return {}


def _display_priority_feedback(decision: TaskPriorityDecision, task: Task | None, user: User | None) -> dict[str, Any]:
    payload = _parse_priority_feedback(decision)
    rating = payload.get("rating")
    tag = payload.get("tag")
    comment = payload.get("feedback") or ""
    task_title = task.title if task else (decision.task_state_snapshot or {}).get("title", "")
    context_bits = [part for part in [f"Tag: {tag}" if tag else "", f"Task: {task_title}" if task_title else ""] if part]

    return {
        "id": f"mtn:{decision.id}",
        "raw_id": decision.id,
        "kind": "mtn",
        "user": user.name if user and user.name else decision.user_number,
        "user_email": user.email if user else "",
        "user_id": user.id if user else None,
        "date": decision.decided_at.isoformat() if decision.decided_at else None,
        "source_page": "Tasks",
        "feedback_type": "MTN Scoring Feedback",
        "rating": rating,
        "comment": comment,
        "status": getattr(decision, "admin_review_status", None) or "New",
        "message_id": None,
        "message_excerpt": " | ".join(context_bits),
        "reviewed_at": decision.admin_reviewed_at.isoformat() if getattr(decision, "admin_reviewed_at", None) else None,
        "resolved_at": decision.admin_resolved_at.isoformat() if getattr(decision, "admin_resolved_at", None) else None,
    }


def _get_admin_user(user_number: str, db: Session) -> User:
    user = db.query(User).filter(
        (User.phone_number == user_number) | (User.email == user_number)
    ).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if not getattr(user, "is_active", True):
        raise HTTPException(status_code=403, detail="Inactive users cannot use admin tools")
    if not getattr(user, "is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def require_admin(
    admin_user_number: str = Query(..., alias="user_number"),
    db: Session = Depends(get_db),
) -> User:
    return _get_admin_user(admin_user_number, db)


def _active_admin_count(db: Session) -> int:
    return db.query(func.count(User.id)).filter(
        User.is_admin == True,
        User.is_active == True,
    ).scalar() or 0


def _ensure_target_user(user_id: int, db: Session) -> User:
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Target user not found")
    return target


def _log_admin_action(
    db: Session,
    admin_user: User,
    action: str,
    target_user: User | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    db.add(AdminAuditLog(
        admin_user_id=admin_user.id,
        target_user_id=target_user.id if target_user else None,
        action=action,
        metadata_json=metadata or {},
    ))


def _invitation_body(user: User, temp_password: str) -> str:
    app_url = os.getenv("APP_URL") or os.getenv("PUBLIC_APP_URL") or "https://greo-lead-production.up.railway.app"
    return f"""Hello {user.name or 'there'},

You have been invited to Alfred.

Login:
{app_url}

Temporary Password:
{temp_password}

Please change your password after your first login.
"""


def _send_invitation_email(user: User, temp_password: str) -> bool:
    if not user.email:
        return False
    try:
        send_email(
            to=user.email,
            subject="You have been invited to Alfred",
            body=_invitation_body(user, temp_password),
        )
        return True
    except Exception:
        return False


def _set_new_temp_password(user: User) -> str:
    temporary_password = generate_temporary_password()
    user.temp_password = hash_password(temporary_password)
    user.temp_password_expires = datetime.utcnow() + timedelta(hours=24)
    return temporary_password


@router.get("/users")
def list_users(
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    users = db.query(User).order_by(User.created_at.desc().nullslast(), User.id.desc()).all()
    return {
        "users": [_display_user(user) for user in users],
        "current_admin_id": admin_user.id,
    }


@router.post("/users")
def create_user(
    request: CreateAdminUserRequest,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    email = _normalize_email(request.email)
    existing = db.query(User).filter(func.lower(User.email) == email).first()
    if existing:
        raise HTTPException(status_code=409, detail="A user with that email already exists")

    name = f"{request.first_name.strip()} {request.last_name.strip()}".strip()
    user = User(
        name=name,
        email=email,
        phone_number=email,
        is_admin=request.is_admin,
        is_active=True,
        onboarding_completed=False,
    )
    temporary_password = _set_new_temp_password(user)
    user.start_trial()

    db.add(user)
    db.flush()
    _log_admin_action(
        db,
        admin_user,
        "created_user",
        user,
        {"is_admin": request.is_admin, "email": user.email},
    )
    db.commit()
    db.refresh(user)

    return {
        "user": _display_user(user),
        "temporary_password": temporary_password,
        "invitation_text": _invitation_body(user, temporary_password),
    }


@router.patch("/users/{user_id}")
def update_user(
    user_id: int,
    request: UpdateAdminUserRequest,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    target = _ensure_target_user(user_id, db)

    if request.email is not None:
        email = _normalize_email(request.email)
        existing = db.query(User).filter(
            func.lower(User.email) == email,
            User.id != target.id,
        ).first()
        if existing:
            raise HTTPException(status_code=409, detail="A user with that email already exists")
        target.email = email
        if not target.phone_number or "@" in target.phone_number:
            target.phone_number = email

    if request.first_name is not None or request.last_name is not None:
        first_name = request.first_name if request.first_name is not None else _split_name(target.name)[0]
        last_name = request.last_name if request.last_name is not None else _split_name(target.name)[1]
        target.name = f"{first_name.strip()} {last_name.strip()}".strip()

    if request.is_admin is not None and request.is_admin != bool(target.is_admin):
        if not request.is_admin and target.is_admin and _active_admin_count(db) <= 1:
            raise HTTPException(status_code=400, detail="You cannot remove the last remaining admin")
        target.is_admin = request.is_admin
        _log_admin_action(
            db,
            admin_user,
            "made_admin" if request.is_admin else "removed_admin",
            target,
        )
    else:
        _log_admin_action(db, admin_user, "updated_user", target)

    db.commit()
    db.refresh(target)
    return {"user": _display_user(target)}


@router.post("/users/{user_id}/deactivate")
def deactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    target = _ensure_target_user(user_id, db)
    if target.is_admin and target.is_active and _active_admin_count(db) <= 1:
        raise HTTPException(status_code=400, detail="You cannot deactivate the last remaining admin")

    target.is_active = False
    _log_admin_action(db, admin_user, "deactivated_user", target)
    db.commit()
    db.refresh(target)
    return {"user": _display_user(target)}


@router.post("/users/{user_id}/reactivate")
def reactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    target = _ensure_target_user(user_id, db)
    target.is_active = True
    _log_admin_action(db, admin_user, "reactivated_user", target)
    db.commit()
    db.refresh(target)
    return {"user": _display_user(target)}


@router.post("/users/{user_id}/reset-password")
def reset_password(
    user_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    target = _ensure_target_user(user_id, db)
    temporary_password = _set_new_temp_password(target)
    _log_admin_action(db, admin_user, "password_reset", target)
    db.commit()
    db.refresh(target)
    return {
        "user": _display_user(target),
        "temporary_password": temporary_password,
        "invitation_text": _invitation_body(target, temporary_password),
    }


@router.post("/users/{user_id}/send-invitation")
def send_invitation(
    user_id: int,
    temporary_password: Optional[str] = None,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    target = _ensure_target_user(user_id, db)
    if not temporary_password:
        temporary_password = _set_new_temp_password(target)
    email_sent = _send_invitation_email(target, temporary_password)
    _log_admin_action(
        db,
        admin_user,
        "sent_invitation",
        target,
        {"email_sent": email_sent},
    )
    db.commit()
    db.refresh(target)
    return {
        "user": _display_user(target),
        "email_sent": email_sent,
        "temporary_password": temporary_password if not email_sent else None,
        "invitation_text": None if email_sent else _invitation_body(target, temporary_password),
    }


@router.get("/feedback")
def list_feedback(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    query = (
        db.query(MessageFeedback)
        .outerjoin(User, MessageFeedback.user_id == User.id)
        .outerjoin(Message, MessageFeedback.message_id == Message.id)
    )
    if status:
        normalized_status = status.strip().title()
        if normalized_status not in FEEDBACK_STATUSES:
            raise HTTPException(status_code=422, detail="Invalid feedback status")
        query = query.filter(MessageFeedback.status == normalized_status)

    message_items = query.order_by(MessageFeedback.created_at.desc(), MessageFeedback.id.desc()).limit(250).all()

    priority_query = db.query(TaskPriorityDecision).filter(
        TaskPriorityDecision.user_reason.ilike('%"source": "mtn_tag_feedback"%')
    )
    if status:
        priority_query = priority_query.filter(TaskPriorityDecision.admin_review_status == normalized_status)

    priority_items = priority_query.order_by(
        TaskPriorityDecision.decided_at.desc(),
        TaskPriorityDecision.id.desc(),
    ).limit(250).all()

    user_numbers = {item.user_number for item in priority_items if item.user_number}
    users_by_number = {}
    if user_numbers:
        users = db.query(User).filter((User.phone_number.in_(user_numbers)) | (User.email.in_(user_numbers))).all()
        users_by_number = {
            key: user
            for user in users
            for key in [user.phone_number, user.email]
            if key
        }

    task_ids = [item.task_id for item in priority_items if item.task_id]
    tasks_by_id = {}
    if task_ids:
        tasks_by_id = {task.id: task for task in db.query(Task).filter(Task.id.in_(task_ids)).all()}

    feedback_items = [
        *[_display_feedback(item) for item in message_items],
        *[
            _display_priority_feedback(
                item,
                tasks_by_id.get(item.task_id),
                users_by_number.get(item.user_number),
            )
            for item in priority_items
        ],
    ]
    feedback_items.sort(key=lambda item: item.get("date") or "", reverse=True)

    return {
        "feedback": feedback_items[:250],
        "statuses": sorted(FEEDBACK_STATUSES),
        "current_admin_id": admin_user.id,
    }


@router.patch("/feedback/{feedback_key}")
def update_feedback_status(
    feedback_key: str,
    request: UpdateFeedbackStatusRequest,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    normalized_status = request.status.strip().title()
    if normalized_status not in FEEDBACK_STATUSES:
        raise HTTPException(status_code=422, detail="Invalid feedback status")

    kind, _, raw_id = feedback_key.partition(":")
    if not raw_id:
        kind = "message"
        raw_id = feedback_key

    try:
        numeric_id = int(raw_id)
    except ValueError as error:
        raise HTTPException(status_code=422, detail="Invalid feedback id") from error

    now = datetime.utcnow()
    if kind == "mtn":
        feedback = db.query(TaskPriorityDecision).filter(TaskPriorityDecision.id == numeric_id).first()
        if not feedback:
            raise HTTPException(status_code=404, detail="Feedback not found")
        feedback.admin_review_status = normalized_status
        if normalized_status in {"Reviewed", "Resolved", "Ignored"} and not feedback.admin_reviewed_at:
            feedback.admin_reviewed_at = now
        if normalized_status == "Resolved":
            feedback.admin_resolved_at = now
        else:
            feedback.admin_resolved_at = None

        target_user = db.query(User).filter(
            (User.phone_number == feedback.user_number) | (User.email == feedback.user_number)
        ).first()
        _log_admin_action(
            db,
            admin_user,
            f"feedback_marked_{normalized_status.lower()}",
            target_user,
            {"feedback_id": feedback.id, "feedback_kind": "mtn", "status": normalized_status},
        )
        db.commit()
        db.refresh(feedback)
        task = db.query(Task).filter(Task.id == feedback.task_id).first()
        return {"feedback": _display_priority_feedback(feedback, task, target_user)}

    feedback = db.query(MessageFeedback).filter(MessageFeedback.id == numeric_id).first()
    if not feedback:
        raise HTTPException(status_code=404, detail="Feedback not found")

    feedback.status = normalized_status
    if normalized_status in {"Reviewed", "Resolved", "Ignored"} and not feedback.reviewed_at:
        feedback.reviewed_at = now
    if normalized_status == "Resolved":
        feedback.resolved_at = now
    elif normalized_status != "Resolved":
        feedback.resolved_at = None

    _log_admin_action(
        db,
        admin_user,
        f"feedback_marked_{normalized_status.lower()}",
        feedback.user,
        {"feedback_id": feedback.id, "feedback_kind": "message", "status": normalized_status},
    )
    db.commit()
    db.refresh(feedback)
    return {"feedback": _display_feedback(feedback)}
