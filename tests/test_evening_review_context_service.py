from datetime import date
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.services.evening_review_context_service import (
    _habit_section,
    _task_section,
    build_evening_review_context,
)


def test_task_section_prioritizes_big_work_and_includes_mtn_trends():
    payload = {
        "today": {
            "mtn_score": 18,
            "tasks": [
                {"title": "Small admin", "mtn_score": 2},
                {"title": "Client decision", "mtn_score": 9},
                {"title": "Product direction", "mtn_score": 7},
                {"title": "Routine follow-up", "mtn_score": 1},
            ],
        },
        "last_7_days": {"average_score": 12},
        "last_30_days": {"average_score": 10.5},
    }

    with patch(
        "app.services.evening_review_context_service.get_task_mtn_trends",
        return_value=payload,
    ):
        result = _task_section(MagicMock(), "user", "America/Toronto")

    assert "Client decision (MTN 9)" in result
    assert "Product direction (MTN 7)" in result
    assert "Routine follow-up" not in result
    assert "Total MTN completed today: 18" in result
    assert "12 over 7 days; 10.5 over 30 days" in result


def test_habit_section_names_completed_habits_and_includes_compliance_trends():
    today = date(2026, 9, 28)
    exercise = SimpleNamespace(
        title="Exercise",
        completions=[SimpleNamespace(date=today, status="done")],
    )
    reading = SimpleNamespace(
        title="Read",
        completions=[SimpleNamespace(date=today, status="pending")],
    )
    query = MagicMock()
    query.filter.return_value.all.return_value = [exercise, reading]
    db = MagicMock()
    db.query.return_value = query
    payload = {
        "trend_chart": [{
            "date": today.isoformat(),
            "expected": 2,
            "completed": 1,
            "compliance_rate": 50,
        }],
        "summary": {
            "last_7_days": {"compliance_rate": 72},
            "last_21_days": {"compliance_rate": 68},
            "last_90_days": {"compliance_rate": 61},
        },
    }

    with patch(
        "app.services.evening_review_context_service.get_habit_trends",
        return_value=payload,
    ):
        result = _habit_section(db, "user", "America/Toronto")

    assert "Completed: Exercise" in result
    assert "Read" not in result
    assert "Today: 1/2 expected habits (50%)" in result
    assert "72% over 7 days; 68% over 21 days; 61% over 90 days" in result


def test_evening_review_prepares_for_journaling_without_reading_a_journal_entry():
    with (
        patch(
            "app.services.evening_review_context_service.get_user_timezone",
            return_value="America/Toronto",
        ),
        patch(
            "app.services.evening_review_context_service._meeting_section",
            return_value="MEETING SIGNALS",
        ),
        patch(
            "app.services.evening_review_context_service._task_section",
            return_value="TASK SIGNALS",
        ),
        patch(
            "app.services.evening_review_context_service._habit_section",
            return_value="HABIT SIGNALS",
        ),
    ):
        result = build_evening_review_context(MagicMock(), "user")

    assert "MEETING SIGNALS" in result
    assert "TASK SIGNALS" in result
    assert "HABIT SIGNALS" in result
    assert "journal is the destination" in result
    assert "do not look for or refer to an existing journal entry" in result
