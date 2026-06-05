from __future__ import annotations

from datetime import date, datetime, timedelta
from statistics import mean
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.models import Task
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

    if completed_at.tzinfo is not None:
        return completed_at.astimezone(ZoneInfo(normalize_timezone(timezone_name))).date()

    return completed_at.date()


def _task_mtn_score(task: Task) -> float:
    raw_score = task.move_the_needle_score
    if raw_score is None:
        return 0.0

    score = float(raw_score)
    return score / 10 if score > 1 else score


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


def get_task_mtn_trends(
    user_number: str,
    db: Session,
    timezone_name: str = DEFAULT_TIMEZONE,
) -> dict[str, Any]:
    end_date = today_for_timezone(timezone_name)
    start_date = end_date - timedelta(days=89)

    query_start = datetime.combine(start_date, datetime.min.time())
    tasks = (
        db.query(Task)
        .filter(
            Task.user_number == user_number,
            Task.status == COMPLETED_STATUS,
            Task.updated_at >= query_start,
        )
        .all()
    )

    by_day: dict[date, dict[str, Any]] = {
        day: {"mtn_score": 0.0, "completed_tasks": 0}
        for day in _date_range(start_date, end_date)
    }

    for task in tasks:
        completed_day = _task_completed_day(task, timezone_name)
        if completed_day not in by_day:
            continue

        by_day[completed_day]["mtn_score"] += _task_mtn_score(task)
        by_day[completed_day]["completed_tasks"] += 1

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
        "today": trend_chart[-1] if trend_chart else {"mtn_score": 0, "completed_tasks": 0},
        "last_7_days": _period_stats(trend_chart, 7),
        "last_30_days": _period_stats(trend_chart, 30),
        "last_90_days": _period_stats(trend_chart, 90),
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
