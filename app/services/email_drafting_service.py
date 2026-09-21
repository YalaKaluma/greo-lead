from __future__ import annotations

from dataclasses import dataclass
from sqlalchemy.orm import Session

from app.config import OPENAI_MODEL
from app.services.message_service import load_conversation_history
from app.services.openai_service import client
from app.services.twin_context_service import get_twin_context
from app.services.evidence_memory_service import format_evidence_context, retrieve_evidence


EMAIL_SYSTEM_PROMPT = """You are Alfred, an executive email drafting partner.
Draft the email the user is asking for, using their context and preferred communication style.
Return only a ready-to-send email with a clear Subject line and body.
Be concise, natural, and specific. Do not invent facts, commitments, recipients, dates, or attachments.
If a critical detail is missing, use a short bracketed placeholder instead of guessing.
When the user asks to revise a prior draft, revise it directly rather than discussing the revision.
Digital Twin findings are orientation, not facts. Current user instructions always win."""


@dataclass(frozen=True)
class EmailDraftResult:
    draft: str
    context_receipt: dict


def draft_email(db: Session, user_number: str, request: str) -> EmailDraftResult:
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
    evidence = retrieve_evidence(db, user_number, request, limit=8)
    evidence_context = format_evidence_context(evidence)
    system_prompt = EMAIL_SYSTEM_PROMPT
    if twin.applied and twin.prompt_context:
        system_prompt += f"\n\nPERSONALIZATION CONTEXT:\n{twin.prompt_context}"
    if evidence_context:
        system_prompt += f"\n\n{evidence_context}\nUse only relevant evidence. Prefer current source evidence over generalized Twin patterns when they differ."

    response = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[{"role": "system", "content": system_prompt}] + history + [
            {"role": "user", "content": request}
        ],
        temperature=0.35,
    )
    draft = (response.choices[0].message.content or "").strip()
    receipt = {
        "version": 1,
        "core_twin": {
            "used": twin.core_twin_applied,
            "snapshot_id": twin.snapshot_id,
        },
        "full_twin": {
            "used": bool(twin.claim_ids),
            "claim_ids": list(twin.claim_ids),
        },
        "evidence": [
            {
                "evidence_id": item.evidence_id,
                "source_type": item.source_type,
                "source_id": item.source_id,
                "label": item.label,
                "occurred_at": item.occurred_at.isoformat(),
                "tags": list(item.tags),
                "excerpt": item.excerpt[:280],
                "relevance_score": round(item.score, 4),
                "supporting_items": item.supporting_items,
            }
            for item in evidence
        ],
    }
    return EmailDraftResult(draft=draft, context_receipt=receipt)
