from __future__ import annotations

from datetime import date, datetime, timedelta
from statistics import mean
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.models import Task, TaskPriorityScore
from app.services.timezone_service import DEFAULT_TIMEZONE, normalize_timezone, today_for_timezone


COMPLETED_STATUS = "completed"


def _date_range(start_date: date, end_date: date) -> list[date]:
    days = (end_date - start_date).days
    return [start_date + timedelta(days=offset) for offset in range(days + 1)]


def _iso(day: date) -> str:
    return day.isoformat()


def _task_completed_day(task: Task, timezone_name: str) -> date | None:
    completed_at = task.updated_at
    if not completed_at:
        return None

    timezone = ZoneInfo(normalize_timezone(timezone_name))
    if completed_at.tzinfo is not None:
        return completed_at.astimezone(timezone).date()

    return completed_at.replace(tzinfo=ZoneInfo("UTC")).astimezone(timezone).date()


def _local_completed_at_iso(task: Task, timezone_name: str) -> str | None:
    completed_at = task.updated_at
    if not completed_at:
        return None

    timezone = ZoneInfo(normalize_timezone(timezone_name))
    if completed_at.tzinfo is None:
        completed_at = completed_at.replace(tzinfo=ZoneInfo("UTC"))

    return completed_at.astimezone(timezone).isoformat()


def _as_naive_utc(value: datetime | None) -> datetime | None:
    if not value:
        return None
    if value.tzinfo is not None:
        return value.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
    return value


def _normalize_mtn_score(raw_score: Any) -> float:
    if raw_score is None:
        return 0.0

    score = float(raw_score)
    if score <= 1:
        score *= 10
    return max(0.0, min(10.0, score))


def _task_mtn_score(
    task: Task,
    completed_at: datetime | None,
    score_lookup: dict[int, list[TaskPriorityScore]],
) -> float:
    completed_at = _as_naive_utc(completed_at)
    for score in score_lookup.get(task.id, []):
        scored_at = _as_naive_utc(score.scored_at)
        if not completed_at or not scored_at or scored_at <= completed_at:
            return _normalize_mtn_score(score.top10_likelihood)

    raw_score = task.move_the_needle_score
    return _normalize_mtn_score(raw_score)


def _period_stats(trend_chart: list[dict[str, Any]], days: int) -> dict[str, Any]:
    window = trend_chart[-days:]
    total_score = round(sum(item["mtn_score"] for item in window), 2)
    completed_tasks = sum(item["completed_tasks"] for item in window)
    active_days = len([item for item in window if item["mtn_score"] > 0])

    return {
        "days": days,
        "total_score": total_score,
        "average_score": round(total_score / days, 2) if days else 0,
        "completed_tasks": completed_tasks,
        "active_days": active_days,
    }


def _trend_label(delta: float) -> str:
    if delta >= 1:
        return "Improving"
    if delta <= -1:
        return "Declining"
    return "Stable"


def _rank_procrastinated_tasks(tasks: list[Task], limit: int = 3) -> list[Task]:
    return sorted(
        tasks,
        key=lambda task: (
            task.times_postponed or 0,
            _normalize_mtn_score(task.move_the_needle_score),
            task.updated_at or datetime.min,
        ),
        reverse=True,
    )[:limit]


def get_task_mtn_trends(
    user_number: str,
    db: Session,
    timezone_name: str = DEFAULT_TIMEZONE,
) -> dict[str, Any]:
    end_date = today_for_timezone(timezone_name)
    start_date = end_date - timedelta(days=89)

    query_start = datetime.combine(start_date - timedelta(days=1), datetime.min.time())
    postponed_tasks = (
        db.query(Task)
        .filter(
            Task.user_number == user_number,
            Task.status != "archived",
            Task.times_postponed > 0,
        )
        .all()
    )
    procrastination_ranking = _rank_procrastinated_tasks(postponed_tasks, limit=3)
    tasks = (
        db.query(Task)
        .filter(
            Task.user_number == user_number,
            Task.status == COMPLETED_STATUS,
            Task.updated_at >= query_start,
        )
        .all()
    )
    task_ids = [task.id for task in tasks]
    scores = []
    if task_ids:
        scores = (
            db.query(TaskPriorityScore)
            .filter(
                TaskPriorityScore.user_number == user_number,
                TaskPriorityScore.task_id.in_(task_ids),
            )
            .order_by(TaskPriorityScore.task_id, TaskPriorityScore.scored_at.desc())
            .all()
        )

    score_lookup: dict[int, list[TaskPriorityScore]] = {}
    for score in scores:
        score_lookup.setdefault(score.task_id, []).append(score)

    by_day: dict[date, dict[str, Any]] = {
        day: {"mtn_score": 0.0, "completed_tasks": 0, "tasks": []}
        for day in _date_range(start_date, end_date)
    }

    for task in tasks:
        completed_day = _task_completed_day(task, timezone_name)
        if completed_day not in by_day:
            continue

        mtn_score = _task_mtn_score(task, task.updated_at, score_lookup)
        by_day[completed_day]["mtn_score"] += mtn_score
        by_day[completed_day]["completed_tasks"] += 1
        by_day[completed_day]["tasks"].append({
            "id": task.id,
            "title": task.title,
            "mtn_score": round(mtn_score, 1),
            "completed_at": _local_completed_at_iso(task, timezone_name),
            "project": task.project,
            "goal_id": task.goal_id,
        })

    trend_chart = []
    scores = []
    for day in _date_range(start_date, end_date):
        daily = by_day[day]
        score = round(daily["mtn_score"], 2)
        scores.append(score)
        rolling_values = scores[-7:]
        trend_chart.append({
            "date": _iso(day),
            "mtn_score": score,
            "completed_tasks": daily["completed_tasks"],
            "rolling_average": round(mean(rolling_values), 2) if rolling_values else 0,
        })

    summary = {
        "today": {
            **(trend_chart[-1] if trend_chart else {"mtn_score": 0, "completed_tasks": 0}),
            "tasks": sorted(by_day.get(end_date, {}).get("tasks", []), key=lambda item: item["mtn_score"], reverse=True),
        },
        "last_7_days": _period_stats(trend_chart, 7),
        "last_30_days": _period_stats(trend_chart, 30),
        "last_90_days": _period_stats(trend_chart, 90),
        "procrastination_ranking": [
            {
                "id": task.id,
                "title": task.title,
                "times_postponed": task.times_postponed or 0,
                "mtn_score": round(_normalize_mtn_score(task.move_the_needle_score), 1),
                "status": task.status,
                "due_date": task.due_date.isoformat() if task.due_date else None,
                "project": task.project,
                "goal_id": task.goal_id,
            }
            for task in procrastination_ranking
        ],
    }
    delta = summary["last_7_days"]["average_score"] - summary["last_30_days"]["average_score"]
    summary["last_7_days"]["trend"] = {
        "label": _trend_label(delta),
        "delta_vs_30": round(delta, 2),
    }

    return {
        "summary": summary,
        "trend_chart": trend_chart,
    }
