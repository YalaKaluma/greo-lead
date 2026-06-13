from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Message, MessageFeedback, User
from app.services.audit_log_service import write_audit_log

router = APIRouter()


class MessageFeedbackRequest(BaseModel):
    message_id: int
    user_number: str = Field(..., min_length=1, max_length=255)
    source_context: str = Field(..., min_length=1, max_length=50)
    rating: int = Field(..., ge=1, le=5)
    feedback_text: str | None = None


@router.post("/message-feedback")
def submit_message_feedback(
    payload: MessageFeedbackRequest,
    db: Session = Depends(get_db),
):
    message = db.query(Message).filter(
        Message.id == payload.message_id,
        Message.user_number == payload.user_number,
    ).first()
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
    write_audit_log(
        db,
        user_id=user.id if user else None,
        event_type="message_feedback_submitted",
        object_type="message_feedback",
        object_id=feedback.id,
        metadata={
            "feedback_id": feedback.id,
            "message_id": payload.message_id,
            "source_context": payload.source_context,
            "rating": payload.rating,
        },
    )

    return {
        "success": True,
        "feedback_id": feedback.id,
        "message_id": feedback.message_id,
        "rating": feedback.rating,
    }
