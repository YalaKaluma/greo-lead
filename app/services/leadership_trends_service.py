from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session, selectinload

from app.models import Meeting
from app.services.meeting_intelligence_service import MEETING_COACHING_MODEL, client


DOMAINS = [
    "Vision",
    "People",
    "Prioritize & Execute",
    "Time & Energy",
    "Learning & Development",
]


def get_leadership_trends(db: Session, user_number: str, days: int = 90) -> dict:
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    meetings = (
        db.query(Meeting)
        .options(selectinload(Meeting.leadership_domain_assessments))
        .filter(
            Meeting.user_number == user_number,
            Meeting.processing_status == "ready",
            or_(
                Meeting.started_at >= cutoff,
                and_(Meeting.started_at.is_(None), Meeting.created_at >= cutoff),
            ),
            Meeting.leadership_domain_assessments.any(),
        )
        .order_by(Meeting.started_at.desc())
        .all()
    )

    scores_by_domain: dict[str, list[int]] = defaultdict(list)
    saved_feedback = []
    for meeting in meetings:
        for assessment in meeting.leadership_domain_assessments:
            if assessment.domain not in DOMAINS:
                continue
            if assessment.score is not None:
                scores_by_domain[assessment.domain].append(assessment.score)
            saved_feedback.append({
                "meeting_id": meeting.id,
                "meeting_title": meeting.title,
                "meeting_date": (meeting.started_at or meeting.created_at).isoformat(),
                "domain": assessment.domain,
                "score": assessment.score,
                "feedback": assessment.feedback,
            })

    domain_averages = [
        {
            "domain": domain,
            "average_score": round(sum(scores_by_domain[domain]) / len(scores_by_domain[domain]), 1)
            if scores_by_domain[domain] else None,
            "assessment_count": len(scores_by_domain[domain]),
        }
        for domain in DOMAINS
    ]

    base = {
        "period_days": days,
        "meeting_count": len(meetings),
        "domain_averages": domain_averages,
        "synthesis": None,
    }
    if not saved_feedback:
        return base

    response = client.chat.completions.create(
        model=MEETING_COACHING_MODEL,
        response_format={"type": "json_object"},
        temperature=0.2,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are Alfred, an executive coach synthesizing already-completed meeting leadership "
                    "assessments. Do not reassess any meeting, infer from transcripts, invent evidence, describe "
                    "score evolution, or segment by meeting type. Identify broader recurring patterns only from "
                    "the saved feedback provided. Calibrate claims to the number of meetings and distinguish a "
                    "recurring pattern from a one-off observation."
                ),
            },
            {
                "role": "user",
                "content": (
                    "Return JSON only with this structure: "
                    "{overall_summary:string,recurring_strengths:[string],recurring_growth_edges:[string],"
                    "next_focus:string,domain_synthesis:[{domain:string,pattern:string}]}. "
                    "Provide exactly one concise pattern for each of the five domains. recurring_strengths and "
                    "recurring_growth_edges should each contain 1-3 specific items. next_focus should recommend "
                    "one observable leadership practice for upcoming meetings. Use second person and plain, "
                    "supportive language. Do not calculate or alter scores; averages are supplied for context.\n\n"
                    f"WINDOW: Last {days} days\n"
                    f"MEETINGS WITH ASSESSMENTS: {len(meetings)}\n"
                    f"DOMAIN AVERAGES: {json.dumps(domain_averages)}\n"
                    f"SAVED ASSESSMENTS: {json.dumps(saved_feedback, default=str)[:100000]}"
                ),
            },
        ],
    )
    base["synthesis"] = json.loads(response.choices[0].message.content)
    return base
