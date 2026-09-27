from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone

from openai import OpenAI
from pydantic import BaseModel, ConfigDict, Field

from app.config import OPENAI_API_KEY
from app.services.meeting_review_service import review_actions, explicit_self_owner
from app.services.meeting_resolution_contract import grounded, numbered_transcript, sourced_evidence
from app.utils.ai_safety import (
    UNTRUSTED_CONTEXT_POLICY,
    parse_bounded_json_object,
    wrap_untrusted_context,
)


client = OpenAI(api_key=OPENAI_API_KEY)
MEETING_TASK_MODEL = os.getenv(
    "MEETING_TASK_MODEL",
    os.getenv("MEETING_INTELLIGENCE_MODEL", "gpt-4.1"),
)


class ExtractedActionItem(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    description: str = Field(min_length=3, max_length=500)
    owner_name: str | None = Field(default=None, max_length=160)
    due_date: str | None = Field(default=None, max_length=40)
    confidence: float = Field(ge=0, le=1)
    evidence_excerpt: str = Field(default="", max_length=1000)
    evidence_line_ids: list[int] | None = Field(default=None, max_length=100)
    due_date_evidence_line_ids: list[int] | None = Field(default=None, max_length=20)


def validate_due_date(item, transcript):
    """An extraction timestamp must never become a commitment deadline."""
    if not item.get("due_date"):
        return item
    ids = item.get("due_date_evidence_line_ids")
    quote = sourced_evidence({"evidence_line_ids": ids or [], "evidence_excerpt": ""}, transcript)["evidence_excerpt"]
    temporal = r"\b(today|tomorrow|tonight|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week|this week|end of|by \d|within \d|in \d|january|february|march|april|may|june|july|august|september|october|november|december)\b|\d{1,4}[-/]\d{1,2}[-/]\d{1,4}"
    if not grounded(quote, transcript) or not re.search(temporal, quote, re.I):
        return {**item, "due_date": None}
    try:
        datetime.strptime(item["due_date"], "%Y-%m-%d")
    except (ValueError, TypeError):
        return {**item, "due_date": None}
    return item


class ExtractedActionItems(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action_items: list[ExtractedActionItem] = Field(default_factory=list, max_length=50)


def extract_action_items(
    transcript: str,
    meeting_analysis: dict,
    supplied_context: str | None = None,
) -> dict:
    """Extract explicit commitments independently from meeting summarization."""
    meeting_date = meeting_analysis.get("meeting_date")
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
                    f"Meeting date: {meeting_date or 'unknown'}. Return JSON only: "
                    "{action_items:[{description,owner_name,due_date,confidence,evidence_excerpt,evidence_line_ids,due_date_evidence_line_ids}]}. "
                    "A due date requires due_date_evidence_line_ids citing an explicit temporal commitment for THIS action. "
                    "The meeting date alone is not a deadline. Otherwise due_date=null and date evidence=[]. "
                    "Every action must include evidence_line_ids, the bracketed line numbers of its commitment "
                    "in the transcript. Choose a small continuous span; the application copies the exact source. "
                    "Use null for an unknown owner or due date. Resolve relative dates against the MEETING DATE, "
                    "never the reassessment date. If the meeting date is unknown, leave relative deadlines null. "
                    "Check the actual weekday. Separate agreed commitments from proposed scope and hypothetical "
                    "workstreams. Include explicit commitments to circulate materials or review a document. "
                    "Consolidate duplicates. Include commitments made by "
                    "other participants because the user may want to track a follow-up. Confidence is 0 to 1.\n\n"
                    + wrap_untrusted_context("meeting_overview", json.dumps(meeting_analysis, default=str), 16000)
                    + "\n\n"
                    + wrap_untrusted_context("user_context", supplied_context or "none", 8000)
                    + "\n\n"
                    + wrap_untrusted_context("transcript", numbered_transcript(transcript), 120000)
                ),
            },
        ],
        max_tokens=4000,
    )
    parsed = parse_bounded_json_object(response.choices[0].message.content, max_characters=80_000)
    reviewed = review_actions(client, MEETING_TASK_MODEL, transcript, meeting_analysis, parsed.get("action_items") or [])
    validated = ExtractedActionItems.model_validate(reviewed)
    sourced_items = [sourced_evidence(item.model_dump(exclude_none=True), transcript)
                     for item in validated.action_items]
    grounded_items = [validate_due_date(explicit_self_owner(item), transcript) for item in sourced_items
                      if grounded(item["evidence_excerpt"], transcript)]
    return {"action_items": grounded_items}
