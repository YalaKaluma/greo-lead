from __future__ import annotations

from datetime import date, datetime, timedelta
from statistics import mean, pstdev
from typing import Any

from sqlalchemy.orm import Session

from app.models import DailyEnergyCheckin, Habit, HabitCompletion
from app.services.timezone_service import DEFAULT_TIMEZONE, today_for_timezone


def get_today(timezone_name: str = DEFAULT_TIMEZONE) -> date:
    return today_for_timezone(timezone_name)


def calculate_streak(completions: list[HabitCompletion], frequency: str, today: date) -> int:
    done_dates = {completion.date for completion in completions if completion.status == "done"}
    if not done_dates:
        return 0

    current_date = today if today in done_dates else today - timedelta(days=1)
    if current_date not in done_dates:
        return 0

    streak = 0
    while current_date in done_dates:
        streak += 1
        current_date -= timedelta(days=1)
        if frequency == "weekdays":
            while current_date.weekday() >= 5:
                current_date -= timedelta(days=1)

    return streak


def _date_range(start_date: date, end_date: date) -> list[date]:
    days = (end_date - start_date).days
    return [start_date + timedelta(days=offset) for offset in range(days + 1)]


def _iso(day: date) -> str:
    return day.isoformat()


def _is_expected(habit: Habit, day: date) -> bool:
    created_at = habit.created_at.date() if isinstance(habit.created_at, datetime) else None
    if created_at and day < created_at:
        return False
    if habit.frequency == "weekdays" and day.weekday() >= 5:
        return False
    return True


def _rate(completed: int, expected: int) -> int:
    if expected <= 0:
        return 0
    return round((completed / expected) * 100)


def _trend_label(delta: int) -> str:
    if delta >= 5:
        return "Improving"
    if delta <= -5:
        return "Declining"
    return "Stable"


def _period_stats(habits: list[Habit], completion_lookup: dict[tuple[int, date], str], end_date: date, days: int) -> dict[str, Any]:
    start_date = end_date - timedelta(days=days - 1)
    completed = 0
    expected = 0

    for day in _date_range(start_date, end_date):
        for habit in habits:
            if not _is_expected(habit, day):
                continue
            expected += 1
            if completion_lookup.get((habit.id, day)) == "done":
                completed += 1

    return {
        "days": days,
        "completed": completed,
        "expected": expected,
        "compliance_rate": _rate(completed, expected),
    }


def _build_daily_trend(habits: list[Habit], completion_lookup: dict[tuple[int, date], str], start_date: date, end_date: date) -> list[dict[str, Any]]:
    trend = []
    rates = []

    for day in _date_range(start_date, end_date):
        expected = 0
        completed = 0
        for habit in habits:
            if not _is_expected(habit, day):
                continue
            expected += 1
            if completion_lookup.get((habit.id, day)) == "done":
                completed += 1

        compliance = _rate(completed, expected)
        rates.append(compliance)
        rolling_values = rates[-7:]

        trend.append({
            "date": _iso(day),
            "completed": completed,
            "expected": expected,
            "compliance_rate": compliance,
            "rolling_average": round(mean(rolling_values)) if rolling_values else 0,
        })

    return trend


def _build_energy_trend(checkins: list[DailyEnergyCheckin], start_date: date, end_date: date) -> list[dict[str, Any]]:
    levels_by_date = {checkin.date: checkin.energy_level for checkin in checkins}
    return [
        {
            "date": _iso(day),
            "energy_level": levels_by_date.get(day),
        }
        for day in _date_range(start_date, end_date)
    ]


def _build_heatmap(trend_chart: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "date": item["date"],
            "compliance_rate": item["compliance_rate"],
            "completed": item["completed"],
            "expected": item["expected"],
            "week": date.fromisoformat(item["date"]).isocalendar().week,
            "weekday": date.fromisoformat(item["date"]).weekday(),
        }
        for item in trend_chart
    ]


def _build_leaderboard(habits: list[Habit], completion_lookup: dict[tuple[int, date], str], end_date: date) -> list[dict[str, Any]]:
    start_date = end_date - timedelta(days=89)
    leaderboard = []

    for habit in habits:
        expected = 0
        completed = 0
        for day in _date_range(start_date, end_date):
            if not _is_expected(habit, day):
                continue
            expected += 1
            if completion_lookup.get((habit.id, day)) == "done":
                completed += 1

        leaderboard.append({
            "habit_id": habit.id,
            "habit_name": habit.title,
            "frequency": habit.frequency,
            "completed": completed,
            "expected": expected,
            "compliance_rate": _rate(completed, expected),
            "current_streak": calculate_streak(habit.completions, habit.frequency, end_date),
        })

    return sorted(leaderboard, key=lambda item: item["compliance_rate"], reverse=True)


def _consistency_score(trend_chart: list[dict[str, Any]]) -> int:
    if not trend_chart:
        return 0

    weekly_rates = []
    current_week = []
    current_week_number = None

    for item in trend_chart:
        week_number = date.fromisoformat(item["date"]).isocalendar().week
        if current_week_number is None:
            current_week_number = week_number
        if week_number != current_week_number:
            if current_week:
                weekly_rates.append(mean(current_week))
            current_week = []
            current_week_number = week_number
        current_week.append(item["compliance_rate"])

    if current_week:
        weekly_rates.append(mean(current_week))

    if not weekly_rates:
        return 0

    average_rate = mean(weekly_rates)
    volatility_penalty = min(pstdev(weekly_rates) * 1.35 if len(weekly_rates) > 1 else 0, 35)
    return max(0, min(100, round(average_rate - volatility_penalty)))


def _momentum_score(summary: dict[str, Any]) -> int:
    short_rate = summary["last_7_days"]["compliance_rate"]
    long_rate = summary["last_90_days"]["compliance_rate"]
    delta = short_rate - long_rate
    return max(0, min(100, round(50 + delta * 2)))


def _weekday_gap(trend_chart: list[dict[str, Any]]) -> dict[str, Any]:
    weekdays = [item["compliance_rate"] for item in trend_chart if date.fromisoformat(item["date"]).weekday() < 5]
    weekends = [item["compliance_rate"] for item in trend_chart if date.fromisoformat(item["date"]).weekday() >= 5]
    weekday_avg = round(mean(weekdays)) if weekdays else 0
    weekend_avg = round(mean(weekends)) if weekends else 0
    return {
        "weekday_average": weekday_avg,
        "weekend_average": weekend_avg,
        "gap": weekday_avg - weekend_avg,
    }


def _build_insights(summary: dict[str, Any], trend_chart: list[dict[str, Any]], leaderboard: list[dict[str, Any]]) -> list[str]:
    insights = []
    weekday_gap = _weekday_gap(trend_chart)

    if weekday_gap["gap"] >= 15:
        insights.append(
            f"Weekend completion is {weekday_gap['gap']} points lower than weekday completion, which suggests unstructured days are the main leak."
        )

    last_7 = summary["last_7_days"]["compliance_rate"]
    last_21 = summary["last_21_days"]["compliance_rate"]
    last_90 = summary["last_90_days"]["compliance_rate"]

    if last_7 - last_90 >= 10:
        insights.append("The most recent week is meaningfully stronger than the 90-day baseline.")
    elif last_90 - last_7 >= 10:
        insights.append("The most recent week is meaningfully weaker than the 90-day baseline.")

    if leaderboard:
        top = leaderboard[0]
        bottom = leaderboard[-1]
        if top["compliance_rate"] - bottom["compliance_rate"] >= 25:
            insights.append(
                f"{top['habit_name']} is much more embedded than {bottom['habit_name']}; that gap is the clearest leverage point."
            )

    low_days = [item for item in trend_chart[-21:] if item["expected"] > 0 and item["compliance_rate"] <= 40]
    if len(low_days) >= 3:
        insights.append("There were several low-compliance days in the last three weeks, so recent consistency may be uneven.")

    if not insights:
        insights.append("No major behavioral shifts stand out yet; the data is showing a relatively steady pattern.")

    return insights[:4]


def _build_coaching(summary: dict[str, Any], leaderboard: list[dict[str, Any]], insights: list[str], scores: dict[str, Any]) -> str:
    last_7 = summary["last_7_days"]["compliance_rate"]
    last_90 = summary["last_90_days"]["compliance_rate"]
    delta = last_7 - last_90
    top = leaderboard[0]["habit_name"] if leaderboard else "your strongest habits"
    bottom = leaderboard[-1]["habit_name"] if leaderboard else "the habits that feel least automatic"

    direction = "improved" if delta > 0 else "softened" if delta < 0 else "held steady"
    trend_sentence = (
        f"Your habit compliance has {direction} from {last_90}% over the 90-day view to {last_7}% in the last week."
    )

    return (
        f"{trend_sentence} {top} looks like the most reliable behavior right now, while {bottom} deserves the next small adjustment. "
        f"Your discipline score is {scores['discipline_score']} and your consistency score is {scores['consistency_score']}, so the best move is not to add more pressure; it is to protect the routine that already works. "
        f"{insights[0]} For the next week, pick one fragile moment and make it easier: reduce the scope, attach it to an existing cue, or decide in advance what the minimum acceptable version looks like."
    )


def get_habit_trends(user_number: str, db: Session, timezone_name: str = DEFAULT_TIMEZONE) -> dict[str, Any]:
    end_date = get_today(timezone_name)
    start_date = end_date - timedelta(days=89)
    query_start_date = end_date - timedelta(days=179)

    habits = (
        db.query(Habit)
        .filter(Habit.user_number == user_number, Habit.is_active == True)
        .all()
    )
    habit_ids = [habit.id for habit in habits]

    completions = []
    if habit_ids:
        completions = (
            db.query(HabitCompletion)
            .filter(
                HabitCompletion.habit_id.in_(habit_ids),
                HabitCompletion.date >= query_start_date,
                HabitCompletion.date <= end_date,
            )
            .all()
        )

    completion_lookup = {(completion.habit_id, completion.date): completion.status for completion in completions}
    energy_checkins = (
        db.query(DailyEnergyCheckin)
        .filter(
            DailyEnergyCheckin.user_number == user_number,
            DailyEnergyCheckin.date >= start_date,
            DailyEnergyCheckin.date <= end_date,
        )
        .order_by(DailyEnergyCheckin.date.asc())
        .all()
    )

    summary = {
        "last_7_days": _period_stats(habits, completion_lookup, end_date, 7),
        "last_21_days": _period_stats(habits, completion_lookup, end_date, 21),
        "last_90_days": _period_stats(habits, completion_lookup, end_date, 90),
    }
    previous_90_days = _period_stats(habits, completion_lookup, end_date - timedelta(days=90), 90)

    summary["last_7_days"]["trend"] = {
        "label": _trend_label(summary["last_7_days"]["compliance_rate"] - summary["last_90_days"]["compliance_rate"]),
        "delta_vs_90": summary["last_7_days"]["compliance_rate"] - summary["last_90_days"]["compliance_rate"],
    }
    summary["last_21_days"]["trend"] = {
        "label": _trend_label(summary["last_21_days"]["compliance_rate"] - summary["last_90_days"]["compliance_rate"]),
        "delta_vs_90": summary["last_21_days"]["compliance_rate"] - summary["last_90_days"]["compliance_rate"],
    }
    previous_90_delta = (
        summary["last_90_days"]["compliance_rate"] - previous_90_days["compliance_rate"]
        if previous_90_days["expected"] > 0
        else 0
    )
    summary["last_90_days"]["trend"] = {
        "label": _trend_label(previous_90_delta),
        "delta_vs_previous": previous_90_delta,
    }

    trend_chart = _build_daily_trend(habits, completion_lookup, start_date, end_date)
    leaderboard = _build_leaderboard(habits, completion_lookup, end_date)
    scores = {
        "discipline_score": summary["last_90_days"]["compliance_rate"],
        "consistency_score": _consistency_score(trend_chart),
        "momentum_score": _momentum_score(summary),
    }
    insights = _build_insights(summary, trend_chart, leaderboard)

    coaching_context = {
        "habit_count": len(habits),
        "strongest_habits": leaderboard[:3],
        "needs_attention": list(reversed(leaderboard[-3:])),
        "weekday_gap": _weekday_gap(trend_chart),
        "coaching": _build_coaching(summary, leaderboard, insights, scores) if habits else "Add a few habits first, then Alfred can coach against your real consistency patterns.",
        "insights": insights,
    }

    return {
        "summary": summary,
        "trend_chart": trend_chart,
        "energy_trend": _build_energy_trend(energy_checkins, start_date, end_date),
        "heatmap": _build_heatmap(trend_chart),
        "leaderboard": leaderboard,
        "scores": scores,
        "coaching_context": coaching_context,
    }
