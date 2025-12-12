from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import Task
from pydantic import BaseModel
from datetime import datetime, date, timedelta
from typing import Optional

router = APIRouter()


# Pydantic schemas for validation
class TaskCreate(BaseModel):
    title: str
    notes: Optional[str] = ""
    due_date: Optional[date] = None
    priority: str = "Medium"


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    notes: Optional[str] = None
    due_date: Optional[date] = None
    priority: Optional[str] = None
    status: Optional[str] = None


class TaskResponse(BaseModel):
    id: int
    user_number: str
    title: str
    notes: Optional[str]
    due_date: Optional[date]
    deadline: Optional[date]
    priority: Optional[str]
    status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Priority order for sorting
PRIORITY_ORDER = {"High": 1, "Medium": 2, "Low": 3}


@router.get("/", response_model=list[TaskResponse])
def get_tasks(
        user_number: str,
        filter_type: str = "all",
        db: Session = Depends(get_db)
):
    """
    Get all tasks with optional filtering
    filter_type: "all", "due_today", "next_7_days"
    """
    query = db.query(Task).filter(Task.user_number == user_number)
    today = date.today()

    if filter_type == "due_today":
        query = query.filter(Task.due_date <= today)
    elif filter_type == "next_7_days":
        query = query.filter(
            Task.due_date > today,
            Task.due_date <= today + timedelta(days=7)
        )

    tasks = query.all()

    # Sort: completed at bottom, then priority, then due date
    sorted_tasks = sorted(tasks, key=lambda t: (
        1 if t.status == "completed" else 0,
        PRIORITY_ORDER.get(t.priority or "Medium", 2),
        t.due_date or date.max
    ))

    return sorted_tasks


@router.post("/", response_model=TaskResponse)
def create_task(
        task: TaskCreate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Create a new task"""
    new_task = Task(
        user_number=user_number,
        title=task.title,
        notes=task.notes,
        due_date=task.due_date,
        priority=task.priority,
        status="open",
        created_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(new_task)
    db.commit()
    db.refresh(new_task)
    return new_task


@router.put("/{task_id}", response_model=TaskResponse)
def update_task(
        task_id: int,
        updates: TaskUpdate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Update an existing task"""
    task = db.query(Task).filter(
        Task.id == task_id,
        Task.user_number == user_number
    ).first()

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Update only provided fields
    if updates.title is not None:
        task.title = updates.title
    if updates.notes is not None:
        task.notes = updates.notes
    if updates.due_date is not None:
        task.due_date = updates.due_date
    if updates.priority is not None:
        task.priority = updates.priority
    if updates.status is not None:
        task.status = updates.status

    task.updated_at = datetime.now()
    db.commit()
    db.refresh(task)
    return task


@router.patch("/{task_id}/toggle", response_model=TaskResponse)
def toggle_task(
        task_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Quick toggle between open/completed"""
    task = db.query(Task).filter(
        Task.id == task_id,
        Task.user_number == user_number
    ).first()

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    task.status = "completed" if task.status == "open" else "open"
    task.updated_at = datetime.now()
    db.commit()
    db.refresh(task)
    return task


@router.delete("/{task_id}")
def delete_task(
        task_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Delete a task"""
    task = db.query(Task).filter(
        Task.id == task_id,
        Task.user_number == user_number
    ).first()

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    db.delete(task)
    db.commit()
    return {"success": True, "message": "Task deleted"}