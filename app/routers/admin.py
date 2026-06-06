import os
from datetime import datetime, timedelta
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import AdminAuditLog, Message, MessageFeedback, User
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
    return {
        "id": feedback.id,
        "user": user.name if user and user.name else "Unknown",
        "user_email": user.email if user else "",
        "user_id": user.id if user else None,
        "date": feedback.created_at.isoformat() if feedback.created_at else None,
        "source_page": feedback.source_context,
        "feedback_type": "Message Feedback",
        "rating": feedback.rating,
        "comment": feedback.feedback_text or "",
        "status": getattr(feedback, "status", None) or "New",
        "message_id": feedback.message_id,
        "message_excerpt": (message.content[:180] if message and message.content else ""),
        "reviewed_at": feedback.reviewed_at.isoformat() if getattr(feedback, "reviewed_at", None) else None,
        "resolved_at": feedback.resolved_at.isoformat() if getattr(feedback, "resolved_at", None) else None,
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

    feedback_items = query.order_by(MessageFeedback.created_at.desc(), MessageFeedback.id.desc()).limit(250).all()
    return {
        "feedback": [_display_feedback(item) for item in feedback_items],
        "statuses": sorted(FEEDBACK_STATUSES),
        "current_admin_id": admin_user.id,
    }


@router.patch("/feedback/{feedback_id}")
def update_feedback_status(
    feedback_id: int,
    request: UpdateFeedbackStatusRequest,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    normalized_status = request.status.strip().title()
    if normalized_status not in FEEDBACK_STATUSES:
        raise HTTPException(status_code=422, detail="Invalid feedback status")

    feedback = db.query(MessageFeedback).filter(MessageFeedback.id == feedback_id).first()
    if not feedback:
        raise HTTPException(status_code=404, detail="Feedback not found")

    feedback.status = normalized_status
    now = datetime.utcnow()
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
        {"feedback_id": feedback.id, "status": normalized_status},
    )
    db.commit()
    db.refresh(feedback)
    return {"feedback": _display_feedback(feedback)}
