from datetime import timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Habit, HabitCompletion, Meeting, MeetingActionItem, Message, Task, User
from app.services.home_dashboard_service import HomeDashboardService
from app.services.onboarding_seed_service import is_starter_journal_example
from app.services.timezone_service import get_user_timezone, today_for_timezone

router = APIRouter()


def _serialize_snapshot(snapshot):
    return {
        "id": snapshot.id,
        "user_number": snapshot.user_number,
        "snapshot_date": snapshot.snapshot_date.isoformat() if snapshot.snapshot_date else None,
        "source": snapshot.source,
        "created_at": snapshot.created_at.isoformat() if snapshot.created_at else None,
        "updated_at": snapshot.updated_at.isoformat() if snapshot.updated_at else None,
        "payload": snapshot.payload or {},
    }


@router.get("/dashboard")
def get_home_dashboard(user_number: str, db: Session = Depends(get_db)):
    snapshot = HomeDashboardService(db).get_or_refresh(user_number, force=False, source="on_demand")
    return _serialize_snapshot(snapshot)


@router.post("/dashboard/refresh")
def refresh_home_dashboard(user_number: str, db: Session = Depends(get_db)):
    snapshot = HomeDashboardService(db).refresh(user_number, source="manual")
    return _serialize_snapshot(snapshot)


@router.get("/sidebar-counts")
def get_sidebar_counts(user_number: str, db: Session = Depends(get_db)):
    """Return the user's actionable work remaining today."""
    user_timezone = get_user_timezone(db, user_number)
    today = today_for_timezone(user_timezone)

    task_count = db.query(func.count(Task.id)).filter(
        Task.user_number == user_number,
        Task.status == "open",
        Task.due_date.isnot(None),
        func.date(Task.due_date) <= today,
    ).scalar() or 0

    habit_query = db.query(func.count(Habit.id)).filter(
        Habit.user_number == user_number,
        Habit.is_active.is_(True),
        ~Habit.completions.any(and_(
            HabitCompletion.date == today,
            HabitCompletion.status == "done",
        )),
    )
    if today.weekday() >= 5:
        habit_query = habit_query.filter(Habit.frequency != "weekdays")
    habit_count = habit_query.scalar() or 0

    meeting_count = db.query(func.count(Meeting.id)).filter(
        Meeting.user_number == user_number,
        Meeting.processing_status == "ready",
        Meeting.action_items.any(and_(
            MeetingActionItem.created_task_id.is_(None),
            MeetingActionItem.ignored_at.is_(None),
        )),
    ).scalar() or 0

    generated_session_starts = {
        "start goal review session",
        "start people review session",
        "start leadership coaching session",
    }
    recent_journal_messages = db.query(Message).filter(
        Message.user_number == user_number,
        Message.sender == "user",
        Message.conversation_type == "journal",
    ).order_by(Message.timestamp.desc()).limit(500).all()
    latest_entry = next((
        message for message in recent_journal_messages
        if not is_starter_journal_example(message)
        and (message.content or "").strip().lower() not in generated_session_starts
    ), None)

    if latest_entry and latest_entry.timestamp:
        entry_time = latest_entry.timestamp
        if entry_time.tzinfo is None:
            entry_time = entry_time.replace(tzinfo=timezone.utc)
        last_entry_date = entry_time.astimezone(ZoneInfo(user_timezone)).date()
        journal_count = max((today - last_entry_date).days - 1, 0)
    else:
        user = db.query(User).filter(or_(
            User.phone_number == user_number,
            User.email == user_number,
        )).first()
        if user and user.created_at:
            created_at = user.created_at
            if created_at.tzinfo is None:
                created_at = created_at.replace(tzinfo=timezone.utc)
            first_journal_day = created_at.astimezone(ZoneInfo(user_timezone)).date()
            journal_count = max((today - first_journal_day).days, 0)
        else:
            journal_count = 0

    return {
        "tasks": task_count,
        "habits": habit_count,
        "meetings": meeting_count,
        "journal": journal_count,
        "date": today.isoformat(),
    }
