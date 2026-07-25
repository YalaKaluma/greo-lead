from __future__ import annotations

import json
import os
from datetime import datetime, timezone

from openai import OpenAI

from app.config import OPENAI_API_KEY


client = OpenAI(api_key=OPENAI_API_KEY)
MEETING_TASK_MODEL = os.getenv(
    "MEETING_TASK_MODEL",
    os.getenv("MEETING_INTELLIGENCE_MODEL", "gpt-4o-mini"),
)


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
                    "outside the meeting. Every item must have direct transcript evidence."
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
                    f"MEETING OVERVIEW:\n{json.dumps(meeting_analysis, default=str)[:16000]}\n\n"
                    f"USER-SUPPLIED CONTEXT:\n{supplied_context or 'none'}\n\n"
                    f"TRANSCRIPT OR NOTES:\n{transcript[:120000]}"
                ),
            },
        ],
    )
    return json.loads(response.choices[0].message.content)
