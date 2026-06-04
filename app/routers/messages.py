from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import Message
from pydantic import BaseModel
from datetime import datetime
from typing import Optional

router = APIRouter()


class MessageResponse(BaseModel):
    id: int
    sender: str
    user_number: str
    content: str
    timestamp: datetime
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
        db: Session = Depends(get_db)
):
    """Get conversation messages for a user"""
    messages = db.query(Message).filter(
        Message.user_number == user_number
    ).order_by(Message.timestamp.desc()).limit(limit).all()
    
    # Reverse to get chronological order (oldest first)
    return list(reversed(messages))
