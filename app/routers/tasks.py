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
    project: Optional[str] = None
    delegated_to: Optional[str] = None
    goal_id: Optional[int] = None  # ← ADD THIS LINE

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
    today = date.today()

    # Date filters
    if filter_type == "due_today":
        # Only tasks due today or overdue
        query = query.filter(
            Task.due_date.isnot(None),
            Task.due_date <= today
        )
    elif filter_type == "next_7_days":
        # Tasks due in the next 7 days
        query = query.filter(
            Task.due_date.isnot(None),
            Task.due_date > today,
            Task.due_date <= today + timedelta(days=7)
        )

    # Project filter
    if project:
        query = query.filter(Task.project == project)

    # Delegate filter
    if delegated_to:
        query = query.filter(Task.delegated_to == delegated_to)

    tasks = query.all()

    # Helper function for safe date comparison
    def safe_date_key(task_date):
        if task_date is None:
            return date.max
        if isinstance(task_date, datetime):
            return task_date.date()
        return task_date

    # Sort: incomplete tasks first by priority and due date
    sorted_tasks = sorted(tasks, key=lambda t: (
        # All completed tasks go to bottom
        1 if t.status == "completed" else 0,
        # Then by priority (for incomplete tasks)
        PRIORITY_ORDER.get(t.priority or "Medium", 2),
        # Then by due date
        safe_date_key(t.due_date)
    ))

    return sorted_tasks


@router.get("/filters")
def get_filters(
        user_number: str,
        db: Session = Depends(get_db)
):
    """
    Get unique projects and delegates for filtering
    """
    tasks = db.query(Task).filter(Task.user_number == user_number).all()

    projects = list(set(t.project for t in tasks if t.project))
    delegates = list(set(t.delegated_to for t in tasks if t.delegated_to))

    return {
        "projects": sorted(projects),
        "delegates": sorted(delegates)
    }


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
        project=task.project,
        delegated_to=task.delegated_to,
        goal_id=task.goal_id,
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
    if updates.project is not None:
        task.project = updates.project
    if updates.delegated_to is not None:
        task.delegated_to = updates.delegated_to
    if updates.goal_id is not None:  # ← ADD THESE 2 LINES
        task.goal_id = updates.goal_id
        

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
