from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.services.email_drafting_service import draft_email
from app.services.message_service import save_message
from app.utils.safe_errors import log_failure


router = APIRouter()


class EmailDraftRequest(BaseModel):
    user_number: str
    context: str = Field(min_length=1, max_length=12000)


@router.post("/draft")
def create_email_draft(request: EmailDraftRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.phone_number == request.user_number).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    context = request.context.strip()
    try:
        draft = draft_email(db, request.user_number, context)
        user_message = save_message(
            db,
            sender="user",
            user_number=request.user_number,
            content=context,
            message_type="email_draft",
            conversation_type="email",
        )
        assistant_message = save_message(
            db,
            sender="assistant",
            user_number=request.user_number,
            content=draft,
            message_type="email_draft",
            conversation_type="email",
        )
    except Exception as exc:
        log_failure("email_draft", exc)
        raise HTTPException(status_code=503, detail="Alfred could not draft the email right now.") from exc

    return {
        "draft": draft,
        "message_id": assistant_message.id,
        "request_message_id": user_message.id,
    }
