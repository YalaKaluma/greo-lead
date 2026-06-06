from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import UsageEvent, User

router = APIRouter(tags=["usage"])


class UsageEventRequest(BaseModel):
    user_number: str
    event_type: str
    page: Optional[str] = None
    feature: Optional[str] = None
    metadata: Optional[dict[str, Any]] = None


@router.post("/usage-events")
def record_usage_event(
    request: UsageEventRequest,
    db: Session = Depends(get_db),
):
    event_type = request.event_type.strip()
    if not event_type:
        raise HTTPException(status_code=422, detail="event_type is required")

    user = db.query(User).filter(
        (User.phone_number == request.user_number) | (User.email == request.user_number)
    ).first()

    event = UsageEvent(
        user_id=user.id if user else None,
        event_type=event_type[:80],
        page=(request.page or "").strip()[:80] or None,
        feature=(request.feature or "").strip()[:120] or None,
        metadata_json=request.metadata or {},
    )
    db.add(event)
    db.commit()

    return {"success": True, "event_id": event.id}
