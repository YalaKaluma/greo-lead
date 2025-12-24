from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import date, timedelta
from typing import List

from app.db import get_db
from app.models import Habit, HabitCompletion

router = APIRouter()

# ---------------------------------------------------------
# Helpers
# ---------------------------------------------------------

def compute_streak(habit: Habit) -> int:
    """
    Computes consecutive daily streak up to yesterday or today.
    """
    dates = sorted([c.date for c in habit.completions], reverse=True)
    if not dates:
        return 0

    streak = 0
    current_day = date.today()

    for d in dates:
        if d == current_day or d == current_day - timedelta(days=1):
            streak += 1
            current_day = d - timedelta(days=1)
        else:
            break

    return streak


# ---------------------------------------------------------
# Endpoints
# ---------------------------------------------------------

@router.get("")
def get_habits(user_number: str, db: Session = Depends(get_db)):
    habits = (
        db.query(Habit)
        .filter(Habit.user_number == user_number, Habit.is_active == True)
        .all()
    )

    today = date.today()
    response = []

    for h in habits:
        completed_today = any(c.date == today for c in h.completions)

        response.append({
            "id": h.id,
            "title": h.title,
            "completed_today": completed_today,
            "streak": compute_streak(h),
        })

    return response


@router.post("")
def create_habit(payload: dict, user_number: str, db: Session = Depends(get_db)):
    title = payload.get("title")
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")

    habit = Habit(
        user_number=user_number,
        title=title.strip()
    )
    db.add(habit)
    db.commit()
    db.refresh(habit)

    return habit


@router.put("/{habit_id}")
def update_habit(habit_id: int, payload: dict, user_number: str, db: Session = Depends(get_db)):
    habit = db.query(Habit).filter(
        Habit.id == habit_id,
        Habit.user_number == user_number
    ).first()

    if not habit:
        raise HTTPException(status_code=404, detail="Habit not found")

    habit.title = payload.get("title", habit.title)
    db.commit()
    return habit


@router.delete("/{habit_id}")
def delete_habit(habit_id: int, user_number: str, db: Session = Depends(get_db)):
    habit = db.query(Habit).filter(
        Habit.id == habit_id,
        Habit.user_number == user_number
    ).first()

    if not habit:
        raise HTTPException(status_code=404, detail="Habit not found")

    habit.is_active = False
    db.commit()
    return {"status": "deleted"}


@router.post("/{habit_id}/toggle_today")
def toggle_today(habit_id: int, user_number: str, db: Session = Depends(get_db)):
    habit = db.query(Habit).filter(
        Habit.id == habit_id,
        Habit.user_number == user_number
    ).first()

    if not habit:
        raise HTTPException(status_code=404, detail="Habit not found")

    today = date.today()

    existing = (
        db.query(HabitCompletion)
        .join(Habit)
        .filter(
            HabitCompletion.habit_id == habit_id,
            HabitCompletion.date == today,
            Habit.user_number == user_number
        )
        .first()
    )

    if existing:
        db.delete(existing)
    else:
        db.add(HabitCompletion(habit_id=habit_id, date=today))

    db.commit()
    return {"status": "ok"}
