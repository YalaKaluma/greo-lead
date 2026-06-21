from __future__ import annotations

import json
import time
from collections import defaultdict
from datetime import date, datetime, timedelta
from statistics import mean
from typing import Any

from sqlalchemy.orm import Session

from app.config import OPENAI_MODEL
from app.models import Message
from app.services.onboarding_seed_service import is_starter_journal_example
from app.services.openai_service import client


DEPTH_LEVELS = {
    1: "Description",
    2: "Emotion",
    3: "Root Cause",
    4: "Pattern Recognition",
    5: "Growth & Transformation",
}

DEPTH_LEVEL_NAMES = {
    "description": 1,
    "emotion": 2,
    "root cause": 3,
    "root_cause": 3,
    "pattern recognition": 4,
    "pattern_recognition": 4,
    "growth & transformation": 5,
    "growth and transformation": 5,
    "growth transformation": 5,
}


LEVEL_BADGES = {
    1: "Emerging Reflection",
    2: "Self-Awareness",
    3: "Self-Awareness",
    4: "Pattern Recognition",
    5: "Growth Mindset",
}


def depth_level_for_score(score: float | None) -> int | None:
    if score is None:
        return None
    if score <= 2:
        return 1
    if score <= 4:
        return 2
    if score <= 6:
        return 3
    if score <= 8:
        return 4
    return 5


def normalize_depth_level(value: Any, score: float | None = None) -> int:
    if isinstance(value, int):
        return max(1, min(5, value))
    if isinstance(value, float):
        return max(1, min(5, int(value)))
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized.isdigit():
            return max(1, min(5, int(normalized)))
        if normalized.startswith("level "):
            suffix = normalized.replace("level ", "", 1).strip()
            if suffix.isdigit():
                return max(1, min(5, int(suffix)))
        if normalized in DEPTH_LEVEL_NAMES:
            return DEPTH_LEVEL_NAMES[normalized]
    return depth_level_for_score(score) or 1


def _fallback_score(text: str) -> dict[str, Any]:
    lowered = text.lower()
    score = 1.5

    emotion_terms = ["felt", "feel", "frustrated", "nervous", "excited", "angry", "sad", "proud", "afraid"]
    cause_terms = ["because", "why", "triggered", "afraid of", "worried that", "made me realize"]
    pattern_terms = ["often", "always", "again", "pattern", "recurring", "third time", "tend to"]
    growth_terms = ["next time", "differently", "learned", "lesson", "i will", "change", "practice"]

    if any(term in lowered for term in emotion_terms):
        score = 3.5
    if any(term in lowered for term in cause_terms):
        score = 5.5
    if any(term in lowered for term in pattern_terms):
        score = 7.5
    if any(term in lowered for term in growth_terms):
        score = 9.0

    level = depth_level_for_score(score)
    return {
        "score": score,
        "level": level,
        "level_label": DEPTH_LEVELS[level],
        "explanation": "Alfred found enough reflective signal to estimate this depth score, but could not complete the full AI scoring pass.",
        "recommendations": ["End with what this teaches you about yourself.", "Name one action you would take differently next time."],
    }


def score_reflection_depth(text: str) -> dict[str, Any]:
    if not text or not text.strip():
        return _fallback_score("")

    system_prompt = """
You score leadership journal entries for reflection depth. Do not reward length.
Use this framework:
Level 1 Description, score 1-2: event reporting, no emotional exploration.
Level 2 Emotion, score 3-4: names feelings, limited introspection.
Level 3 Root Cause, score 5-6: explores why feelings happened.
Level 4 Pattern Recognition, score 7-8: identifies recurring themes or behaviors.
Level 5 Growth & Transformation, score 9-10: extracts lessons and future behavior changes.
Return only valid JSON with keys: score, level, level_label, explanation, recommendations.
recommendations must be 2-3 short personalized strings.
"""

    try:
        response = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": system_prompt.strip()},
                {"role": "user", "content": text.strip()},
            ],
            temperature=0.2,
            response_format={"type": "json_object"},
        )
        payload = json.loads(response.choices[0].message.content)
        score = max(1.0, min(10.0, round(float(payload.get("score", 1)), 1)))
        level = normalize_depth_level(payload.get("level"), score)
        return {
            "score": score,
            "level": level,
            "level_label": DEPTH_LEVELS.get(level, payload.get("level_label") or "Description"),
            "explanation": str(payload.get("explanation") or "").strip(),
            "recommendations": [
                str(item).strip()
                for item in payload.get("recommendations", [])
                if str(item).strip()
            ][:3],
        }
    except Exception as error:
        print(f"Reflection depth scoring failed: {error}")
        return _fallback_score(text)


def score_reflection_depth_batch(messages: list[dict[str, Any]]) -> dict[int, dict[str, Any]]:
    if not messages:
        return {}

    system_prompt = """
You score leadership journal/user messages for reflection depth. Do not reward length.
Use this framework:
Level 1 Description, score 1-2: event reporting, no emotional exploration.
Level 2 Emotion, score 3-4: names feelings, limited introspection.
Level 3 Root Cause, score 5-6: explores why feelings happened.
Level 4 Pattern Recognition, score 7-8: identifies recurring themes or behaviors.
Level 5 Growth & Transformation, score 9-10: extracts lessons and future behavior changes.
Return only valid JSON with key scores. scores must be an array of objects with keys:
id, score, level, level_label, explanation, recommendations.
recommendations must be 2-3 short personalized strings.
"""

    response = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {"role": "system", "content": system_prompt.strip()},
            {"role": "user", "content": json.dumps({"messages": messages}, ensure_ascii=False)},
        ],
        temperature=0.2,
        response_format={"type": "json_object"},
    )
    payload = json.loads(response.choices[0].message.content)
    results = {}

    for item in payload.get("scores", []):
        score = max(1.0, min(10.0, round(float(item.get("score", 1)), 1)))
        level = normalize_depth_level(item.get("level"), score)
        recommendations = item.get("recommendations") or []
        if not isinstance(recommendations, list):
            recommendations = []

        results[int(item["id"])] = {
            "score": score,
            "level": level,
            "level_label": DEPTH_LEVELS.get(level, item.get("level_label") or "Description"),
            "explanation": str(item.get("explanation") or "").strip(),
            "recommendations": [
                str(recommendation).strip()
                for recommendation in recommendations
                if str(recommendation).strip()
            ][:3],
        }

    return results


def apply_reflection_depth(target: Any, text: str) -> dict[str, Any]:
    result = score_reflection_depth(text)
    target.reflection_depth_score = result["score"]
    target.reflection_depth_level = result["level"]
    target.reflection_depth_label = result["level_label"]
    target.reflection_depth_explanation = result["explanation"]
    target.reflection_depth_recommendations = result["recommendations"]
    target.reflection_depth_scored_at = datetime.utcnow()
    return result


def apply_reflection_depth_result(target: Any, result: dict[str, Any], scored_at: datetime | None = None) -> None:
    target.reflection_depth_score = result["score"]
    target.reflection_depth_level = result["level"]
    target.reflection_depth_label = result["level_label"]
    target.reflection_depth_explanation = result["explanation"]
    target.reflection_depth_recommendations = result["recommendations"]
    target.reflection_depth_scored_at = scored_at or datetime.utcnow()


def backfill_recent_reflection_depth(
    db: Session,
    user_number: str,
    limit: int = 50,
    batch_size: int = 10,
    max_text_chars: int = 3000,
) -> dict[str, Any]:
    safe_limit = max(1, min(int(limit or 50), 250))
    safe_batch_size = max(1, min(int(batch_size or 10), 25))
    started = time.time()

    latest_messages = (
        db.query(Message)
        .filter(Message.user_number == user_number, Message.sender == "user")
        .order_by(Message.timestamp.desc(), Message.id.desc())
        .limit(safe_limit)
        .all()
    )
    latest_messages = list(reversed(latest_messages))
    to_score = [message for message in latest_messages if message.reflection_depth_score is None]
    skipped_already_scored = len(latest_messages) - len(to_score)
    processed = 0

    for start in range(0, len(to_score), safe_batch_size):
        batch = to_score[start:start + safe_batch_size]
        payload = [
            {
                "id": message.id,
                "text": (message.content or "")[:max_text_chars],
            }
            for message in batch
        ]
        results_by_id = score_reflection_depth_batch(payload)
        now = datetime.utcnow()

        for message in batch:
            result = results_by_id.get(message.id)
            if not result:
                result = score_reflection_depth(message.content or "")
            apply_reflection_depth_result(message, result, now)

        db.commit()
        processed += len(batch)

    return {
        "messages_considered": len(latest_messages),
        "scored": processed,
        "skipped_already_scored": skipped_already_scored,
        "remaining_unscored_in_limit": max(len(to_score) - processed, 0),
        "limit": safe_limit,
        "elapsed_seconds": round(time.time() - started, 1),
    }


def _date_range(start_date: date, end_date: date) -> list[date]:
    days = (end_date - start_date).days
    return [start_date + timedelta(days=offset) for offset in range(days + 1)]


def _avg(values: list[float]) -> float | None:
    if not values:
        return None
    return round(mean(values), 1)


def _build_chart(entries: list[Message], start_date: date, end_date: date) -> list[dict[str, Any]]:
    values_by_date = defaultdict(list)
    for entry in entries:
        if entry.reflection_depth_score is None or not entry.timestamp:
            continue
        values_by_date[entry.timestamp.date()].append(float(entry.reflection_depth_score))

    chart = []
    daily_scores = []
    for day in _date_range(start_date, end_date):
        entry_count = len(values_by_date.get(day, []))
        daily_average = _avg(values_by_date.get(day, [])) if entry_count else 0
        daily_scores.append((day, daily_average))

        last_7 = [value for score_day, value in daily_scores if day - timedelta(days=6) <= score_day <= day]
        last_30 = [value for score_day, value in daily_scores if day - timedelta(days=29) <= score_day <= day]

        chart.append({
            "date": day.isoformat(),
            "daily_average": daily_average,
            "weekly_average": _avg(last_7),
            "rolling_30_day_average": _avg(last_30),
            "entry_count": entry_count,
        })

    return chart


def _common_strengths(entries: list[Message]) -> list[str]:
    high_entries = [entry for entry in entries if (entry.reflection_depth_score or 0) >= 7]
    if len(high_entries) >= 3:
        return ["You are increasingly spotting patterns rather than only recounting events."]
    if any((entry.reflection_depth_score or 0) >= 5 for entry in entries):
        return ["You are connecting feelings to underlying causes."]
    return ["You are building the habit of capturing experiences consistently."]


def _common_weaknesses(entries: list[Message]) -> list[str]:
    if not entries:
        return ["Alfred needs more journal entries before patterns become reliable."]
    average_score = _avg([float(entry.reflection_depth_score) for entry in entries if entry.reflection_depth_score is not None]) or 0
    if average_score < 4:
        return ["Most entries still describe what happened more than what it revealed."]
    if average_score < 7:
        return ["The next growth edge is naming recurring patterns and future behavior changes."]
    return ["The next growth edge is turning insight into a specific behavioral experiment."]


def _build_coaching(current: float | None, previous: float | None, entries: list[Message]) -> dict[str, Any]:
    delta = round((current or 0) - (previous or 0), 1) if current is not None and previous is not None else 0
    direction = "increasing" if delta > 0 else "steady" if delta == 0 else "softer"
    strengths = _common_strengths(entries)
    weaknesses = _common_weaknesses(entries)

    summary = (
        f"Your reflections are {direction} in depth over the recent period. "
        f"{strengths[0]} {weaknesses[0]} Leadership growth accelerates when reflection leads to behavior change."
    )

    return {
        "summary": summary,
        "strengths": strengths,
        "weaknesses": weaknesses,
        "recommendations": [
            "Try asking: Why did this bother me so much?",
            "Look for situations that trigger the same emotion repeatedly.",
            "End each entry with: What will I do differently next time?",
        ],
    }


def get_reflection_depth_trends(
    user_number: str,
    db: Session,
    include_starter_examples: bool = True,
) -> dict[str, Any]:
    end_date = datetime.utcnow().date()
    start_date = end_date - timedelta(days=89)
    previous_start = end_date - timedelta(days=59)
    current_start = end_date - timedelta(days=29)

    entries = (
        db.query(Message)
        .filter(
            Message.user_number == user_number,
            Message.sender == "user",
            Message.reflection_depth_score.isnot(None),
            Message.timestamp >= datetime.combine(start_date, datetime.min.time()),
        )
        .order_by(Message.timestamp.asc())
        .all()
    )
    if not include_starter_examples:
        entries = [entry for entry in entries if not is_starter_journal_example(entry)]

    current_entries = [entry for entry in entries if entry.timestamp and entry.timestamp.date() >= current_start]
    previous_entries = [
        entry
        for entry in entries
        if entry.timestamp and previous_start <= entry.timestamp.date() < current_start
    ]

    current_average = _avg([float(entry.reflection_depth_score) for entry in current_entries])
    previous_average = _avg([float(entry.reflection_depth_score) for entry in previous_entries])
    delta = round((current_average or 0) - (previous_average or 0), 1) if current_average is not None and previous_average is not None else 0

    return {
        "summary": {
            "average_reflection_depth": {
                "current": current_average,
                "previous_30_days": previous_average,
                "trend": delta,
            },
            "deep_reflection_entries": len([entry for entry in entries if (entry.reflection_depth_score or 0) >= 8]),
            "total_journal_entries": len(entries),
        },
        "trend_chart": _build_chart(entries, start_date, end_date),
        "coaching": _build_coaching(current_average, previous_average, entries),
    }
