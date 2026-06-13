from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.services.audit_log_service import write_audit_log
from app.services.journal_reflection_depth_service import backfill_recent_reflection_depth
from app.services.language import DEFAULT_LANGUAGE, normalize_language
from app.services.timezone_service import DEFAULT_TIMEZONE, normalize_timezone

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
def get_settings(user_number: str, db: Session = Depends(get_db)):
    user = db.query(User).filter((User.phone_number == user_number) | (User.email == user_number)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "user_number": user_number,
        "language_preference": normalize_language(getattr(user, "language_preference", None) or DEFAULT_LANGUAGE),
        "timezone_preference": normalize_timezone(getattr(user, "timezone_preference", None) or DEFAULT_TIMEZONE),
    }


@router.put("/settings/language")
def update_language(request: LanguageSettingsRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter((User.phone_number == request.user_number) | (User.email == request.user_number)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.language_preference = normalize_language(request.language_preference)
    db.commit()
    db.refresh(user)
    write_audit_log(
        db,
        user_id=user.id,
        event_type="settings_changed",
        object_type="user_settings",
        object_id=user.id,
        metadata={"setting": "language_preference", "value": user.language_preference},
    )

    return {
        "user_number": request.user_number,
        "language_preference": user.language_preference,
    }


@router.put("/settings/timezone")
def update_timezone(request: TimezoneSettingsRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter((User.phone_number == request.user_number) | (User.email == request.user_number)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.timezone_preference = normalize_timezone(request.timezone_preference)
    db.commit()
    db.refresh(user)
    write_audit_log(
        db,
        user_id=user.id,
        event_type="settings_changed",
        object_type="user_settings",
        object_id=user.id,
        metadata={"setting": "timezone_preference", "value": user.timezone_preference},
    )

    return {
        "user_number": request.user_number,
        "timezone_preference": user.timezone_preference,
    }


@router.post("/settings/journal/reflection-depth-backfill")
def backfill_reflection_depth(request: ReflectionDepthBackfillRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter((User.phone_number == request.user_number) | (User.email == request.user_number)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    try:
        result = backfill_recent_reflection_depth(
            db=db,
            user_number=request.user_number,
            limit=request.limit,
        )
    except Exception as error:
        db.rollback()
        raise HTTPException(
            status_code=502,
            detail=f"Alfred could not score the recent journal messages yet: {error}",
        ) from error

    return {
        "user_number": request.user_number,
        **result,
    }
