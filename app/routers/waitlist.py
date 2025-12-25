from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.db import get_db
from app.models import WaitlistEntry

router = APIRouter(prefix="/api/waitlist", tags=["waitlist"])

class WaitlistRequest(BaseModel):
    email: EmailStr
    source: str | None = None

@router.post("")
def add_to_waitlist(payload: WaitlistRequest, db: Session = Depends(get_db)):
    existing = db.query(WaitlistEntry).filter_by(email=payload.email).first()
    if existing:
        return {"success": True, "already_registered": True}

    entry = WaitlistEntry(
        email=payload.email,
        source=payload.source
    )
    db.add(entry)
    db.commit()

    return {"success": True, "already_registered": False}
