from __future__ import annotations

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.models import Habit, Meeting, MeetingLeadershipObservation
from app.services.habits.habit_trend_service import get_habit_trends
from app.services.task_mtn_trend_service import get_task_mtn_trends
from app.services.timezone_service import get_user_timezone


def _local_day_bounds(timezone_name: str) -> tuple[datetime, datetime]:
    local_timezone = ZoneInfo(timezone_name)
    local_day = datetime.now(local_timezone).date()
    start = datetime.combine(local_day, datetime.min.time(), tzinfo=local_timezone)
    end = datetime.combine(local_day + timedelta(days=1), datetime.min.time(), tzinfo=local_timezone)
    return start.astimezone(timezone.utc), end.astimezone(timezone.utc)


def _meeting_section(db: Session, user_number: str, start: datetime, end: datetime) -> str:
    meetings = (
        db.query(Meeting)
        .filter(
            Meeting.user_number == user_number,
            Meeting.processing_status == "ready",
            Meeting.started_at >= start,
            Meeting.started_at < end,
        )
        .order_by(Meeting.started_at.asc())
        .limit(8)
        .all()
    )
    if not meetings:
        return ""

    meeting_ids = [meeting.id for meeting in meetings]
    observations = (
        db.query(MeetingLeadershipObservation)
        .filter(MeetingLeadershipObservation.meeting_id.in_(meeting_ids))
        .order_by(MeetingLeadershipObservation.meeting_id, MeetingLeadershipObservation.id)
        .all()
    )
    by_meeting: dict[int, list[MeetingLeadershipObservation]] = {}
    for observation in observations:
        by_meeting.setdefault(observation.meeting_id, []).append(observation)

    lines = []
    for meeting in meetings:
        feedback = by_meeting.get(meeting.id, [])[:5]
        if not feedback:
            continue
        themes = " | ".join(
            f"{item.category}: {item.observation[:700]}"
            for item in feedback
        )
        lines.append(f"- {meeting.title}: {themes}")
    if not lines:
        return ""

    return (
        "TODAY'S MEETINGS — EMOTIONAL AND GROWTH SIGNALS:\n"
        + "\n".join(lines)[:9000]
        + "\nSynthesize patterns in emotions, leadership behavior, relationships, confidence, tension, and growth. "
          "Do not summarize action items or quote transcript evidence."
    )


def _task_section(db: Session, user_number: str, timezone_name: str) -> str:
    trends = get_task_mtn_trends(user_number, db, timezone_name)
    today = trends.get("today") or {}
    completed = today.get("tasks") or []
    if not completed:
        return ""

    top_tasks = sorted(completed, key=lambda item: item.get("mtn_score") or 0, reverse=True)[:3]
    task_lines = [
        f"- {item.get('title', 'Untitled task')} (MTN {item.get('mtn_score', 0):g})"
        for item in top_tasks
    ]
    today_score = float(today.get("mtn_score") or 0)
    seven_day = float((trends.get("last_7_days") or {}).get("average_score") or 0)
    thirty_day = float((trends.get("last_30_days") or {}).get("average_score") or 0)
    return (
        "TODAY'S MEANINGFUL WORK:\n"
        + "\n".join(task_lines)
        + f"\n- Total MTN completed today: {today_score:g}. "
          f"Average weekday MTN: {seven_day:g} over 7 days; {thirty_day:g} over 30 days."
    )


def _habit_section(db: Session, user_number: str, timezone_name: str) -> str:
    trends = get_habit_trends(user_number, db, timezone_name)
    chart = trends.get("trend_chart") or []
    today = chart[-1] if chart else {}
    summary = trends.get("summary") or {}

    completed_titles: list[str] = []
    for habit in db.query(Habit).filter(Habit.user_number == user_number, Habit.is_active == True).all():
        if any(completion.date.isoformat() == today.get("date") and completion.status == "done" for completion in habit.completions):
            completed_titles.append(habit.title)

    expected = int(today.get("expected") or 0)
    completed = int(today.get("completed") or 0)
    if expected == 0 and not completed_titles:
        return ""
    today_rate = int(today.get("compliance_rate") or 0)
    seven = int((summary.get("last_7_days") or {}).get("compliance_rate") or 0)
    twenty_one = int((summary.get("last_21_days") or {}).get("compliance_rate") or 0)
    ninety = int((summary.get("last_90_days") or {}).get("compliance_rate") or 0)
    names = ", ".join(completed_titles[:8]) if completed_titles else "None recorded yet"
    return (
        "TODAY'S HABITS:\n"
        f"- Completed: {names}.\n"
        f"- Today: {completed}/{expected} expected habits ({today_rate}%). "
        f"Compliance trend: {seven}% over 7 days; {twenty_one}% over 21 days; {ninety}% over 90 days."
    )


def build_evening_review_context(db: Session, user_number: str) -> str:
    """Build factual context that helps the user reconstruct the day before journaling."""
    timezone_name = get_user_timezone(db, user_number)
    start, end = _local_day_bounds(timezone_name)
    sections = [
        _meeting_section(db, user_number, start, end),
        _task_section(db, user_number, timezone_name),
        _habit_section(db, user_number, timezone_name),
    ]
    available = [section for section in sections if section]
    return (
        "\nEVENING DAY REVIEW CONTEXT:\n"
        + "\n\n".join(available)
        + "\n\nUse this evidence to help the user revisit the day and introspect in their journal. "
          "The journal is the destination: do not look for or refer to an existing journal entry."
    )
