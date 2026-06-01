from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.services.language import DEFAULT_LANGUAGE, normalize_language
from app.services.timezone_service import DEFAULT_TIMEZONE, normalize_timezone

router = APIRouter()


class LanguageSettingsRequest(BaseModel):
    user_number: str
    language_preference: str


class TimezoneSettingsRequest(BaseModel):
    user_number: str
    timezone_preference: str


@router.get("/settings")
def get_settings(user_number: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.phone_number == user_number).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "user_number": user_number,
        "language_preference": normalize_language(getattr(user, "language_preference", None) or DEFAULT_LANGUAGE),
        "timezone_preference": normalize_timezone(getattr(user, "timezone_preference", None) or DEFAULT_TIMEZONE),
    }


@router.put("/settings/language")
def update_language(request: LanguageSettingsRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.phone_number == request.user_number).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.language_preference = normalize_language(request.language_preference)
    db.commit()
    db.refresh(user)

    return {
        "user_number": request.user_number,
        "language_preference": user.language_preference,
    }


@router.put("/settings/timezone")
def update_timezone(request: TimezoneSettingsRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.phone_number == request.user_number).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.timezone_preference = normalize_timezone(request.timezone_preference)
    db.commit()
    db.refresh(user)

    return {
        "user_number": request.user_number,
        "timezone_preference": user.timezone_preference,
    }
