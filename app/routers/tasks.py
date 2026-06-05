from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import Task
from pydantic import BaseModel
from datetime import datetime, date, timedelta
from typing import Optional, List
from app.services.task_enrichment_service import enrich_task
from app.services.timezone_service import get_user_timezone, today_for_timezone
from app.services.task_mtn_trend_service import get_task_mtn_trends

router = APIRouter()


# Pydantic schemas for validation
class TaskCreate(BaseModel):
    title: str
    notes: Optional[str] = ""
    due_date: Optional[date] = None
    priority: str = "Medium"
    project: Optional[str] = None
    delegated_to: Optional[str] = None
    goal_id: Optional[int] = None
    strategic_intent: Optional[str] = None
    move_the_needle_score: Optional[float] = None
    estimated_effort: Optional[str] = None
    suggested_subtasks: Optional[list] = None
    alfred_help: Optional[list] = None
    enhanced_title: Optional[str] = None
    ai_enriched: Optional[bool] = False

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    notes: Optional[str] = None
    due_date: Optional[date] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    project: Optional[str] = None
    delegated_to: Optional[str] = None
    goal_id: Optional[int] = None
    strategic_intent: Optional[str] = None
    move_the_needle_score: Optional[float] = None
    estimated_effort: Optional[str] = None

    suggested_subtasks: Optional[list] = None
    alfred_help: Optional[list] = None

    enhanced_title: Optional[str] = None
    ai_enriched: Optional[bool] = False


class TaskResponse(BaseModel):
    id: int
    user_number: str
    title: str
    notes: Optional[str]
    due_date: Optional[datetime]  # ← FIXED: Changed from date to datetime to match database column
    priority: Optional[str]
    status: str
    project: Optional[str]
    delegated_to: Optional[str]
    created_at: datetime
    updated_at: datetime
    goal_id: Optional[int]
    strategic_intent: Optional[str] = None
    move_the_needle_score: Optional[float] = None
    estimated_effort: Optional[str] = None
    suggested_subtasks: Optional[list] = None
    alfred_help: Optional[list] = None
    enhanced_title: Optional[str] = None
    ai_enriched: Optional[bool] = False
    sort_order: Optional[int] = None
    in_top10: Optional[bool] = False
    top10_position: Optional[int] = None
    last_prioritized_at: Optional[datetime] = None
    mtn_score_today: Optional[float] = None
    mtn_rank_today: Optional[int] = None
    mtn_recommended_today: Optional[bool] = False
    mtn_reason_today: Optional[str] = None
    mtn_risk_today: Optional[str] = None
    mtn_recommendation_id: Optional[int] = None
    mtn_prioritized_at: Optional[str] = None



    class Config:
        from_attributes = True


class TaskReorderRequest(BaseModel):
    user_number: str
    ordered_task_ids: List[int]


class BulkDeferNonTop10Request(BaseModel):
    task_ids_to_keep_today: List[int]
    task_ids_to_move: List[int]
    target_date: date


# Priority order for sorting
PRIORITY_ORDER = {"High": 1, "Medium": 2, "Low": 3}


def attach_today_mtn_metadata(db: Session, user_number: str, tasks: List[Task]) -> None:
    """Add today's stored MTN rank/score to task response objects."""
    try:
        from app.services.priority_service import PriorityService

        priority_service = PriorityService(db)
        latest = priority_service.serialize_recommendation(
            priority_service.get_latest_recommendation_for_today(user_number)
        )
        if not latest:
            return

        by_task_id = {item["task_id"]: item for item in latest.get("all_scored_tasks", [])}
        for task in tasks:
            score = by_task_id.get(task.id)
            if not score:
                continue

            task.mtn_score_today = score.get("score")
            task.mtn_rank_today = score.get("rank")
            task.mtn_recommended_today = bool(score.get("is_top_mtn"))
            task.mtn_reason_today = score.get("reason")
            task.mtn_risk_today = score.get("risk_if_ignored")
            task.mtn_recommendation_id = latest.get("recommendation_id")
            task.mtn_prioritized_at = latest.get("prioritized_at")
    except Exception as exc:
        print(f"[TASKS API] Failed to attach MTN metadata: {exc}")


@router.get("", response_model=list[TaskResponse])
@router.get("/", response_model=list[TaskResponse])
def get_tasks(
        user_number: str,
        filter_type: str = "all",
        project: Optional[str] = None,
        delegated_to: Optional[str] = None,
        goal_id: Optional[int] = None,
        db: Session = Depends(get_db)
):
    """
    Get all tasks with optional filtering
    filter_type: "all", "due_today", "due_tomorrow", "next_7_days"
    project: filter by project name
    delegated_to: filter by delegate name
    goal_id: filter by goal ID
    """
    try:
        print(f"[TASKS API] Fetching tasks for user: {user_number}")
        print(
            f"[TASKS API] Filters - type: {filter_type}, project: {project}, delegate: {delegated_to}, goal_id: {goal_id}")

        query = db.query(Task).filter(Task.user_number == user_number)
        user_timezone = get_user_timezone(db, user_number)
        today = today_for_timezone(user_timezone)

        due_date_day = func.date(Task.due_date)

        # Date filters. due_date is a DateTime column, but the UI treats due
        # dates as calendar days. Compare the date portion so tasks due later
        # today are not excluded by a midnight timestamp boundary.
        if filter_type == "due_today":
            print(f"[TASKS API] Applying due_today filter (today: {today}, timezone: {user_timezone})")
            query = query.filter(
                Task.due_date.isnot(None),
                due_date_day <= today
            )
        elif filter_type == "due_tomorrow":
            tomorrow = today + timedelta(days=1)
            print(f"[TASKS API] Applying due_tomorrow filter (tomorrow: {tomorrow}, timezone: {user_timezone})")
            query = query.filter(
                Task.due_date.isnot(None),
                due_date_day == tomorrow
            )
        elif filter_type == "next_7_days":
            next_week = today + timedelta(days=7)
            print(f"[TASKS API] Applying next_7_days filter (today: {today}, next_week: {next_week}, timezone: {user_timezone})")
            query = query.filter(
                Task.due_date.isnot(None),
                due_date_day <= next_week
            )
        else:
            print(f"[TASKS API] No date filter (showing all tasks)")

        # Project filter
        if project:
            print(f"[TASKS API] Filtering by project: {project}")
            query = query.filter(Task.project == project)

        # Delegate filter
        if delegated_to:
            print(f"[TASKS API] Filtering by delegate: {delegated_to}")
            query = query.filter(Task.delegated_to == delegated_to)

        # Goal filter
        if goal_id is not None:
            print(f"[TASKS API] Filtering by goal_id: {goal_id}")
            query = query.filter(Task.goal_id == goal_id)

        tasks = query.all()
        print(f"[TASKS API] Found {len(tasks)} tasks before sorting")

        # Sort by: manual order if present, then status, priority, and due date.
        # getattr keeps this endpoint alive during deployments where the DB
        # migration has run before the ORM model reloads, or vice versa.
        def sort_key(task):
            sort_order = getattr(task, "sort_order", None)
            manual_order_missing = 1 if sort_order is None else 0
            manual_order_value = sort_order if sort_order is not None else 999999
            status_order = 0 if task.status == 'open' else 1
            priority_value = PRIORITY_ORDER.get(task.priority, 2)
            # Handle both DateTime and Date objects. datetime is a date subclass,
            # so check datetime first to avoid mixed date/datetime comparisons.
            if task.due_date:
                due_value = task.due_date.date() if isinstance(task.due_date, datetime) else task.due_date
            else:
                due_value = date(9999, 12, 31)
            return (manual_order_missing, manual_order_value, status_order, priority_value, due_value)

        sorted_tasks = sorted(tasks, key=sort_key)
        attach_today_mtn_metadata(db, user_number, sorted_tasks)
        print(f"[TASKS API] Successfully returning {len(sorted_tasks)} sorted tasks")
        return sorted_tasks

    except Exception as e:
        print(f"[TASKS API ERROR] Exception occurred: {type(e).__name__}: {str(e)}")
        import traceback
        print(f"[TASKS API ERROR] Traceback:\n{traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching tasks: {str(e)}"
        )


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


@router.get("/mtn-trends")
def get_mtn_trends(user_number: str, db: Session = Depends(get_db)):
    """Get completed-task MTN score totals for the last 90 days."""

    return get_task_mtn_trends(user_number, db, get_user_timezone(db, user_number))


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


@router.post("/reorder")
def reorder_tasks(
        request: TaskReorderRequest,
        db: Session = Depends(get_db)
):
    """
    Persist the user's current task order.
    """
    tasks = db.query(Task).filter(
        Task.user_number == request.user_number,
        Task.id.in_(request.ordered_task_ids)
    ).all()

    found_task_ids = {task.id for task in tasks}
    missing_task_ids = [task_id for task_id in request.ordered_task_ids if task_id not in found_task_ids]
    if missing_task_ids:
        raise HTTPException(status_code=404, detail=f"Task(s) not found: {missing_task_ids}")

    order_by_id = {task_id: index for index, task_id in enumerate(request.ordered_task_ids)}
    for task in tasks:
        if not hasattr(task, "sort_order"):
            raise HTTPException(
                status_code=500,
                detail="Task ordering is not available on this deployment yet. Redeploy the backend after updating models.py."
            )
        task.sort_order = order_by_id[task.id]
        task.updated_at = datetime.now()

    db.commit()

    return {"success": True, "updated": len(tasks)}


@router.post("/reorder/reset")
def reset_task_order(
        user_number: str,
        db: Session = Depends(get_db)
):
    """
    Clear persisted manual ordering for a user.
    """
    if not hasattr(Task, "sort_order"):
        raise HTTPException(
            status_code=500,
            detail="Task ordering is not available on this deployment yet. Redeploy the backend after updating models.py."
        )

    updated = db.query(Task).filter(Task.user_number == user_number).update({
        "sort_order": None,
        "updated_at": datetime.now()
    })
    db.commit()

    return {"success": True, "updated": updated}


@router.post("/bulk-defer-non-top-10")
def bulk_defer_non_top_10(
        user_number: str,
        request: BulkDeferNonTop10Request,
        db: Session = Depends(get_db)
):
    """
    Move the provided non-Top-10 task IDs to a target date.

    The frontend owns the current visible order for this action, so this
    endpoint only validates ownership and applies the requested date update.
    """
    requested_ids = set(request.task_ids_to_keep_today + request.task_ids_to_move)
    if not requested_ids:
        return {"success": True, "updated": 0}

    tasks = db.query(Task).filter(
        Task.user_number == user_number,
        Task.id.in_(requested_ids)
    ).all()

    found_task_ids = {task.id for task in tasks}
    missing_task_ids = sorted(requested_ids - found_task_ids)
    if missing_task_ids:
        raise HTTPException(status_code=404, detail=f"Task(s) not found: {missing_task_ids}")

    move_ids = set(request.task_ids_to_move)
    updated = 0
    for task in tasks:
        if task.id in move_ids:
            task.due_date = request.target_date
            task.updated_at = datetime.now()
            updated += 1

    db.commit()

    return {
        "success": True,
        "updated": updated,
        "kept_today": len(request.task_ids_to_keep_today),
        "target_date": request.target_date.isoformat()
    }


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

@router.post("/enrich")
async def enrich_task_endpoint(request: dict):

    result = await enrich_task(request)

    return result

