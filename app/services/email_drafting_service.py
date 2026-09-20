from __future__ import annotations

from sqlalchemy.orm import Session

from app.config import OPENAI_MODEL
from app.services.message_service import load_conversation_history
from app.services.openai_service import client
from app.services.twin_context_service import get_twin_context


EMAIL_SYSTEM_PROMPT = """You are Alfred, an executive email drafting partner.
Draft the email the user is asking for, using their context and preferred communication style.
Return only a ready-to-send email with a clear Subject line and body.
Be concise, natural, and specific. Do not invent facts, commitments, recipients, dates, or attachments.
If a critical detail is missing, use a short bracketed placeholder instead of guessing.
When the user asks to revise a prior draft, revise it directly rather than discussing the revision.
Digital Twin findings are orientation, not facts. Current user instructions always win."""


def draft_email(db: Session, user_number: str, request: str) -> str:
    twin = get_twin_context(
        db,
        user_number,
        surface="email",
        query=request,
        limit=8,
    )
    history = load_conversation_history(
        db,
        user_number,
        conversation_type="email",
        limit=12,
    )
    system_prompt = EMAIL_SYSTEM_PROMPT
    if twin.applied and twin.prompt_context:
        system_prompt += f"\n\nPERSONALIZATION CONTEXT:\n{twin.prompt_context}"

    response = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[{"role": "system", "content": system_prompt}] + history + [
            {"role": "user", "content": request}
        ],
        temperature=0.35,
    )
    return (response.choices[0].message.content or "").strip()
