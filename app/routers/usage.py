from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Message, UsageEvent, User
from app.services.intro_cards import (
    INTRO_RECAP_MARKER,
    LEGACY_INTRO_RECAP_MARKER,
    build_intro_cards_recap,
)
from app.services.message_service import save_message

router = APIRouter(tags=["usage"])

ADVANCED_PAGE_VIEW_THRESHOLD = 12
ADVANCED_DISTINCT_PAGE_THRESHOLD = 5
ADVANCED_MESSAGE_THRESHOLD = 10


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


def _find_user(db: Session, user_number: str) -> User | None:
    return db.query(User).filter(
        (User.phone_number == user_number) | (User.email == user_number)
    ).first()


def _user_activity(db: Session, user: User | None, user_number: str) -> dict[str, int]:
    if user:
        page_view_query = db.query(UsageEvent).filter(
            UsageEvent.event_type == "page_view",
            UsageEvent.user_id == user.id,
        )
        page_views = page_view_query.count()
        distinct_pages = len({
            row[0]
            for row in page_view_query.with_entities(UsageEvent.page).distinct().all()
            if row[0]
        })
    else:
        page_views = 0
        distinct_pages = 0

    user_messages = db.query(Message).filter(
        Message.user_number == user_number,
        Message.sender == "user",
    ).count()

    return {
        "page_views": page_views,
        "distinct_pages": distinct_pages,
        "user_messages": user_messages,
    }


def _is_advanced_user(user: User | None, activity: dict[str, int]) -> bool:
    if user and user.is_admin:
        return True

    return (
        activity["page_views"] >= ADVANCED_PAGE_VIEW_THRESHOLD
        or activity["distinct_pages"] >= ADVANCED_DISTINCT_PAGE_THRESHOLD
        or activity["user_messages"] >= ADVANCED_MESSAGE_THRESHOLD
    )


@router.get("/usage-events/intro-state")
def get_intro_state(
    user_number: str,
    db: Session = Depends(get_db),
):
    user = _find_user(db, user_number)
    activity = _user_activity(db, user, user_number)
    is_advanced = _is_advanced_user(user, activity)

    return {
        "show_intro_cards": not is_advanced,
        "is_advanced_user": is_advanced,
        "activity": activity,
    }


@router.post("/usage-events/intro-recap-message")
def send_intro_recap_message(
    user_number: str,
    db: Session = Depends(get_db),
):
    existing = db.query(Message).filter(
        Message.user_number == user_number,
        Message.sender == "assistant",
        Message.conversation_type == "messages",
        (
            Message.content.contains(INTRO_RECAP_MARKER)
            | Message.content.contains(LEGACY_INTRO_RECAP_MARKER)
        ),
    ).first()

    if existing:
        return {"status": "already_sent", "message_id": existing.id}

    message = save_message(
        db=db,
        sender="assistant",
        user_number=user_number,
        content=build_intro_cards_recap(),
        message_type="notification",
        conversation_type="messages",
        is_read=False,
    )

    return {"status": "sent", "message_id": message.id}
