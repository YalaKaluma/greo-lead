from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import date, timedelta
from pydantic import BaseModel

from app.db import get_db
from app.models import DailyEnergyCheckin, Habit, HabitCompletion, JourneyGoal
from app.services.timezone_service import get_user_timezone, today_for_timezone
from app.services.habit_coaching_service import (
    get_latest_habit_coaching_review,
    refresh_habit_coaching_review,
)
from app.services.habits.habit_trend_service import get_habit_trends

router = APIRouter()


# ---------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------

class HabitCreate(BaseModel):
    title: str
    goal_id: int | None = None
    frequency: str = "daily"  # NEW: "daily" or "weekdays"


class EnergyCheckinRequest(BaseModel):
    user_number: str
    energy_level: int
    checkin_date: str | None = None
    source: str = "evening_nudge"
    message_id: int | None = None


class EnergyCheckinResponse(BaseModel):
    id: int
    user_number: str
    date: str
    energy_level: int
    source: str
    message_id: int | None = None


class HabitUpdate(BaseModel):
    title: str | None = None
    goal_id: int | None = None
    frequency: str | None = None  # NEW: can update frequency


class DayUpdate(BaseModel):
    date: str  # Format: "2026-01-10"
    status: str  # "pending", "done", or "not_done"


# ---------------------------------------------------------
# Helpers
# ---------------------------------------------------------

def calculate_streak(completions: list, frequency: str, today: date) -> int:
    """
    Calculate consecutive 'done' days, skipping weekends for weekday habits.
    Only counts days with status='done'.
    """
    if not completions:
        return 0

    # Filter only 'done' completions
    done_completions = [c for c in completions if c.status == 'done']
    if not done_completions:
        return 0

    # Sort by date descending
    dates = sorted([c.date for c in done_completions], reverse=True)

    streak = 0

    # Start from today or yesterday
    current_date = today if today in dates else (
        today - timedelta(days=1) if (today - timedelta(days=1)) in dates else None)

    if current_date is None:
        return 0

    # Count consecutive days
    while current_date in dates:
        streak += 1
        current_date -= timedelta(days=1)

        # Skip weekends for weekday-only habits
        if frequency == 'weekdays':
            while current_date.weekday() in [5, 6]:  # Saturday=5, Sunday=6
                current_date -= timedelta(days=1)

    return streak


# ---------------------------------------------------------
# Endpoints
# ---------------------------------------------------------

@router.get("")
def get_habits(user_number: str, db: Session = Depends(get_db)):
    """Get all active habits with today's status and streaks"""

    habits = (
        db.query(Habit)
        .filter(Habit.user_number == user_number, Habit.is_active == True)
        .all()
    )

    user_timezone = get_user_timezone(db, user_number)
    today = today_for_timezone(user_timezone)
    response = []

    for h in habits:
        # Get today's completion
        today_completion = next(
            (c for c in h.completions if c.date == today),
            None
        )

        # Today's status: 'pending', 'done', or 'not_done'
        today_status = today_completion.status if today_completion else 'pending'

        # Get goal text if linked
        goal_text = None
        if h.goal:
            goal_text = h.goal.title or h.goal.goal_text

        # Calculate streak
        streak = calculate_streak(h.completions, h.frequency, today)

        response.append({
            "id": h.id,
            "title": h.title,
            "goal_id": h.goal_id,
            "goal_text": goal_text,
            "frequency": h.frequency,  # NEW
            "today_status": today_status,  # NEW: replaces completed_today
            "streak": streak,
        })

    return response


@router.post("")
def create_habit(payload: HabitCreate, user_number: str, db: Session = Depends(get_db)):
    """Create a new habit"""

    if not payload.title:
        raise HTTPException(status_code=400, detail="Title is required")

    habit = Habit(
        user_number=user_number,
        title=payload.title.strip(),
        goal_id=payload.goal_id,
        frequency=payload.frequency  # NEW
    )

    db.add(habit)
    db.commit()
    db.refresh(habit)

    return {"id": habit.id, "message": "Habit created successfully"}


@router.put("/{habit_id}")
def update_habit(
        habit_id: int,
        payload: HabitUpdate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Update an existing habit"""

    habit = db.query(Habit).filter(
        Habit.id == habit_id,
        Habit.user_number == user_number
    ).first()

    if not habit:
        raise HTTPException(status_code=404, detail="Habit not found")

    # Update fields if provided
    if payload.title is not None:
        habit.title = payload.title
    if payload.goal_id is not None:
        habit.goal_id = payload.goal_id
    if payload.frequency is not None:  # NEW
        habit.frequency = payload.frequency

    db.commit()
    return {"message": "Habit updated successfully"}


@router.delete("/{habit_id}")
def delete_habit(habit_id: int, user_number: str, db: Session = Depends(get_db)):
    """Soft delete a habit (set is_active=False)"""

    habit = db.query(Habit).filter(
        Habit.id == habit_id,
        Habit.user_number == user_number
    ).first()

    if not habit:
        raise HTTPException(status_code=404, detail="Habit not found")

    habit.is_active = False
    db.commit()
    return {"status": "deleted"}


@router.post("/energy-checkin", response_model=EnergyCheckinResponse)
def save_energy_checkin(payload: EnergyCheckinRequest, db: Session = Depends(get_db)):
    """Save or update the user's daily energy level."""

    if payload.energy_level < 1 or payload.energy_level > 5:
        raise HTTPException(status_code=400, detail="Energy level must be between 1 and 5")

    if payload.checkin_date:
        try:
            checkin_date = date.fromisoformat(payload.checkin_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="checkin_date must use YYYY-MM-DD format")
    else:
        checkin_date = today_for_timezone(get_user_timezone(db, payload.user_number))
    checkin = db.query(DailyEnergyCheckin).filter(
        DailyEnergyCheckin.user_number == payload.user_number,
        DailyEnergyCheckin.date == checkin_date,
    ).first()

    if checkin:
        checkin.energy_level = payload.energy_level
        checkin.source = payload.source or "evening_nudge"
        checkin.message_id = payload.message_id
    else:
        checkin = DailyEnergyCheckin(
            user_number=payload.user_number,
            date=checkin_date,
            energy_level=payload.energy_level,
            source=payload.source or "evening_nudge",
            message_id=payload.message_id,
        )
        db.add(checkin)

    db.commit()
    db.refresh(checkin)
    return {
        "id": checkin.id,
        "user_number": checkin.user_number,
        "date": checkin.date.isoformat(),
        "energy_level": checkin.energy_level,
        "source": checkin.source,
        "message_id": checkin.message_id,
    }


@router.get("/trends")
def get_trends(user_number: str, db: Session = Depends(get_db)):
    """Get historical habit trends, scorecards, and coaching context."""

    trends = get_habit_trends(user_number, db, get_user_timezone(db, user_number))
    trends["latest_coaching_review"] = get_latest_habit_coaching_review(db, user_number)
    return trends


@router.get("/coaching/latest")
def get_latest_coaching_review(user_number: str, db: Session = Depends(get_db)):
    """Get the latest saved AI habit coaching review."""

    return {"review": get_latest_habit_coaching_review(db, user_number)}


@router.post("/coaching/refresh")
def refresh_coaching_review(user_number: str, db: Session = Depends(get_db)):
    """Generate and persist a fresh AI habit coaching review."""

    try:
        return {"review": refresh_habit_coaching_review(db, user_number)}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to refresh habit coaching: {exc}")


@router.post("/{habit_id}/toggle_today")
def toggle_today(habit_id: int, user_number: str, db: Session = Depends(get_db)):
    """
    Toggle today's status through 3 states:
    pending → done → not_done → pending
    """

    habit = db.query(Habit).filter(
        Habit.id == habit_id,
        Habit.user_number == user_number
    ).first()

    if not habit:
        raise HTTPException(status_code=404, detail="Habit not found")

    today = today_for_timezone(get_user_timezone(db, user_number))

    # Get or create today's completion
    existing = (
        db.query(HabitCompletion)
        .filter(
            HabitCompletion.habit_id == habit_id,
            HabitCompletion.date == today
        )
        .first()
    )

    if not existing:
        # Create new completion with 'done' status
        new_completion = HabitCompletion(
            habit_id=habit_id,
            date=today,
            status='done'
        )
        db.add(new_completion)
        db.commit()
        return {"status": "done"}

    # Cycle through states
    if existing.status == 'pending':
        existing.status = 'done'
    elif existing.status == 'done':
        existing.status = 'not_done'
    else:  # not_done
        existing.status = 'pending'

    db.commit()
    return {"status": existing.status}


@router.get("/{habit_id}/history")
def get_habit_history(
        habit_id: int,
        user_number: str,
        days: int = 14,  # Default to 2 weeks
        db: Session = Depends(get_db)
):
    """
    Get habit completion history for the last N days.
    Returns list of {date, status} objects.
    """

    # Verify habit belongs to user
    habit = db.query(Habit).filter(
        Habit.id == habit_id,
        Habit.user_number == user_number
    ).first()

    if not habit:
        raise HTTPException(status_code=404, detail="Habit not found")

    # Calculate date range
    end_date = today_for_timezone(get_user_timezone(db, user_number))
    start_date = end_date - timedelta(days=days - 1)

    # Get completions in range
    completions = (
        db.query(HabitCompletion)
        .filter(
            HabitCompletion.habit_id == habit_id,
            HabitCompletion.date >= start_date,
            HabitCompletion.date <= end_date
        )
        .all()
    )

    # Convert to list of dicts
    result = [
        {
            "date": str(c.date),
            "status": c.status
        }
        for c in completions
    ]

    return result


@router.post("/{habit_id}/update_day")
def update_day(
        habit_id: int,
        payload: DayUpdate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """
    Update status for a specific day.
    Allows editing history in the calendar view.
    """

    # Verify habit belongs to user
    habit = db.query(Habit).filter(
        Habit.id == habit_id,
        Habit.user_number == user_number
    ).first()

    if not habit:
        raise HTTPException(status_code=404, detail="Habit not found")

    # Parse date
    try:
        target_date = date.fromisoformat(payload.date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    # Validate status
    if payload.status not in ['pending', 'done', 'not_done']:
        raise HTTPException(
            status_code=400,
            detail="Invalid status. Must be 'pending', 'done', or 'not_done'"
        )

    # Get or create completion for this date
    completion = (
        db.query(HabitCompletion)
        .filter(
            HabitCompletion.habit_id == habit_id,
            HabitCompletion.date == target_date
        )
        .first()
    )

    if not completion:
        # Create new completion
        completion = HabitCompletion(
            habit_id=habit_id,
            date=target_date,
            status=payload.status
        )
        db.add(completion)
    else:
        # Update existing completion
        completion.status = payload.status

    db.commit()

    return {
        "message": "Day updated successfully",
        "date": str(target_date),
        "status": payload.status
    }
