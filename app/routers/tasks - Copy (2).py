from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import Task
from pydantic import BaseModel
from datetime import datetime, date, timedelta
from typing import Optional
from pytz import timezone

router = APIRouter()

# Eastern Time timezone
EASTERN_TZ = timezone('America/New_York')


def get_today_et():
    """Get today's date in Eastern Time"""
    return datetime.now(EASTERN_TZ).date()


# Pydantic schemas for validation
class TaskCreate(BaseModel):
    title: str
    notes: Optional[str] = ""
    due_date: Optional[date] = None
    priority: str = "Medium"
    project: Optional[str] = None
    delegated_to: Optional[str] = None
    goal_id: Optional[int] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    notes: Optional[str] = None
    due_date: Optional[date] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    project: Optional[str] = None
    delegated_to: Optional[str] = None
    goal_id: Optional[int] = None


class TaskResponse(BaseModel):
    id: int
    user_number: str
    title: str
    notes: Optional[str]
    due_date: Optional[date]
    priority: Optional[str]
    status: str
    project: Optional[str]
    delegated_to: Optional[str]
    created_at: datetime
    updated_at: datetime
    goal_id: Optional[int]

    class Config:
        from_attributes = True


# Priority order for sorting
PRIORITY_ORDER = {"High": 1, "Medium": 2, "Low": 3}


@router.get("/", response_model=list[TaskResponse])
def get_tasks(
        user_number: str,
        filter_type: str = "all",
        project: Optional[str] = None,
        delegated_to: Optional[str] = None,
        db: Session = Depends(get_db)
):
    """
    Get all tasks with optional filtering
    filter_type: "all", "due_today", "next_7_days"
    project: filter by project name
    delegated_to: filter by delegate name
    """
    query = db.query(Task).filter(Task.user_number == user_number)
    today = get_today_et()  # ← CHANGED: Use Eastern Time instead of date.today()

    # Date filters
    if filter_type == "due_today":
        # Only tasks due today or overdue
        query = query.filter(
            Task.due_date.isnot(None),
            Task.due_date <= today
        )
    elif filter_type == "next_7_days":
        # Tasks due in the next 7 days
        next_week = today + timedelta(days=7)
        query = query.filter(
            Task.due_date.isnot(None),
            Task.due_date <= next_week
        )

    # Project filter
    if project:
        query = query.filter(Task.project == project)

    # Delegate filter
    if delegated_to:
        query = query.filter(Task.delegated_to == delegated_to)

    tasks = query.all()

    # Sort by: status (open first), then priority, then due date
    def sort_key(task):
        status_order = 0 if task.status == 'open' else 1
        priority_value = PRIORITY_ORDER.get(task.priority, 2)
        due_value = task.due_date if task.due_date else date(9999, 12, 31)
        return (status_order, priority_value, due_value)

    sorted_tasks = sorted(tasks, key=sort_key)
    return sorted_tasks


@router.get("/filters")
def get_filters(user_number: str, db: Session = Depends(get_db)):
    """
    Get unique project names and delegates for filtering
    Returns: {"projects": [...], "delegates": [...]}
    """
    tasks = db.query(Task).filter(Task.user_number == user_number).all()

    projects = sorted(set(t.project for t in tasks if t.project))
    delegates = sorted(set(t.delegated_to for t in tasks if t.delegated_to))

    return {
        "projects": projects,
        "delegates": delegates
    }


@router.post("/", response_model=TaskResponse)
def create_task(
        user_number: str,
        task: TaskCreate,
        db: Session = Depends(get_db)
):
    """
    Create a new task
    """
    new_task = Task(
        user_number=user_number,
        title=task.title,
        notes=task.notes,
        due_date=task.due_date,
        priority=task.priority.capitalize(),
        status="open",
        project=task.project,
        delegated_to=task.delegated_to,
        goal_id=task.goal_id,
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
        user_number: str,
        updates: TaskUpdate,
        db: Session = Depends(get_db)
):
    """
    Update an existing task
    Only provided fields will be updated
    """
    task = db.query(Task).filter(
        Task.id == task_id,
        Task.user_number == user_number
    ).first()

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Update only provided fields
    update_data = updates.model_dump(exclude_unset=True)

    # Capitalize priority if provided
    if 'priority' in update_data:
        update_data['priority'] = update_data['priority'].capitalize()

    for field, value in update_data.items():
        setattr(task, field, value)

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
    """
    Quick toggle between open and completed status
    """
    task = db.query(Task).filter(
        Task.id == task_id,
        Task.user_number == user_number
    ).first()

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Toggle status
    task.status = 'completed' if task.status == 'open' else 'open'
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
    """
    Delete a task
    """
    task = db.query(Task).filter(
        Task.id == task_id,
        Task.user_number == user_number
    ).first()

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    db.delete(task)
    db.commit()

    return {"success": True, "message": "Task deleted"}