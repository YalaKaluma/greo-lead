from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import Message
from pydantic import BaseModel
from datetime import datetime
from typing import Optional
from app.services.message_service import message_types_for_conversation, normalize_conversation_type

router = APIRouter()


class MessageResponse(BaseModel):
    id: int
    sender: str
    user_number: str
    content: str
    timestamp: datetime
    message_type: Optional[str] = None
    conversation_type: Optional[str] = None
    is_read: Optional[bool] = True
    reflection_depth_score: Optional[float] = None
    reflection_depth_level: Optional[int] = None
    reflection_depth_label: Optional[str] = None
    reflection_depth_explanation: Optional[str] = None
    reflection_depth_recommendations: Optional[list[str]] = None

    class Config:
        from_attributes = True


@router.get("/messages", response_model=list[MessageResponse])
def get_messages(
        user_number: str,
        limit: Optional[int] = 1000,
        conversation_type: Optional[str] = None,
        db: Session = Depends(get_db)
):
    """Get conversation messages for a user"""
    query = db.query(Message).filter(
        Message.user_number == user_number
    )

    normalized_conversation_type = normalize_conversation_type(conversation_type)
    allowed_message_types = message_types_for_conversation(normalized_conversation_type)
    if normalized_conversation_type:
        query = query.filter(
            (Message.conversation_type == normalized_conversation_type)
            | (Message.message_type.in_(allowed_message_types or []))
        )

    messages = query.order_by(Message.timestamp.desc()).limit(limit).all()
    
    # Reverse to get chronological order (oldest first)
    return list(reversed(messages))
