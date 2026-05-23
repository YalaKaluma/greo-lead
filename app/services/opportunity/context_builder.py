from datetime import date, datetime, timedelta
from typing import Any, Dict, Optional

from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.models import (
    Habit,
    HabitCompletion,
    JournalEntry,
    JourneyCoachingMoment,
    JourneyDevelopmentArea,
    JourneyEnergyDrain,
    JourneyEnergySource,
    JourneyExecutionSystem,
    JourneyGoal,
    JourneyOpportunity,
    JourneyProject,
    JourneyRecoveryMethod,
    JourneyValue,
    Message,
    OpportunitySuggestion,
    Task,
    User,
)


def _iso(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return str(value)


def _task_to_dict(task: Task) -> Dict[str, Any]:
    return {
        "id": task.id,
        "title": task.title,
        "notes": task.notes,
        "project": task.project,
        "due_date": _iso(task.due_date),
        "priority": task.priority,
        "goal_id": task.goal_id,
        "times_postponed": task.times_postponed,
        "move_the_needle_score": task.move_the_needle_score,
        "created_at": _iso(task.created_at),
        "updated_at": _iso(task.updated_at),
    }


def build_opportunity_context(
    user_id: int,
    surface: str,
    db: Session,
    context_needs: Optional[Dict[str, int]] = None,
) -> Dict[str, Any]:
    needs = {
        "open_tasks": 30,
        "completed_tasks": 10,
        "goals": 15,
        "journey_items": 8,
        "journal_entries": 8,
        "messages": 12,
        "suggestions": 12,
    }
    if context_needs:
        needs.update(context_needs)

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise ValueError("User not found")

    user_number = user.phone_number
    today = date.today()
    since = datetime.utcnow() - timedelta(days=14)

    open_tasks = db.query(Task).filter(
        Task.user_number == user_number,
        Task.status == "open",
    ).order_by(Task.due_date.is_(None), Task.due_date, desc(Task.updated_at)).limit(needs["open_tasks"]).all()

    completed_tasks = db.query(Task).filter(
        Task.user_number == user_number,
        Task.status == "completed",
    ).order_by(desc(Task.updated_at)).limit(needs["completed_tasks"]).all()

    goals = db.query(JourneyGoal).filter(
        JourneyGoal.user_number == user_number,
    ).order_by(JourneyGoal.sort_order, desc(JourneyGoal.updated_at)).limit(needs["goals"]).all()

    habits = db.query(Habit).filter(
        Habit.user_number == user_number,
        Habit.is_active == True,
    ).order_by(desc(Habit.updated_at)).limit(12).all()
    habit_ids = [habit.id for habit in habits]
    completions = []
    if habit_ids:
        completions = db.query(HabitCompletion).filter(
            HabitCompletion.habit_id.in_(habit_ids),
            HabitCompletion.date >= today - timedelta(days=7),
        ).all()

    completion_lookup = {}
    for completion in completions:
        completion_lookup.setdefault(completion.habit_id, []).append({
            "date": _iso(completion.date),
            "status": completion.status,
        })

    journal_entries = db.query(JournalEntry).filter(
        JournalEntry.user_id == user_id,
        JournalEntry.created_at >= since,
    ).order_by(desc(JournalEntry.created_at)).limit(needs["journal_entries"]).all()

    messages = db.query(Message).filter(
        Message.user_number == user_number,
    ).order_by(desc(Message.timestamp)).limit(needs["messages"]).all()

    suggestions = db.query(OpportunitySuggestion).filter(
        OpportunitySuggestion.user_id == user_id,
    ).order_by(desc(OpportunitySuggestion.created_at)).limit(needs["suggestions"]).all()

    def journey_rows(model, text_attr, title_attr="title"):
        rows = db.query(model).filter(model.user_number == user_number).order_by(desc(model.updated_at)).limit(needs["journey_items"]).all()
        return [
            {
                "id": row.id,
                "title": getattr(row, title_attr, None),
                "text": getattr(row, text_attr, None),
                "updated_at": _iso(getattr(row, "updated_at", None)),
            }
            for row in rows
        ]

    return {
        "user": {
            "id": user.id,
            "user_number": user.phone_number,
            "name": user.name,
            "profession": user.profession,
        },
        "surface": surface,
        "current_date": today.isoformat(),
        "open_tasks": [_task_to_dict(task) for task in open_tasks],
        "recently_completed_tasks": [_task_to_dict(task) for task in completed_tasks],
        "goals": [
            {
                "id": goal.id,
                "title": goal.title,
                "goal_text": goal.goal_text,
                "why": goal.why,
                "time_horizon": goal.time_horizon,
            }
            for goal in goals
        ],
        "journey": {
            "values": journey_rows(JourneyValue, "value_text"),
            "projects": journey_rows(JourneyProject, "description", "project_name"),
            "opportunities": journey_rows(JourneyOpportunity, "opportunity_text", "category"),
            "development_areas": journey_rows(JourneyDevelopmentArea, "skill"),
            "execution_systems": journey_rows(JourneyExecutionSystem, "system_text"),
            "energy_sources": journey_rows(JourneyEnergySource, "source_text"),
            "energy_drains": journey_rows(JourneyEnergyDrain, "drain_text"),
            "recovery_methods": journey_rows(JourneyRecoveryMethod, "method_text"),
            "coaching_moments": journey_rows(JourneyCoachingMoment, "moment_text"),
        },
        "habits": [
            {
                "id": habit.id,
                "title": habit.title,
                "frequency": habit.frequency,
                "goal_id": habit.goal_id,
                "recent_completions": completion_lookup.get(habit.id, []),
            }
            for habit in habits
        ],
        "recent_journal_entries": [
            {
                "id": entry.id,
                "text": entry.text,
                "ai_summary": entry.ai_summary,
                "created_at": _iso(entry.created_at),
            }
            for entry in journal_entries
        ],
        "recent_messages": [
            {
                "id": message.id,
                "sender": message.sender,
                "message_type": message.message_type,
                "content": message.content,
                "timestamp": _iso(message.timestamp),
            }
            for message in messages
        ],
        "recent_opportunity_feedback": [
            {
                "id": suggestion.id,
                "title": suggestion.title,
                "status": suggestion.status,
                "surface": suggestion.surface,
                "type": suggestion.type,
                "mtn_score": float(suggestion.mtn_score) if suggestion.mtn_score is not None else None,
                "user_feedback": suggestion.user_feedback,
                "created_at": _iso(suggestion.created_at),
            }
            for suggestion in suggestions
        ],
    }
