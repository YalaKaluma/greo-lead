from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database import get_db
from app.models import Waitlist
from sqlalchemy import select

router = APIRouter()

class WaitlistRequest(BaseModel):
    email: str
    source: str | None = None


@router.post("/waitlist")
def add_to_waitlist(
    payload: WaitlistRequest,
    db: Session = Depends(get_db)
):
    # Check if already exists
    existing = db.execute(
        select(Waitlist).where(Waitlist.email == payload.email)
    ).scalar_one_or_none()

    if existing:
        return {"already_registered": True}

    entry = Waitlist(
        email=payload.email,
        source=payload.source or "unknown"
    )

    db.add(entry)
    db.commit()

    return {"already_registered": False}
