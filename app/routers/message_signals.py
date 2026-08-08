from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Message, MessageSignalFlag, User
from app.services.message_signal_classifier import (
    classify_message_signals,
    classify_unprocessed_messages,
    get_message_signal_flags,
    mark_message_for_reclassification,
)
from app.routers.auth import require_authenticated_user

router = APIRouter()


class BackfillRequest(BaseModel):
    user_number: Optional[str] = None
    user_id: Optional[int] = None
    limit: int = 50


class MessageSignalFlagResponse(BaseModel):
    id: int
    user_id: Optional[int]
    message_id: int
    source_type: str
    signal_type: str
    is_met: bool
    confidence_score: float
    evidence_excerpt: Optional[str]
    reasoning_summary: Optional[str]
    prompt_version: str
    model_version: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


def _message_for_user_or_404(
    db: Session,
    message_id: int,
    user_number: Optional[str] = None,
    user_id: Optional[int] = None,
) -> Message:
    query = db.query(Message).filter(Message.id == message_id)
    if user_number:
        query = query.filter(Message.user_number == user_number)
    elif user_id is not None:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="Message not found")
        query = query.filter(Message.user_number == user.phone_number)
    else:
        raise HTTPException(status_code=400, detail="Provide user_number or user_id.")

    message = query.first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    return message


@router.post("/classify/{message_id}", response_model=list[MessageSignalFlagResponse])
def classify_one_message(
    message_id: int,
    user_number: Optional[str] = None,
    user_id: Optional[int] = None,
    force: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authenticated_user),
):
    try:
        _message_for_user_or_404(db, message_id, user_id=current_user.id)
        if force:
            mark_message_for_reclassification(db, message_id)
        return classify_message_signals(db, message_id, force=force)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error))
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))


@router.post("/backfill")
def backfill_message_signals(
    request: BackfillRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authenticated_user),
):
    limit = max(1, min(request.limit or 50, 200))
    return classify_unprocessed_messages(
        db,
        user_id=current_user.id,
        user_number=None,
        limit=limit,
    )


@router.get("", response_model=list[MessageSignalFlagResponse])
@router.get("/", response_model=list[MessageSignalFlagResponse])
def list_message_signal_flags(
    user_number: Optional[str] = None,
    user_id: Optional[int] = None,
    signal_type: Optional[str] = None,
    source_type: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authenticated_user),
):
    return get_message_signal_flags(
        db,
        user_number=None,
        user_id=current_user.id,
        signal_type=signal_type,
        source_type=source_type,
    )


@router.get("/{message_id}", response_model=list[MessageSignalFlagResponse])
def get_message_signal_debug(
    message_id: int,
    user_number: Optional[str] = None,
    user_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authenticated_user),
):
    _message_for_user_or_404(db, message_id, user_id=current_user.id)
    flags = (
        db.query(MessageSignalFlag)
        .filter(MessageSignalFlag.message_id == message_id)
        .order_by(MessageSignalFlag.updated_at.desc())
        .all()
    )
    if not flags:
        raise HTTPException(status_code=404, detail="No signal flags found for this message.")
    return flags
