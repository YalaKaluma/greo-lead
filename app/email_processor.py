from app.email_prompt import SYSTEM_PROMPT
from app.config import DEFAULT_USER_NUMBER
from app.db import SessionLocal
from app.services.openai_service import draft_email
from app.services.gmail_service import send_email
from app.services.twin_context_service import append_twin_context, get_twin_context

def process_email(message: dict, db=None, user_number: str | None = None):
    user_prompt = f"""
Subject:
{message['subject']}

Email:
{message['body']}
"""

    owns_db = db is None
    db = db or SessionLocal()
    try:
        resolved_user_number = user_number or DEFAULT_USER_NUMBER
        twin_context = get_twin_context(
            db,
            resolved_user_number,
            surface="email",
            query=f"{message.get('subject', '')}\n{message.get('body', '')}"[:12000],
            limit=8,
        ) if resolved_user_number else None
        system_prompt = append_twin_context(SYSTEM_PROMPT, twin_context) if twin_context else SYSTEM_PROMPT
        drafted_text = draft_email(
            system_prompt=system_prompt,
            user_content=user_prompt
        )
    finally:
        if owns_db:
            db.close()

    send_email(
        to=message["from_email"],
        subject=f"Re: {message['subject']}",
        body=drafted_text
    )
