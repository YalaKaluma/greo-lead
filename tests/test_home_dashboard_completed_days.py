from datetime import date

from app.services.home_dashboard_service import (
    _average_chart_value,
    _completed_days,
    _five_week_wisdom_average,
    _mtn_period_stats,
    _weekly_journal_metrics,
)


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


def test_five_week_average_uses_last_35_days():
    rows = [{"mtn_score": day} for day in range(1, 41)]

    assert _average_chart_value(rows, "mtn_score") == 23.0


def test_wisdom_index_multiplies_consistency_by_depth_percentage():
    chart = [
        {"entry_count": 1, "daily_average": 8},
        {"entry_count": 1, "daily_average": 6},
        *[{"entry_count": 0, "daily_average": 0} for _ in range(5)],
    ]

    metrics = _weekly_journal_metrics({"trend_chart": chart})

    assert metrics["journal_day_percentage"] == 29
    assert metrics["depth_percentage"] == 70
    assert metrics["wisdom_index"] == 20
    assert _five_week_wisdom_average(chart) == 20.0
