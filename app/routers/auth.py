"""
Auth Router - Handle user authentication
app/routers/auth.py
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime
import logging
from app.db import get_db
from app.models import User
from app.services.audit_log_service import write_audit_log
from app.services.onboarding_seed_service import ensure_starter_examples_seeded
from app.utils.security import hash_password, verify_password

router = APIRouter(tags=["auth"])
logger = logging.getLogger(__name__)


class LoginRequest(BaseModel):
    username: str  # Could be name, email, or phone
    password: str


class RegisterRequest(BaseModel):
    username: str
    password: str


def _find_user_by_username(db: Session, username: str):
    return db.query(User).filter(
        (User.name == username) | (User.email == username) | (User.phone_number == username)
    ).first()


@router.post("/login")
async def login(credentials: LoginRequest, request: Request, db: Session = Depends(get_db)):
    """
    Login endpoint - handles both temporary passwords and permanent passwords.
    """
    username = credentials.username.strip()
    user = _find_user_by_username(db, username)

    if not user:
        write_audit_log(
            db,
            user_id=None,
            event_type="user_login_failure",
            object_type="user",
            metadata={"username_present": bool(username), "reason": "user_not_found"},
            request=request,
        )
        return {
            "success": False,
            "message": "Invalid credentials"
        }

    if not getattr(user, "is_active", True):
        write_audit_log(
            db,
            user_id=user.id,
            event_type="user_login_failure",
            object_type="user",
            object_id=user.id,
            metadata={"reason": "account_inactive"},
            request=request,
        )
        return {
            "success": False,
            "message": "Account inactive"
        }

    # Check temporary password first (onboarding users)
    if user.temp_password and verify_password(credentials.password, user.temp_password):
        user.last_login_at = datetime.utcnow()
        user.last_active_at = user.last_login_at
        user.tour_current_step = None
        user.tour_completed = True
        user.onboarding_completed = True
        db.commit()
        write_audit_log(
            db,
            user_id=user.id,
            event_type="user_login_success",
            object_type="user",
            object_id=user.id,
            metadata={"credential_type": "temporary_password"},
            request=request,
        )
        return {
            "success": True,
            "user_number": user.phone_number,
            "user_name": user.name,
            "is_admin": bool(getattr(user, "is_admin", False)),
            "needs_tour": False,
            "trial_days_left": user.days_left_in_trial() if hasattr(user, 'days_left_in_trial') else 21
        }

    # Check permanent password (returning users)
    if user.password_hash and verify_password(credentials.password, user.password_hash):
        user.last_login_at = datetime.utcnow()
        user.last_active_at = user.last_login_at
        db.commit()
        write_audit_log(
            db,
            user_id=user.id,
            event_type="user_login_success",
            object_type="user",
            object_id=user.id,
            metadata={"credential_type": "password"},
            request=request,
        )
        return {
            "success": True,
            "user_number": user.phone_number,
            "user_name": user.name,
            "is_admin": bool(getattr(user, "is_admin", False)),
            "needs_tour": False,
            "trial_days_left": user.days_left_in_trial() if hasattr(user, 'days_left_in_trial') else 0
        }

    # Neither password matched
    write_audit_log(
        db,
        user_id=user.id,
        event_type="user_login_failure",
        object_type="user",
        object_id=user.id,
        metadata={"reason": "invalid_password"},
        request=request,
    )
    return {
        "success": False,
        "message": "Invalid credentials"
    }


@router.post("/register")
async def register(payload: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    """
    Create a self-serve account from the login page.
    """
    username = payload.username.strip()
    password = payload.password.strip()

    if not username:
        return {"success": False, "message": "Username is required"}
    if len(password) < 6:
        return {"success": False, "message": "Password must be at least 6 characters"}
    if _find_user_by_username(db, username):
        return {"success": False, "message": "Username already exists"}

    user = User(
        name=username,
        email=username if "@" in username else None,
        password_hash=hash_password(password),
        is_active=True,
        onboarding_completed=True,
        tour_completed=True,
        tour_current_step=None,
    )
    user.start_trial()

    db.add(user)
    db.flush()
    user.phone_number = f"local:{user.id}"

    try:
        ensure_starter_examples_seeded(db, user)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Starter example seeding failed for user_id=%s", user.id)
        return {
            "success": False,
            "message": "Account setup failed. Please try again."
        }

    db.refresh(user)
    write_audit_log(
        db,
        user_id=user.id,
        event_type="account_created",
        object_type="user",
        object_id=user.id,
        metadata={"registration": "self_serve"},
        request=request,
    )

    return {
        "success": True,
        "user_number": user.phone_number,
        "user_name": user.name,
        "is_admin": bool(getattr(user, "is_admin", False)),
        "needs_tour": False,
        "trial_days_left": user.days_left_in_trial() if hasattr(user, 'days_left_in_trial') else 21
    }


@router.post("/logout")
async def logout(request: Request, user_number: str | None = None, db: Session = Depends(get_db)):
    """
    Logout endpoint - just returns success since we're using simple auth.
    In production, this would invalidate session tokens.
    """
    user = _find_user_by_username(db, user_number.strip()) if user_number else None
    write_audit_log(
        db,
        user_id=user.id if user else None,
        event_type="user_logout",
        object_type="user",
        object_id=user.id if user else None,
        metadata={"status": "logged_out"},
        request=request,
    )
    return {"success": True, "message": "Logged out successfully"}


@router.get("/me")
async def get_current_user(user_number: str, db: Session = Depends(get_db)):
    """
    Get current user info.
    Used by frontend to check auth status and get user details.
    """
    user = db.query(User).filter((User.phone_number == user_number) | (User.email == user_number)).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "success": True,
        "user": {
            "name": user.name,
            "email": user.email,
            "profession": user.profession,
            "phone_number": user.phone_number,
            "is_admin": bool(getattr(user, "is_admin", False)),
            "is_active": bool(getattr(user, "is_active", True)),
            "subscription_status": user.subscription_status,
            "trial_days_left": user.days_left_in_trial() if hasattr(user, 'days_left_in_trial') else 0,
            "onboarding_completed": user.onboarding_completed,
            "tour_completed": user.tour_completed
        }
    }
