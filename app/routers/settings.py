from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.services.language import DEFAULT_LANGUAGE, normalize_language

router = APIRouter()


class LanguageSettingsRequest(BaseModel):
    user_number: str
    language_preference: str


@router.get("/settings")
def get_settings(user_number: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.phone_number == user_number).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "user_number": user_number,
        "language_preference": normalize_language(getattr(user, "language_preference", None) or DEFAULT_LANGUAGE),
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
