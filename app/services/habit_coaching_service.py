from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Optional

from openai import OpenAI
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.config import OPENAI_API_KEY, OPENAI_MODEL
from app.models import (
    Habit,
    HabitCoachingReview,
    HabitCompletion,
    JournalEntry,
    JourneyGoal,
    Message,
    Task,
    User,
)
from app.services.habits.habit_trend_service import get_habit_trends
from app.services.timezone_service import get_user_timezone, today_for_timezone

client = OpenAI(api_key=OPENAI_API_KEY)


STATUS_VALUES = {
    "improving": "Improving",
    "stable": "Stable",
    "declining": "Declining",
    "at risk": "At Risk",
    "at_risk": "At Risk",
}


def build_habit_coaching_context(db: Session, user_number: str) -> dict[str, Any]:
    user = db.query(User).filter(User.phone_number == user_number).first()
    if not user:
        raise ValueError("User not found")

    user_timezone = get_user_timezone(db, user_number)
    period_end_date = today_for_timezone(user_timezone)
    period_start_date = period_end_date - timedelta(days=89)
    period_end = datetime.combine(period_end_date, datetime.max.time())
    period_start = datetime.combine(period_start_date, datetime.min.time())
    journal_start = datetime.combine(period_end_date - timedelta(days=6), datetime.min.time())

    trends = get_habit_trends(user_number, db, user_timezone)
    habits = db.query(Habit).filter(
        Habit.user_number == user_number,
        Habit.is_active == True,
    ).order_by(Habit.created_at).all()
    habit_ids = [habit.id for habit in habits]
    goal_ids = [habit.goal_id for habit in habits if habit.goal_id]
    goals_by_id = {
        goal.id: goal
        for goal in db.query(JourneyGoal).filter(JourneyGoal.id.in_(goal_ids)).all()
    } if goal_ids else {}

    completions = []
    if habit_ids:
        completions = db.query(HabitCompletion).filter(
            HabitCompletion.habit_id.in_(habit_ids),
            HabitCompletion.date >= period_start_date,
            HabitCompletion.date <= period_end_date,
        ).all()
    completions_by_habit: dict[int, list[HabitCompletion]] = {}
    for completion in completions:
        completions_by_habit.setdefault(completion.habit_id, []).append(completion)

    tasks = db.query(Task).filter(
        Task.user_number == user_number,
        Task.goal_id.in_(goal_ids),
    ).order_by(desc(Task.updated_at)).limit(20).all() if goal_ids else []

    journal_entries = db.query(JournalEntry).filter(
        JournalEntry.user_id == user.id,
        JournalEntry.created_at >= journal_start,
    ).order_by(desc(JournalEntry.created_at)).limit(10).all()
    journal_messages = db.query(Message).filter(
        Message.user_number == user_number,
        Message.message_type == "journal",
        Message.timestamp >= journal_start,
    ).order_by(desc(Message.timestamp)).limit(10).all()

    return {
        "user": {
            "id": user.id,
            "user_number": user_number,
            "name": user.name,
            "profession": user.profession,
        },
        "review_period": {
            "start": period_start.isoformat(),
            "end": period_end.isoformat(),
        },
        "habit_list_and_definitions": [
            _habit_to_dict(habit, goals_by_id.get(habit.goal_id))
            for habit in habits
        ],
        "habit_completion_windows": {
            "last_7_days": _habit_completion_window(habits, completions_by_habit, period_end_date, 7),
            "last_21_days": _habit_completion_window(habits, completions_by_habit, period_end_date, 21),
            "last_90_days": _habit_completion_window(habits, completions_by_habit, period_end_date, 90),
        },
        "current_kpi_cards": trends.get("summary", {}),
        "compliance_trend_data": trends.get("trend_chart", []),
        "heatmap_data": trends.get("heatmap", []),
        "top_habits": trends.get("coaching_context", {}).get("strongest_habits", []),
        "habits_needing_attention": trends.get("coaching_context", {}).get("needs_attention", []),
        "scores": trends.get("scores", {}),
        "discipline_consistency_momentum": trends.get("scores", {}),
        "mechanical_coaching_context": trends.get("coaching_context", {}),
        "leaderboard": trends.get("leaderboard", []),
        "relevant_journal_entries_last_7_days": [
            _journal_to_dict(entry) for entry in journal_entries
        ] + [
            _message_to_dict(message) for message in journal_messages
        ],
        "tasks_or_goals_linked_to_habits": {
            "linked_goals": [_goal_to_dict(goal) for goal in goals_by_id.values()],
            "linked_tasks": [_task_to_dict(task, goals_by_id.get(task.goal_id)) for task in tasks],
        },
    }


def generate_habit_coaching_review(context: dict[str, Any]) -> dict[str, Any]:
    system_prompt = """You are Alfred, an executive coach and performance coach.

Generate a habit performance review grounded in the provided habit data. Be specific, honest, encouraging, and useful. Avoid mechanical phrasing and avoid inventing habits or numbers not present in the context.

Return JSON only with this exact shape:
{
  "status": "Improving | Stable | Declining | At Risk",
  "executive_summary": "...",
  "what_changed": "...",
  "key_wins": ["...", "..."],
  "watchouts": ["...", "..."],
  "top_habits": ["...", "..."],
  "habits_needing_attention": ["...", "..."],
  "recommended_focus": "...",
  "mtn_actions": [
    {
      "title": "...",
      "why_it_matters": "...",
      "suggested_next_step": "..."
    }
  ]
}

Answer these questions inside the review:
- How are my habits trending across the 7, 21, and 90 day windows?
- What improved in the last 7 days?
- What is slipping or fragile?
- Which habits are becoming reliable?
- Which habits need attention?
- What pattern do you see across discipline, consistency, and momentum?
- What should I focus on this week?
- What are the top 3 habit MTN actions?"""

    response = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": json.dumps(context, default=_json_default, ensure_ascii=False)},
        ],
        response_format={"type": "json_object"},
        temperature=0.35,
    )
    content = response.choices[0].message.content or "{}"
    parsed = json.loads(content)
    parsed["_raw_openai"] = {
        "model": OPENAI_MODEL,
        "content": content,
        "usage": response.usage.model_dump() if response.usage else None,
    }
    return _normalize_review(parsed, context)


def save_habit_coaching_review(db: Session, user_number: str, context: dict[str, Any], review: dict[str, Any]) -> HabitCoachingReview:
    user = context["user"]
    period = context["review_period"]
    saved = HabitCoachingReview(
        user_id=user["id"],
        user_number=user_number,
        review_period_start=datetime.fromisoformat(period["start"]),
        review_period_end=datetime.fromisoformat(period["end"]),
        status=review["status"],
        executive_summary=review["executive_summary"],
        what_changed=review.get("what_changed"),
        key_wins=review.get("key_wins", []),
        watchouts=review.get("watchouts", []),
        top_habits=review.get("top_habits", []),
        habits_needing_attention=review.get("habits_needing_attention", []),
        recommended_focus=review.get("recommended_focus"),
        mtn_actions=review.get("mtn_actions", []),
        raw_context=context,
        raw_llm_response=review.get("_raw_openai", review),
        created_at=datetime.utcnow(),
    )
    db.add(saved)
    db.commit()
    db.refresh(saved)
    return saved


def refresh_habit_coaching_review(db: Session, user_number: str) -> dict[str, Any]:
    context = build_habit_coaching_context(db, user_number)
    review = generate_habit_coaching_review(context)
    saved = save_habit_coaching_review(db, user_number, context, review)
    return serialize_habit_coaching_review(saved)


def get_latest_habit_coaching_review(db: Session, user_number: str) -> Optional[dict[str, Any]]:
    saved = db.query(HabitCoachingReview).filter(
        HabitCoachingReview.user_number == user_number,
    ).order_by(desc(HabitCoachingReview.created_at)).first()
    return serialize_habit_coaching_review(saved) if saved else None


def serialize_habit_coaching_review(saved: HabitCoachingReview) -> dict[str, Any]:
    return {
        "id": saved.id,
        "source": "ai_saved",
        "review_period_start": _iso(saved.review_period_start),
        "review_period_end": _iso(saved.review_period_end),
        "created_at": _iso(saved.created_at),
        "status": saved.status,
        "executive_summary": saved.executive_summary,
        "what_changed": saved.what_changed,
        "key_wins": saved.key_wins or [],
        "watchouts": saved.watchouts or [],
        "top_habits": saved.top_habits or [],
        "habits_needing_attention": saved.habits_needing_attention or [],
        "recommended_focus": saved.recommended_focus,
        "mtn_actions": saved.mtn_actions or [],
    }


def _habit_completion_window(
    habits: list[Habit],
    completions_by_habit: dict[int, list[HabitCompletion]],
    end_date: date,
    days: int,
) -> list[dict[str, Any]]:
    start_date = end_date - timedelta(days=days - 1)
    result = []
    for habit in habits:
        expected_dates = [
            start_date + timedelta(days=offset)
            for offset in range(days)
            if _is_expected(habit, start_date + timedelta(days=offset))
        ]
        completions = [
            completion for completion in completions_by_habit.get(habit.id, [])
            if start_date <= completion.date <= end_date
        ]
        done_count = sum(1 for completion in completions if completion.status == "done")
        explicit_not_done = sum(1 for completion in completions if completion.status == "not_done")
        expected_count = len(expected_dates)
        result.append({
            "habit_id": habit.id,
            "habit_name": habit.title,
            "frequency": habit.frequency,
            "days": days,
            "expected_count": expected_count,
            "done_count": done_count,
            "compliance_rate": round((done_count / expected_count) * 100) if expected_count else 0,
            "explicit_not_done_count": explicit_not_done,
            "logged_days": len(completions),
            "daily_statuses": [
                {"date": completion.date.isoformat(), "status": completion.status}
                for completion in sorted(completions, key=lambda item: item.date)
            ],
        })
    return result


def _is_expected(habit: Habit, day: date) -> bool:
    created_at = habit.created_at.date() if isinstance(habit.created_at, datetime) else None
    if created_at and day < created_at:
        return False
    if habit.frequency == "weekdays" and day.weekday() >= 5:
        return False
    return True


def _normalize_review(review: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
    status_key = str(review.get("status") or "").strip().lower()
    status = STATUS_VALUES.get(status_key, _fallback_status(context))

    def text_list(key: str, limit: int = 5) -> list[str]:
        value = review.get(key) or []
        if isinstance(value, str):
            value = [value]
        return [str(item).strip() for item in value if str(item).strip()][:limit]

    actions = []
    for item in review.get("mtn_actions") or []:
        if not isinstance(item, dict) or not item.get("title"):
            continue
        actions.append({
            "title": str(item.get("title") or "").strip(),
            "why_it_matters": str(item.get("why_it_matters") or "").strip(),
            "suggested_next_step": str(item.get("suggested_next_step") or "").strip(),
        })

    return {
        **review,
        "status": status,
        "executive_summary": str(review.get("executive_summary") or "").strip(),
        "what_changed": str(review.get("what_changed") or "").strip(),
        "key_wins": text_list("key_wins", 4),
        "watchouts": text_list("watchouts", 4),
        "top_habits": text_list("top_habits", 4),
        "habits_needing_attention": text_list("habits_needing_attention", 4),
        "recommended_focus": str(review.get("recommended_focus") or "").strip(),
        "mtn_actions": actions[:3],
    }


def _fallback_status(context: dict[str, Any]) -> str:
    summary = context.get("current_kpi_cards", {})
    delta = (summary.get("last_7_days", {}).get("trend", {}) or {}).get("delta_vs_90", 0)
    last_7 = summary.get("last_7_days", {}).get("compliance_rate", 0)
    if last_7 < 45:
        return "At Risk"
    if delta >= 5:
        return "Improving"
    if delta <= -5:
        return "Declining"
    return "Stable"


def _habit_to_dict(habit: Habit, goal: Optional[JourneyGoal]) -> dict[str, Any]:
    return {
        "id": habit.id,
        "title": habit.title,
        "frequency": habit.frequency,
        "is_active": habit.is_active,
        "goal_id": habit.goal_id,
        "linked_goal": _goal_to_dict(goal) if goal else None,
        "created_at": _iso(habit.created_at),
        "updated_at": _iso(habit.updated_at),
    }


def _goal_to_dict(goal: JourneyGoal) -> dict[str, Any]:
    return {
        "id": goal.id,
        "title": goal.title or goal.goal_text,
        "goal_text": goal.goal_text,
        "why": goal.why,
        "time_horizon": goal.time_horizon,
        "parent_goal_id": goal.parent_goal_id,
        "updated_at": _iso(goal.updated_at),
    }


def _task_to_dict(task: Task, goal: Optional[JourneyGoal]) -> dict[str, Any]:
    return {
        "id": task.id,
        "title": task.title,
        "notes": task.notes,
        "status": task.status,
        "priority": task.priority,
        "due_date": _iso(task.due_date),
        "goal_id": task.goal_id,
        "linked_goal": goal.title or goal.goal_text if goal else None,
        "in_top10": task.in_top10,
        "top10_position": task.top10_position,
        "move_the_needle_score": float(task.move_the_needle_score) if task.move_the_needle_score is not None else None,
        "updated_at": _iso(task.updated_at),
    }


def _journal_to_dict(entry: JournalEntry) -> dict[str, Any]:
    return {
        "id": entry.id,
        "source": "journal_entry",
        "text": entry.text,
        "ai_summary": entry.ai_summary,
        "created_at": _iso(entry.created_at),
    }


def _message_to_dict(message: Message) -> dict[str, Any]:
    return {
        "id": message.id,
        "source": "journal_message",
        "text": message.content,
        "created_at": _iso(message.timestamp),
    }


def _iso(value: Any) -> Optional[str]:
    if not value:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def _json_default(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)
