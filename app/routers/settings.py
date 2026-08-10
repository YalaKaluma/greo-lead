from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.services.audit_log_service import write_audit_log
from app.services.journal_reflection_depth_service import backfill_recent_reflection_depth
from app.services.language import DEFAULT_LANGUAGE, normalize_language
from app.services.timezone_service import DEFAULT_TIMEZONE, normalize_timezone
from app.routers.auth import require_authenticated_user
from app.utils.safe_errors import internal_error

router = APIRouter()


class LanguageSettingsRequest(BaseModel):
    user_number: str
    language_preference: str


class TimezoneSettingsRequest(BaseModel):
    user_number: str
    timezone_preference: str


class ReflectionDepthBackfillRequest(BaseModel):
    user_number: str
    limit: int = 50


@router.get("/settings")
def get_settings(user_number: str, db: Session = Depends(get_db), current_user: User = Depends(require_authenticated_user)):
    return {
        "user_number": current_user.phone_number,
        "language_preference": normalize_language(getattr(current_user, "language_preference", None) or DEFAULT_LANGUAGE),
        "timezone_preference": normalize_timezone(getattr(current_user, "timezone_preference", None) or DEFAULT_TIMEZONE),
    }


@router.put("/settings/language")
def update_language(request: LanguageSettingsRequest, db: Session = Depends(get_db), current_user: User = Depends(require_authenticated_user)):
    current_user.language_preference = normalize_language(request.language_preference)
    db.commit()
    db.refresh(current_user)
    write_audit_log(
        db,
        user_id=current_user.id,
        event_type="settings_changed",
        object_type="user_settings",
        object_id=current_user.id,
        metadata={"setting": "language_preference", "value": current_user.language_preference},
    )

    return {
        "user_number": current_user.phone_number,
        "language_preference": current_user.language_preference,
    }


@router.put("/settings/timezone")
def update_timezone(request: TimezoneSettingsRequest, db: Session = Depends(get_db), current_user: User = Depends(require_authenticated_user)):
    current_user.timezone_preference = normalize_timezone(request.timezone_preference)
    db.commit()
    db.refresh(current_user)
    write_audit_log(
        db,
        user_id=current_user.id,
        event_type="settings_changed",
        object_type="user_settings",
        object_id=current_user.id,
        metadata={"setting": "timezone_preference", "value": current_user.timezone_preference},
    )

    return {
        "user_number": current_user.phone_number,
        "timezone_preference": current_user.timezone_preference,
    }


@router.post("/settings/journal/reflection-depth-backfill")
def backfill_reflection_depth(request: ReflectionDepthBackfillRequest, db: Session = Depends(get_db), current_user: User = Depends(require_authenticated_user)):
    try:
        result = backfill_recent_reflection_depth(
            db=db,
            user_number=current_user.phone_number,
            limit=request.limit,
        )
    except Exception as error:
        db.rollback()
        raise internal_error(
            "settings_reflection_depth_backfill",
            error,
            "Recent journal messages could not be scored.",
        ) from error

    return {
        "user_number": current_user.phone_number,
        **result,
    }
