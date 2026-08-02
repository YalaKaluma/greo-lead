from datetime import date

from app.services.home_dashboard_service import _completed_days, _mtn_period_stats


def test_completed_days_excludes_today_and_future_rows():
    rows = [
        {"date": "2026-07-31", "mtn_score": 5},
        {"date": "2026-08-01", "mtn_score": 9},
        {"date": "2026-08-02", "mtn_score": 10},
    ]

    assert _completed_days(rows, date(2026, 8, 1)) == rows[:1]


def test_mtn_period_stats_uses_last_seven_completed_days():
    rows = [
        {"date": f"2026-07-{day:02d}", "mtn_score": day, "completed_tasks": 1}
        for day in range(20, 28)
    ]

    stats = _mtn_period_stats(rows, 7)

    assert stats["total_score"] == sum(range(21, 28))
    assert stats["average_score"] == round(sum(range(21, 28)) / 7, 2)
    assert stats["completed_tasks"] == 7
