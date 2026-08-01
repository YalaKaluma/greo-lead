from fastapi import APIRouter, Depends
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Habit, HabitCompletion, Meeting, MeetingActionItem, Task
from app.services.home_dashboard_service import HomeDashboardService
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
    today = today_for_timezone(get_user_timezone(db, user_number))

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

    return {
        "tasks": task_count,
        "habits": habit_count,
        "meetings": meeting_count,
        "date": today.isoformat(),
    }
