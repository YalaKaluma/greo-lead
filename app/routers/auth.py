"""
Auth Router - Handle user authentication
app/routers/auth.py
"""

from fastapi import APIRouter, BackgroundTasks, Cookie, Depends, Header, HTTPException, Request, Response
from sqlalchemy import func
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr, Field
from datetime import datetime, timedelta, timezone
import logging
from app.db import get_db
from app.models import PasswordResetToken, PushSubscription, User
from app.config import PUBLIC_APP_URL
from app.services.audit_log_service import write_audit_log
from app.services.onboarding_seed_service import ensure_starter_examples_seeded
from app.utils.security import (
    create_session_token,
    decode_session_token,
    generate_password_reset_token,
    hash_password,
    hash_password_reset_token,
    verify_password,
)
from app.utils.safe_errors import log_failure
from app.utils.password_policy import password_policy_error
from app.utils.session_cookie import SESSION_COOKIE_NAME, clear_session_cookie, set_session_cookie

router = APIRouter(tags=["auth"])
logger = logging.getLogger(__name__)
DUMMY_PASSWORD_HASH = hash_password("not-a-real-account-password")


class LoginRequest(BaseModel):
    username: str  # Could be name, email, or phone
    password: str


class RegisterRequest(BaseModel):
    username: EmailStr
    password: str


class PasswordRecoveryRequest(BaseModel):
    email: EmailStr


class PasswordResetRequest(BaseModel):
    token: str = Field(min_length=32, max_length=256)
    new_password: str


class DeleteAccountRequest(BaseModel):
    password: str
    confirmation: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


def _session_response(user: User, response: Response) -> dict:
    token = create_session_token(user.id, user.phone_number, user.session_version)
    set_session_cookie(response, token)
    return {
        "access_token": token,
        "token_type": "bearer",  # nosec B105 - OAuth token type, not a password
        "expires_in": 60 * 60 * 24 * 30,
    }


def user_requires_password_change(user: User) -> bool:
    return bool(user.temp_password and user.temp_password_consumed_at and not user.password_hash)


def require_authenticated_user(
    authorization: str | None = Header(default=None),
    session_cookie: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    db: Session = Depends(get_db),
) -> User:
    token = session_cookie
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
    if not token or not isinstance(token, str):
        raise HTTPException(status_code=401, detail="Authentication required")
    payload = decode_session_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Session expired or invalid")
    user = db.query(User).filter(User.id == payload["sub"]).first()
    if (
        not user
        or not user.is_active
        or user.phone_number != payload.get("usr")
        or int(user.session_version or 0) != int(payload.get("ver", 0))
    ):
        raise HTTPException(status_code=401, detail="Account is unavailable")
    return user


def _find_user_by_username(db: Session, username: str):
    normalized = username.strip().casefold()
    return db.query(User).filter(
        (User.name == username)
        | (func.lower(User.email) == normalized)
        | (User.phone_number == username)
    ).first()


@router.post("/login")
async def login(credentials: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    """
    Login endpoint - handles both temporary passwords and permanent passwords.
    """
    username = credentials.username.strip()
    user = _find_user_by_username(db, username)

    if not user:
        verify_password(credentials.password, DUMMY_PASSWORD_HASH)
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
            "message": "Invalid credentials"
        }

    # Check temporary password first (onboarding users)
    if (
        user.temp_password
        and user.temp_password_consumed_at is None
        and (not user.temp_password_expires or datetime.utcnow() <= user.temp_password_expires)
        and verify_password(credentials.password, user.temp_password)
    ):
        user.temp_password_consumed_at = datetime.utcnow()
        user.last_login_at = datetime.utcnow()
        user.last_active_at = user.last_login_at
        user.tour_current_step = None
        user.tour_completed = True
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
            "must_change_password": True,  # nosec B105 - Boolean session state, not a password value.
            "trial_days_left": user.days_left_in_trial() if hasattr(user, 'days_left_in_trial') else 21,
            **_session_response(user, response),
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
            "must_change_password": False,  # nosec B105 - Boolean session state, not a password value.
            "trial_days_left": user.days_left_in_trial() if hasattr(user, 'days_left_in_trial') else 0,
            **_session_response(user, response),
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
async def register(payload: RegisterRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    """
    Create a self-serve account from the login page.
    """
    username = str(payload.username).strip().casefold()
    password = payload.password

    if not username:
        return {"success": False, "message": "Username is required"}
    policy_error = password_policy_error(password)
    if policy_error:
        return {"success": False, "message": policy_error}
    if db.query(User).filter(func.lower(User.email) == username).first():
        return {"success": False, "message": "An account already exists for this email"}

    user = User(
        name=username.split("@", 1)[0],
        email=username,
        password_hash=hash_password(password),
        is_active=True,
        onboarding_completed=False,
        onboarding_data={"flow_version": 2, "history": [], "created": {}},
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
    except Exception as exc:
        db.rollback()
        log_failure("auth_starter_seed", exc)
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
        "needs_tour": True,
        "trial_days_left": user.days_left_in_trial() if hasattr(user, 'days_left_in_trial') else 21,
        **_session_response(user, response),
    }


PASSWORD_RECOVERY_RESPONSE = {
    "success": True,
    "message": "If an active account exists for that email, a recovery link has been sent.",
}


def _deliver_password_recovery_email(email: str, reset_url: str, user_id: int) -> None:
    try:
        from app.services.gmail_service import send_email

        send_email(
            to=email,
            subject="Reset your Alfred password",
            body=(
                "A password reset was requested for your Alfred account.\n\n"
                f"Open this link within 30 minutes:\n{reset_url}\n\n"
                "If you did not request this, you can ignore this message."
            ),
        )
    except Exception as exc:
        log_failure("auth_password_recovery_email", exc)


@router.post("/password-recovery/request")
async def request_password_recovery(
    payload: PasswordRecoveryRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    email = str(payload.email).strip().casefold()
    user = db.query(User).filter(func.lower(User.email) == email, User.is_active == True).first()
    if not user:
        verify_password("dummy-recovery-value", DUMMY_PASSWORD_HASH)
        return PASSWORD_RECOVERY_RESPONSE

    now = datetime.now(timezone.utc)
    db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == user.id,
        PasswordResetToken.consumed_at.is_(None),
    ).update({"consumed_at": now}, synchronize_session=False)
    raw_token, token_hash = generate_password_reset_token()
    db.add(PasswordResetToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=now + timedelta(minutes=30),
    ))
    reset_url = f"{(PUBLIC_APP_URL or '').rstrip('/')}/reset-password?token={raw_token}"
    write_audit_log(
        db,
        user_id=user.id,
        event_type="password_recovery_requested",
        object_type="user",
        object_id=user.id,
        metadata={"delivery": "email_queued"},
        request=request,
    )
    background_tasks.add_task(_deliver_password_recovery_email, user.email, reset_url, user.id)

    return PASSWORD_RECOVERY_RESPONSE


@router.post("/password-recovery/reset")
async def reset_password_with_token(
    payload: PasswordResetRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    policy_error = password_policy_error(payload.new_password)
    if policy_error:
        raise HTTPException(status_code=400, detail=policy_error)

    now = datetime.now(timezone.utc)
    reset_token = db.query(PasswordResetToken).filter(
        PasswordResetToken.token_hash == hash_password_reset_token(payload.token),
        PasswordResetToken.consumed_at.is_(None),
        PasswordResetToken.expires_at > now,
    ).with_for_update().first()
    if not reset_token:
        raise HTTPException(status_code=400, detail="Recovery link is invalid or expired")

    user = db.query(User).filter(User.id == reset_token.user_id, User.is_active == True).first()
    if not user:
        reset_token.consumed_at = now
        db.commit()
        raise HTTPException(status_code=400, detail="Recovery link is invalid or expired")

    user.password_hash = hash_password(payload.new_password)
    user.temp_password = None
    user.temp_password_expires = None
    user.temp_password_consumed_at = None
    user.session_version = int(user.session_version or 0) + 1
    db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == user.id,
        PasswordResetToken.consumed_at.is_(None),
    ).update({"consumed_at": now}, synchronize_session=False)
    write_audit_log(
        db,
        user_id=user.id,
        event_type="password_change",
        object_type="user",
        object_id=user.id,
        metadata={"method": "email_recovery"},
        request=request,
    )
    return {"success": True, "message": "Password reset complete. Sign in with your new password."}


@router.post("/change-password")
async def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    current_user: User = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
):
    stored_password = current_user.password_hash or current_user.temp_password
    if not verify_password(payload.current_password, stored_password):
        raise HTTPException(status_code=403, detail="Current password is incorrect")
    policy_error = password_policy_error(payload.new_password)
    if policy_error:
        raise HTTPException(status_code=400, detail=policy_error)
    if verify_password(payload.new_password, stored_password):
        raise HTTPException(status_code=400, detail="New password must be different")

    current_user.password_hash = hash_password(payload.new_password)
    current_user.temp_password = None
    current_user.temp_password_expires = None
    current_user.temp_password_consumed_at = None
    current_user.session_version = int(current_user.session_version or 0) + 1
    write_audit_log(
        db,
        user_id=current_user.id,
        event_type="password_change",
        object_type="user",
        object_id=current_user.id,
        metadata={"method": "authenticated_change"},
        request=request,
    )
    return {"success": True, "message": "Password changed. Sign in again."}


@router.post("/delete-account")
async def delete_account(
    payload: DeleteAccountRequest,
    request: Request,
    current_user: User = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
):
    if payload.confirmation.strip().upper() != "DELETE":
        raise HTTPException(status_code=400, detail="Enter DELETE to confirm account deletion")
    if not verify_password(payload.password, current_user.password_hash):
        raise HTTPException(status_code=403, detail="Password confirmation failed")

    now = datetime.now(timezone.utc)
    current_user.is_active = False
    current_user.account_deletion_requested_at = now
    current_user.account_deletion_scheduled_for = now + timedelta(days=30)
    current_user.password_hash = None
    current_user.temp_password = None
    current_user.temp_password_expires = None
    current_user.temp_password_consumed_at = None
    current_user.session_version = int(current_user.session_version or 0) + 1
    current_user.voice_reference_data_url = None
    current_user.voice_reference_mime_type = None
    current_user.voice_reference_consented_at = None

    db.query(PushSubscription).filter(
        PushSubscription.user_number == current_user.phone_number
    ).update({"is_active": False}, synchronize_session=False)

    write_audit_log(
        db,
        user_id=current_user.id,
        event_type="account_deletion_requested",
        object_type="user",
        object_id=current_user.id,
        metadata={"scheduled_for": current_user.account_deletion_scheduled_for.isoformat()},
        request=request,
    )
    db.commit()
    return {
        "success": True,
        "message": "Your account has been deactivated and scheduled for deletion.",
        "scheduled_for": current_user.account_deletion_scheduled_for.isoformat(),
    }


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    current_user: User = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
):
    """Invalidate all existing sessions for the authenticated account."""
    current_user.session_version = int(current_user.session_version or 0) + 1
    write_audit_log(
        db,
        user_id=current_user.id,
        event_type="user_logout",
        object_type="user",
        object_id=current_user.id,
        metadata={"status": "logged_out"},
        request=request,
    )
    db.commit()
    clear_session_cookie(response)
    return {"success": True, "message": "Logged out successfully"}


@router.get("/me")
async def get_current_user(current_user: User = Depends(require_authenticated_user)):
    """
    Get current user info.
    Used by frontend to check auth status and get user details.
    """
    return {
        "success": True,
        "user": {
            "name": current_user.name,
            "email": current_user.email,
            "profession": current_user.profession,
            "phone_number": current_user.phone_number,
            "is_admin": bool(getattr(current_user, "is_admin", False)),
            "is_active": bool(getattr(current_user, "is_active", True)),
            "subscription_status": current_user.subscription_status,
            "trial_days_left": current_user.days_left_in_trial() if hasattr(current_user, 'days_left_in_trial') else 0,
            "onboarding_completed": current_user.onboarding_completed,
            "tour_completed": current_user.tour_completed
        }
    }
