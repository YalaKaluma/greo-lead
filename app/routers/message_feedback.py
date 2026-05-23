from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Message, MessageFeedback, User

router = APIRouter()


class MessageFeedbackRequest(BaseModel):
    message_id: int
    source_context: str = Field(..., min_length=1, max_length=50)
    rating: int = Field(..., ge=1, le=5)
    feedback_text: str | None = None


@router.post("/message-feedback")
def submit_message_feedback(
    payload: MessageFeedbackRequest,
    db: Session = Depends(get_db),
):
    message = db.query(Message).filter(Message.id == payload.message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    user = None
    if message.user_number:
        user = db.query(User).filter(User.phone_number == message.user_number).first()

    feedback = MessageFeedback(
        user_id=user.id if user else None,
        message_id=payload.message_id,
        source_context=payload.source_context,
        rating=payload.rating,
        feedback_text=(payload.feedback_text or "").strip() or None,
    )
    db.add(feedback)
    db.commit()
    db.refresh(feedback)

    return {
        "success": True,
        "feedback_id": feedback.id,
        "message_id": feedback.message_id,
        "rating": feedback.rating,
    }
