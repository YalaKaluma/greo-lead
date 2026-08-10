from __future__ import annotations

import json
import os
from datetime import datetime, timezone

from openai import OpenAI
from pydantic import BaseModel, ConfigDict, Field

from app.config import OPENAI_API_KEY
from app.utils.ai_safety import (
    UNTRUSTED_CONTEXT_POLICY,
    evidence_is_grounded,
    parse_bounded_json_object,
    wrap_untrusted_context,
)


client = OpenAI(api_key=OPENAI_API_KEY)
MEETING_TASK_MODEL = os.getenv(
    "MEETING_TASK_MODEL",
    os.getenv("MEETING_INTELLIGENCE_MODEL", "gpt-4o-mini"),
)


class ExtractedActionItem(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    description: str = Field(min_length=3, max_length=500)
    owner_name: str | None = Field(default=None, max_length=160)
    due_date: str | None = Field(default=None, max_length=40)
    confidence: float = Field(ge=0, le=1)
    evidence_excerpt: str = Field(min_length=8, max_length=1000)


class ExtractedActionItems(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action_items: list[ExtractedActionItem] = Field(default_factory=list, max_length=50)


def extract_action_items(
    transcript: str,
    meeting_analysis: dict,
    supplied_context: str | None = None,
) -> dict:
    """Extract explicit commitments independently from meeting summarization."""
    today = datetime.now(timezone.utc).date().isoformat()
    response = client.chat.completions.create(
        model=MEETING_TASK_MODEL,
        response_format={"type": "json_object"},
        temperature=0.1,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a precise executive action-item analyst. Extract commitments and follow-ups, "
                    "not general discussion, aspirations, decisions without an action, or suggested ideas. "
                    "Never invent an owner or deadline. Preserve enough context for the task to make sense "
                    "outside the meeting. Every item must have direct transcript evidence. "
                    + UNTRUSTED_CONTEXT_POLICY
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Today is {today}. Return JSON only: "
                    "{action_items:[{description,owner_name,due_date,confidence,evidence_excerpt}]}. "
                    "Use null for an unknown owner or due date. Resolve relative dates against today only when "
                    "the transcript clearly states them. Consolidate duplicates. Include commitments made by "
                    "other participants because the user may want to track a follow-up. Confidence is 0 to 1.\n\n"
                    + wrap_untrusted_context("meeting_overview", json.dumps(meeting_analysis, default=str), 16000)
                    + "\n\n"
                    + wrap_untrusted_context("user_context", supplied_context or "none", 8000)
                    + "\n\n"
                    + wrap_untrusted_context("transcript", transcript, 120000)
                ),
            },
        ],
        max_tokens=1800,
    )
    parsed = parse_bounded_json_object(response.choices[0].message.content, max_characters=80_000)
    validated = ExtractedActionItems.model_validate(parsed)
    grounded_items = [
        item.model_dump()
        for item in validated.action_items
        if evidence_is_grounded(item.evidence_excerpt, transcript)
    ]
    return {"action_items": grounded_items}
