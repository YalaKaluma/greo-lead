from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
import calendar
from app.db import get_db
from app.models import JourneyGoal, Task, User
from pydantic import BaseModel
from datetime import datetime, date, timedelta
from typing import Optional, List, Union
from app.services.task_enrichment_service import enrich_task
from app.services.timezone_service import get_user_timezone, today_for_timezone
from app.services.task_mtn_trend_service import get_task_mtn_trends
from app.services.onboarding_seed_service import ensure_starter_tasks_visible_today
from app.services.audit_log_service import user_id_for_identifier, write_audit_log

router = APIRouter()


def _ensure_onboarding_tasks_link_to_vision(db: Session, user_number: str) -> int:
    user = db.query(User).filter((User.phone_number == user_number) | (User.email == user_number)).first()
    if not user or not user.phone_number:
        return 0

    onboarding_data = dict(user.onboarding_data or {})
    if onboarding_data.get("onboarding_tasks_linked_to_vision_at"):
        return 0

    result = onboarding_data.get("result") or {}
    vision_id = result.get("vision_id")
    task_ids = [task_id for task_id in (result.get("task_ids") or []) if task_id]
    if not vision_id or not task_ids:
        return 0

    tasks = db.query(Task).filter(
        Task.user_number == user.phone_number,
        Task.id.in_(task_ids),
    ).all()

    repaired_count = 0
    now = datetime.utcnow()
    for task in tasks:
        if task.goal_id == vision_id:
            continue
        task.goal_id = vision_id
        task.updated_at = now
        repaired_count += 1

    onboarding_data["onboarding_tasks_linked_to_vision_at"] = now.isoformat()
    user.onboarding_data = onboarding_data
    return repaired_count


# Pydantic schemas for validation
class TaskCreate(BaseModel):
    title: str
    notes: Optional[str] = ""
    due_date: Optional[date] = None
    scheduled_date: Optional[date] = None
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
    is_recurring: bool = False
    recurrence_type: Optional[str] = None
    recurrence_interval: Optional[int] = 1
    recurrence_day_of_week: Optional[str] = None
    recurrence_day_of_month: Optional[int] = None
    recurrence_end_date: Optional[date] = None
    recurrence_update_scope: Optional[str] = None

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    notes: Optional[str] = None
    due_date: Optional[Union[datetime, date]] = None
    scheduled_date: Optional[date] = None
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
    is_recurring: Optional[bool] = None
    recurrence_type: Optional[str] = None
    recurrence_interval: Optional[int] = None
    recurrence_day_of_week: Optional[str] = None
    recurrence_day_of_month: Optional[int] = None
    recurrence_end_date: Optional[date] = None


class TaskResponse(BaseModel):
    id: int
    user_number: str
    title: str
    notes: Optional[str]
    due_date: Optional[datetime]  # ← FIXED: Changed from date to datetime to match database column
    scheduled_date: Optional[date] = None
    priority: Optional[str]
    status: str
    project: Optional[str]
    delegated_to: Optional[str]
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None
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
    times_postponed: Optional[int] = 0
    top10_position: Optional[int] = None
    last_prioritized_at: Optional[datetime] = None
    mtn_score_today: Optional[float] = None
    mtn_rank_today: Optional[int] = None
    mtn_recommended_today: Optional[bool] = False
    mtn_reason_today: Optional[str] = None
    mtn_risk_today: Optional[str] = None
    mtn_recommendation_id: Optional[int] = None
    mtn_prioritized_at: Optional[str] = None
    is_recurring: Optional[bool] = False
    recurrence_type: Optional[str] = None
    recurrence_interval: Optional[int] = None
    recurrence_day_of_week: Optional[str] = None
    recurrence_day_of_month: Optional[int] = None
    recurrence_end_date: Optional[date] = None
    recurrence_parent_id: Optional[int] = None
    recurrence_created_from_id: Optional[int] = None



    class Config:
        from_attributes = True


class TaskReorderRequest(BaseModel):
    user_number: str
    ordered_task_ids: List[int]


class BulkDeferNonTop10Request(BaseModel):
    task_ids_to_keep_today: List[int]
    task_ids_to_move: List[int]
    target_date: date


class TaskFollowUpRequest(BaseModel):
    follow_up_date: date


class TaskFollowUpResponse(BaseModel):
    original_task: TaskResponse
    follow_up_task: TaskResponse


# Priority order for sorting
PRIORITY_ORDER = {"High": 1, "Medium": 2, "Low": 3}
WEEKDAY_BY_NAME = {
    "monday": 0,
    "tuesday": 1,
    "wednesday": 2,
    "thursday": 3,
    "friday": 4,
    "saturday": 5,
    "sunday": 6,
}


def _as_date(value) -> Optional[date]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value.date()
    return value


def _is_due_date_postponed(previous_due_date, next_due_date) -> bool:
    previous_day = _as_date(previous_due_date)
    next_day = _as_date(next_due_date)
    return bool(previous_day and next_day and next_day > previous_day)


def _add_months_clamped(start: date, months: int, day_of_month: int) -> date:
    month_index = start.month - 1 + months
    year = start.year + month_index // 12
    month = month_index % 12 + 1
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(day_of_month, last_day))


def calculate_next_due_date(task: Task, completed_at: datetime) -> Optional[date]:
    completed_day = completed_at.date()
    recurrence_type = (task.recurrence_type or "").strip().lower()
    interval = max(int(task.recurrence_interval or 1), 1)
    due_day = _as_date(task.due_date)

    if recurrence_type in {"daily", "interval_days", "custom"}:
        step_days = interval if recurrence_type != "daily" else 1
        candidate = due_day or completed_day
        while candidate <= completed_day:
            candidate = candidate + timedelta(days=step_days)
        return candidate

    if recurrence_type == "weekly":
        weekday_name = (task.recurrence_day_of_week or "").strip().lower()
        target_weekday = WEEKDAY_BY_NAME.get(weekday_name)
        if target_weekday is None:
            target_weekday = due_day.weekday() if due_day else completed_day.weekday()

        if due_day:
            days_to_target = (target_weekday - due_day.weekday()) % 7
            candidate = due_day + timedelta(days=days_to_target)
            while candidate <= completed_day:
                candidate = candidate + timedelta(weeks=interval)
            return candidate

        days_ahead = (target_weekday - completed_day.weekday()) % 7
        if days_ahead == 0:
            days_ahead = 7 * interval
        return completed_day + timedelta(days=days_ahead)

    if recurrence_type == "monthly":
        day_of_month = task.recurrence_day_of_month or (due_day.day if due_day else completed_day.day)
        day_of_month = max(1, min(int(day_of_month), 31))
        anchor = due_day or completed_day.replace(day=1)
        candidate = _add_months_clamped(anchor.replace(day=1), 0, day_of_month)
        while candidate <= completed_day:
            candidate = _add_months_clamped(candidate.replace(day=1), interval, day_of_month)
        return candidate

    return None


def create_new_task_from_recurring_template(task: Task, next_due_date: date, db: Session) -> Optional[Task]:
    existing = db.query(Task).filter(Task.recurrence_created_from_id == task.id).first()
    if existing:
        return existing

    parent_id = task.recurrence_parent_id or task.id
    template = db.query(Task).filter(Task.id == parent_id).first() or task
    new_task = Task(
        user_number=task.user_number,
        title=template.title,
        notes=template.notes,
        project=template.project,
        delegated_to=template.delegated_to,
        due_date=next_due_date,
        status="open",
        priority=template.priority,
        goal_id=template.goal_id,
        strategic_intent=template.strategic_intent,
        move_the_needle_score=template.move_the_needle_score,
        estimated_effort=template.estimated_effort,
        suggested_subtasks=template.suggested_subtasks,
        alfred_help=template.alfred_help,
        enhanced_title=template.enhanced_title,
        ai_enriched=template.ai_enriched,
        originating_opportunity_id=template.originating_opportunity_id,
        is_recurring=True,
        recurrence_type=template.recurrence_type,
        recurrence_interval=template.recurrence_interval,
        recurrence_day_of_week=template.recurrence_day_of_week,
        recurrence_day_of_month=template.recurrence_day_of_month,
        recurrence_end_date=template.recurrence_end_date,
        recurrence_parent_id=parent_id,
        recurrence_created_from_id=task.id,
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )
    db.add(new_task)
    return new_task


def validate_user_goal_link(db: Session, user_number: str, goal_id: Optional[int]) -> None:
    if goal_id is None:
        return
    exists = db.query(JourneyGoal.id).filter(
        JourneyGoal.id == goal_id,
        JourneyGoal.user_number == user_number,
    ).first()
    if not exists:
        raise HTTPException(status_code=404, detail="Goal not found")


def attach_today_mtn_metadata(db: Session, user_number: str, tasks: List[Task]) -> None:
    """Add today's stored MTN rank/score to task response objects."""
    try:
        from app.models import TaskPriorityRecommendation
        from app.services.priority_service import PriorityService

        priority_service = PriorityService(db)
        latest_scores = priority_service.get_latest_scores_for_today(user_number)
        if not latest_scores:
            return

        ranked_scores = sorted(
            latest_scores.values(),
            key=lambda item: float(item.top10_likelihood or 0),
            reverse=True
        )
        rank_by_task_id = {score.task_id: index + 1 for index, score in enumerate(ranked_scores)}
        context_ids = list({score.context_id for score in latest_scores.values() if score.context_id})
        recommendation_by_context_id = {}
        if context_ids:
            recommendations = db.query(TaskPriorityRecommendation).filter(
                TaskPriorityRecommendation.context_id.in_(context_ids)
            ).order_by(TaskPriorityRecommendation.generated_at.desc()).all()
            for recommendation in recommendations:
                recommendation_by_context_id.setdefault(recommendation.context_id, recommendation.id)

        for task in tasks:
            score = latest_scores.get(task.id)
            if not score:
                continue

            task.mtn_score_today = float(score.top10_likelihood)
            task.mtn_rank_today = rank_by_task_id.get(task.id)
            task.mtn_recommended_today = bool(task.mtn_rank_today and task.mtn_rank_today <= 3)
            task.mtn_reason_today = score.primary_reason
            task.mtn_risk_today = score.risk_if_ignored
            task.mtn_recommendation_id = recommendation_by_context_id.get(score.context_id)
            task.mtn_prioritized_at = score.scored_at.isoformat() if score.scored_at else None
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
        repaired_count = ensure_starter_tasks_visible_today(db, user_number)
        if repaired_count:
            db.commit()
            print(f"[TASKS API] Repaired {repaired_count} starter task due dates for default visibility")
        relinked_count = _ensure_onboarding_tasks_link_to_vision(db, user_number)
        if relinked_count:
            db.commit()
            print(f"[TASKS API] Linked {relinked_count} onboarding tasks to the generated vision")

        query = db.query(Task).filter(
            Task.user_number == user_number,
            Task.status == "open",
        )
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
    validate_user_goal_link(db, user_number, task.goal_id)
    if task.scheduled_date and task.due_date and task.scheduled_date > task.due_date:
        raise HTTPException(
            status_code=400,
            detail="The scheduled date cannot be after the task's due date.",
        )
    new_task = Task(
        user_number=user_number,
        title=task.title,
        notes=task.notes,
        scheduled_date=task.scheduled_date,
        due_date=task.due_date,
        priority=task.priority.capitalize(),
        status="open",
        project=task.project,
        delegated_to=task.delegated_to,
        goal_id=task.goal_id,
        strategic_intent=task.strategic_intent,
        move_the_needle_score=task.move_the_needle_score,
        estimated_effort=task.estimated_effort,
        suggested_subtasks=task.suggested_subtasks,
        alfred_help=task.alfred_help,
        enhanced_title=task.enhanced_title,
        ai_enriched=task.ai_enriched,
        is_recurring=task.is_recurring,
        recurrence_type=task.recurrence_type if task.is_recurring else None,
        recurrence_interval=task.recurrence_interval if task.is_recurring else None,
        recurrence_day_of_week=task.recurrence_day_of_week if task.is_recurring else None,
        recurrence_day_of_month=task.recurrence_day_of_month if task.is_recurring else None,
        recurrence_end_date=task.recurrence_end_date if task.is_recurring else None,
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
    recurrence_update_scope = update_data.pop("recurrence_update_scope", None)
    previous_schedule = task.scheduled_date or task.due_date
    should_increment_postponed = (
        (
            "scheduled_date" in update_data
            and _is_due_date_postponed(previous_schedule, update_data.get("scheduled_date"))
        )
        or (
            "scheduled_date" not in update_data
            and "due_date" in update_data
            and task.scheduled_date is None
            and _is_due_date_postponed(task.due_date, update_data.get("due_date"))
        )
    )

    # Capitalize priority if provided
    if 'priority' in update_data:
        update_data['priority'] = update_data['priority'].capitalize()

    if "goal_id" in update_data:
        validate_user_goal_link(db, user_number, update_data.get("goal_id"))

    next_scheduled_date = _as_date(update_data.get("scheduled_date", task.scheduled_date))
    next_due_date = _as_date(update_data.get("due_date", task.due_date))
    if next_scheduled_date and next_due_date and next_scheduled_date > next_due_date:
        raise HTTPException(
            status_code=400,
            detail="The scheduled date cannot be after the task's due date.",
        )

    previous_status = task.status
    now = datetime.now()

    for field, value in update_data.items():
        setattr(task, field, value)

    if "status" in update_data:
        new_status = (task.status or "").lower()
        old_status = (previous_status or "").lower()
        if new_status == "completed" and old_status != "completed":
            task.completed_at = now
        elif new_status != "completed" and old_status == "completed":
            task.completed_at = None
        elif new_status == "completed" and task.completed_at is None:
            task.completed_at = now

    if should_increment_postponed:
        task.times_postponed = (task.times_postponed or 0) + 1

    if "is_recurring" in update_data and not update_data["is_recurring"]:
        task.recurrence_type = None
        task.recurrence_interval = None
        task.recurrence_day_of_week = None
        task.recurrence_day_of_month = None
        task.recurrence_end_date = None

    if recurrence_update_scope == "future" and task.recurrence_parent_id:
        parent_task = db.query(Task).filter(
            Task.id == task.recurrence_parent_id,
            Task.user_number == user_number,
        ).first()
        if parent_task:
            for field, value in update_data.items():
                setattr(parent_task, field, value)
            parent_task.updated_at = now

    task.updated_at = now

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

    updated = db.query(Task).filter(
        Task.user_number == user_number,
        Task.status == "open",
    ).update({"sort_order": None})
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
            if _is_due_date_postponed(task.due_date, request.target_date):
                task.times_postponed = (task.times_postponed or 0) + 1
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


@router.post("/{task_id}/follow-up", response_model=TaskFollowUpResponse)
def create_follow_up_task(
        task_id: int,
        user_number: str,
        request: TaskFollowUpRequest,
        db: Session = Depends(get_db)
):
    """
    Create a follow-up task and complete the original task in one transaction.
    """
    task = db.query(Task).filter(
        Task.id == task_id,
        Task.user_number == user_number
    ).first()

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    try:
        now = datetime.now()
        follow_up_task = Task(
            user_number=task.user_number,
            title=f"Follow up: {task.title}",
            notes=task.notes,
            project=task.project,
            delegated_to=task.delegated_to,
            due_date=request.follow_up_date,
            status="open",
            priority=task.priority,
            goal_id=task.goal_id,
            strategic_intent=task.strategic_intent,
            move_the_needle_score=task.move_the_needle_score,
            estimated_effort=task.estimated_effort,
            suggested_subtasks=task.suggested_subtasks,
            alfred_help=task.alfred_help,
            enhanced_title=task.enhanced_title,
            ai_enriched=task.ai_enriched,
            originating_opportunity_id=task.originating_opportunity_id,
            is_recurring=False,
            created_at=now,
            updated_at=now,
        )

        db.add(follow_up_task)
        task.status = "completed"
        task.completed_at = now
        task.updated_at = now

        db.commit()
        db.refresh(task)
        db.refresh(follow_up_task)

        return {
            "original_task": task,
            "follow_up_task": follow_up_task,
        }
    except Exception as exc:
        db.rollback()
        print(f"[TASKS API] Failed to create follow-up task: {exc}")
        raise HTTPException(
            status_code=500,
            detail="Unable to create follow-up task. Please try again."
        )


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

    if task.is_recurring and task.status == "completed":
        return task

    was_open = task.status == "open"
    now = datetime.now()
    task.status = 'completed' if was_open else 'open'
    task.updated_at = now
    task.completed_at = now if was_open else None

    if was_open and task.is_recurring:
        next_due_date = calculate_next_due_date(task, task.completed_at)
        if next_due_date and (
            not task.recurrence_end_date or next_due_date <= task.recurrence_end_date
        ):
            create_new_task_from_recurring_template(task, next_due_date, db)

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
    write_audit_log(
        db,
        user_id=user_id_for_identifier(db, user_number),
        event_type="task_deleted",
        object_type="task",
        object_id=task_id,
        metadata={"task_id": task_id, "status": "deleted"},
    )

    return {"success": True, "message": "Task deleted"}

@router.post("/enrich")
async def enrich_task_endpoint(request: dict):

    result = await enrich_task(request)

    return result

