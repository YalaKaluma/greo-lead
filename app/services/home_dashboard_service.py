from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
import logging
from statistics import mean
from typing import Any

from sqlalchemy import desc, func, or_
from sqlalchemy.orm import Session

from app.models import (
    BeltAssessment,
    Habit,
    HomeDashboardSnapshot,
    JourneyBeltTrial,
    JourneyGoal,
    Meeting,
    MeetingLeadershipDomainAssessment,
    Message,
    OpportunitySuggestion,
    Task,
    TaskPriorityScore,
    User,
    VisionProgressReview,
)
from app.routers.journey import JOURNEY_DIMENSIONS, get_current_belt_status, load_journey_trials_config
from app.services.goal_progress_review_service import GoalProgressReviewService
from app.services.habits.habit_trend_service import get_habit_trends
from app.services.journal_reflection_depth_service import get_reflection_depth_trends
from app.services.onboarding_seed_service import is_starter_goal_example
from app.services.task_mtn_trend_service import get_task_mtn_trends
from app.services.timezone_service import get_user_timezone, today_for_timezone
from app.config import OPENAI_MODEL
from app.services.openai_service import client
from app.services.opportunity.opportunity_service import get_best_opportunities


DOMAIN_LABELS = {
    "vision": "Vision & Goals",
    "people": "People",
    "execute": "Prioritize & Execute",
    "energy": "Time & Energy",
    "learning": "Learning & Development",
}

DOMAIN_ORDER = ["vision", "people", "execute", "energy", "learning"]
HOME_DASHBOARD_SCHEMA_VERSION = 10
logger = logging.getLogger(__name__)


def _as_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _as_score_10(value: Any) -> float:
    score = _as_float(value, 0.0)
    if score <= 1:
        score *= 10
    return round(max(0.0, min(10.0, score)), 1)


def _iso(value: Any) -> str | None:
    if not value:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def _goal_level(goal: JourneyGoal) -> str:
    value = (goal.time_horizon or "").strip().lower()
    return {"long": "vision", "medium": "pillar", "short": "outcome"}.get(value, value)


def _goal_title(goal: JourneyGoal | None) -> str | None:
    if not goal:
        return None
    return goal.title or goal.goal_text


def _task_due_day(task: Task):
    if not task.due_date:
        return None
    return task.due_date.date() if isinstance(task.due_date, datetime) else task.due_date


def _latest_scores(db: Session, user_number: str, task_ids: list[int]) -> dict[int, TaskPriorityScore]:
    if not task_ids:
        return {}

    scores = (
        db.query(TaskPriorityScore)
        .filter(
            TaskPriorityScore.user_number == user_number,
            TaskPriorityScore.task_id.in_(task_ids),
        )
        .order_by(TaskPriorityScore.task_id, TaskPriorityScore.scored_at.desc())
        .all()
    )
    latest: dict[int, TaskPriorityScore] = {}
    for score in scores:
        if score.task_id not in latest:
            latest[score.task_id] = score
    return latest


def _serialize_task(task: Task, score: TaskPriorityScore | None, goals_by_id: dict[int, JourneyGoal]) -> dict[str, Any]:
    goal = goals_by_id.get(task.goal_id) if task.goal_id else None
    return {
        "id": task.id,
        "title": task.title,
        "due_date": _iso(task.due_date),
        "priority": task.priority,
        "goal_id": task.goal_id,
        "goal_title": (goal.title or goal.goal_text) if goal else None,
        "mtn_score": _as_score_10(score.top10_likelihood if score else task.move_the_needle_score),
        "mtn_reason": score.primary_reason if score else None,
        "times_postponed": task.times_postponed or 0,
        "project": task.project,
    }


def _rank_top_tasks(
    tasks: list[Task],
    scores_by_task: dict[int, TaskPriorityScore],
    goals_by_id: dict[int, JourneyGoal],
    today,
) -> list[dict[str, Any]]:
    priority_order = {"high": 3, "medium": 2, "low": 1}

    def sort_key(task: Task):
        due_day = _task_due_day(task)
        urgent = 1 if due_day and due_day <= today else 0
        aligned = 1 if task.goal_id in goals_by_id else 0
        score = _as_score_10(scores_by_task.get(task.id).top10_likelihood if scores_by_task.get(task.id) else task.move_the_needle_score)
        return (
            score,
            urgent,
            aligned,
            priority_order.get((task.priority or "").lower(), 0),
            due_day.toordinal() if due_day else 0,
        )

    today_tasks = [task for task in tasks if (_task_due_day(task) and _task_due_day(task) <= today)]
    return [
        _serialize_task(task, scores_by_task.get(task.id), goals_by_id)
        for task in sorted(today_tasks, key=sort_key, reverse=True)[:3]
    ]


def _operating_system_commentary(
    metrics: dict[str, Any],
    trends: dict[str, Any],
    tasks: list[Task],
    journal_messages: list[Message],
    meeting_feedback: list[MeetingLeadershipDomainAssessment],
    language: str = "en",
) -> str:
    context = {
        "indexes": metrics,
        "last_14_days": {key: (value or [])[-14:] for key, value in trends.items()},
        "open_tasks": [
            {"title": task.title, "due_date": _iso(task.due_date), "priority": task.priority}
            for task in tasks[:20]
        ],
        "recent_journal": [message.content for message in journal_messages[:8] if message.content],
        "recent_meeting_leadership_feedback": [
            {"domain": item.domain, "score": item.score, "feedback": item.feedback}
            for item in meeting_feedback[:12]
        ],
    }
    response = client.chat.completions.create(
        model=OPENAI_MODEL,
        temperature=0.25,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are Alfred, an executive chief of staff. Write one concise operating-system observation "
                    "of 90-140 words in second person. Synthesize the indexes, their recent direction, the last few "
                    "days of journal context, open work, and meeting leadership feedback. Identify the central pattern, "
                    "name one tension or risk, and end with one practical focus for today. Be warm, direct, and specific. "
                    "Do not invent evidence, list every input, or use headings."
                    + (" Write in French." if language == "fr" else " Write in English.")
                ),
            },
            {"role": "user", "content": json.dumps(context, default=str, ensure_ascii=False)[:60000]},
        ],
    )
    return (response.choices[0].message.content or "").strip()


def _rank_procrastinated_tasks(
    tasks: list[Task],
    scores_by_task: dict[int, TaskPriorityScore],
    goals_by_id: dict[int, JourneyGoal],
) -> list[dict[str, Any]]:
    candidates = [task for task in tasks if (task.times_postponed or 0) > 0]
    ranked = sorted(
        candidates,
        key=lambda task: (
            task.times_postponed or 0,
            _as_score_10(scores_by_task.get(task.id).top10_likelihood if scores_by_task.get(task.id) else task.move_the_needle_score),
            task.updated_at or datetime.min,
        ),
        reverse=True,
    )
    return [
        _serialize_task(task, scores_by_task.get(task.id), goals_by_id)
        for task in ranked[:3]
    ]


def _score_from_feedback(value: Any) -> float:
    if isinstance(value, dict):
        for key in ("score", "domain_score", "readiness_score"):
            if key in value:
                score = _as_float(value.get(key), 0.0)
                return score / 2 if score > 5 else score
    score = _as_float(value, 0.0)
    return score / 2 if score > 5 else score


def _wheel_segments(assessment: BeltAssessment | None) -> list[dict[str, Any]]:
    wheel_scores = assessment.wheel_scores if assessment and isinstance(assessment.wheel_scores, dict) else {}
    wheel_feedback = assessment.wheel_feedback if assessment and isinstance(assessment.wheel_feedback, dict) else {}
    subdomain_feedback = assessment.subdomain_feedback if assessment and isinstance(assessment.subdomain_feedback, dict) else {}

    segments: list[dict[str, Any]] = []
    for domain_id in DOMAIN_ORDER:
        domain_config = JOURNEY_DIMENSIONS.get(domain_id, {})
        domain_label = DOMAIN_LABELS.get(domain_id, domain_config.get("name", domain_id.title()))
        domain_score_source = (
            wheel_scores.get(domain_id)
            or wheel_scores.get(domain_label)
            or wheel_feedback.get(domain_id)
            or wheel_feedback.get(domain_label)
        )
        domain_score = _score_from_feedback(domain_score_source) or 3
        domain_payload = domain_score_source if isinstance(domain_score_source, dict) else {}
        nested_subdomains = domain_payload.get("subdomains") if isinstance(domain_payload.get("subdomains"), dict) else {}

        topics = domain_config.get("topics") or []
        for topic in topics:
            subdomain_label = topic.get("label") or topic.get("id", "").replace("_", " ").title()
            subdomain_payload = (
                nested_subdomains.get(subdomain_label)
                or nested_subdomains.get(topic.get("id"))
                or subdomain_feedback.get(subdomain_label)
                or subdomain_feedback.get(topic.get("id"))
                or {}
            )
            score = _score_from_feedback(subdomain_payload) or domain_score
            status = (
                subdomain_payload.get("status")
                or subdomain_payload.get("current_readiness")
                or domain_payload.get("status")
                or "Assessment pending"
                if isinstance(subdomain_payload, dict)
                else "Assessment pending"
            )
            segments.append({
                "domain_id": domain_id,
                "domain": domain_label,
                "subdomain_id": topic.get("id"),
                "label": subdomain_label,
                "score": round(max(1.0, min(5.0, score)), 1),
                "status": status,
            })

    return segments


def _next_trial(readiness: dict[str, Any], trials: list[JourneyBeltTrial], wheel_segments: list[dict[str, Any]]) -> dict[str, Any]:
    incomplete = next(
        (
            trial for trial in trials
            if (trial.status or "").lower() not in {"passed", "completed"}
        ),
        None,
    )
    if incomplete:
        return {
            "title": f"Complete {(incomplete.target_belt or readiness.get('target_belt') or 'yellow').title()} Belt {(incomplete.trial_type or 'reflection').replace('_', ' ')} trial",
            "domain": DOMAIN_LABELS.get(incomplete.dimension_id, incomplete.dimension_id.title()),
            "belt": f"{(incomplete.target_belt or readiness.get('target_belt') or 'yellow').title()} Belt",
            "cta": "Continue Trial",
            "reason": "This trial is already open and gives Alfred the clearest next evidence for your Journey progression.",
        }

    weakest = min(wheel_segments, key=lambda item: item.get("score", 5), default=None)
    target_belt = readiness.get("target_belt") or readiness.get("current_belt") or "yellow"
    domain = weakest.get("domain") if weakest else "Vision & Goals"
    return {
        "title": f"{target_belt.title()} Belt reflection trial",
        "domain": domain,
        "belt": f"{target_belt.title()} Belt",
        "cta": "Start Trial",
        "reason": f"{domain} has the most room for deeper evidence, so Alfred recommends focusing your next trial there.",
    }


def _weekly_journal_metrics(journal: dict[str, Any]) -> dict[str, Any]:
    chart = journal.get("trend_chart") or []
    week = chart[-7:]
    previous_month = chart[-37:-7]
    entries = sum(int(item.get("entry_count") or 0) for item in week)
    journal_days = sum(1 for item in week if int(item.get("entry_count") or 0) > 0)
    month_entries = sum(int(item.get("entry_count") or 0) for item in previous_month)
    month_avg_entries_per_week = (month_entries / len(previous_month)) * 7 if previous_month else 0
    weekly_depth = [float(item.get("daily_average") or 0) for item in week if item.get("daily_average")]
    monthly_depth = [float(item.get("daily_average") or 0) for item in previous_month if item.get("daily_average")]
    avg_depth_10 = mean(weekly_depth) if weekly_depth else 0
    month_avg_depth_10 = mean(monthly_depth) if monthly_depth else 0
    consistency_percentage = round((journal_days / 7) * 100)
    depth_percentage = round(avg_depth_10 * 10)
    return {
        "entries_this_week": entries,
        "journal_days_this_week": journal_days,
        "journal_day_percentage": consistency_percentage,
        "month_average_entries_per_week": round(month_avg_entries_per_week, 1),
        "delta_entries": round(entries - month_avg_entries_per_week, 1),
        "average_depth_5": round(avg_depth_10 / 2, 1),
        "month_average_depth_5": round(month_avg_depth_10 / 2, 1),
        "delta_depth_5": round((avg_depth_10 - month_avg_depth_10) / 2, 1),
        "average_depth_10": round(avg_depth_10, 1),
        "depth_percentage": depth_percentage,
        "month_average_depth_percentage": round(month_avg_depth_10 * 10),
        "delta_depth_percentage": round((avg_depth_10 - month_avg_depth_10) * 10),
        "wisdom_index": round((consistency_percentage * depth_percentage) / 100),
        "status": "Deep reflection" if avg_depth_10 >= 7 else "Consistent" if entries >= 3 else "Needs more depth",
    }


def _average_chart_value(rows: list[dict[str, Any]], key: str, days: int = 35) -> float:
    values = [_as_float(item.get(key), 0) for item in rows[-days:]]
    return round(mean(values), 1) if values else 0


def _five_week_wisdom_average(rows: list[dict[str, Any]]) -> float:
    daily_scores = [
        10 * _as_float(item.get("daily_average"), 0)
        if int(item.get("entry_count") or 0) > 0 else 0
        for item in rows[-35:]
    ]
    return round(mean(daily_scores), 1) if daily_scores else 0


def _completed_days(rows: list[dict[str, Any]], today) -> list[dict[str, Any]]:
    """Keep only fully elapsed local calendar days."""
    today_key = today.isoformat()
    return [row for row in rows if str(row.get("date") or "") < today_key]


def _mtn_period_stats(trend_chart: list[dict[str, Any]], days: int) -> dict[str, Any]:
    window = trend_chart[-days:]
    total_score = round(sum(_as_float(item.get("mtn_score"), 0) for item in window), 2)
    completed_tasks = sum(int(item.get("completed_tasks") or 0) for item in window)
    return {
        "days": days,
        "total_score": total_score,
        "average_score": round(total_score / days, 2),
        "completed_tasks": completed_tasks,
    }


def _goal_health_color(review: dict[str, Any]) -> str:
    health = review.get("health_scores") or review.get("goal_health") or {}
    color = str(health.get("overall_goal_health") or "").strip().lower()
    if color in {"green", "yellow", "amber", "red"}:
        return "amber" if color == "yellow" else color

    status = str(review.get("status") or "").strip().lower()
    if status in {"accelerating", "on_track", "steady"}:
        return "green"
    if status in {"at_risk"}:
        return "red"
    return "amber"


def _serialize_goal_progress_review(
    db: Session,
    user_number: str,
    vision: JourneyGoal,
    saved_reviews_by_vision: dict[int, VisionProgressReview],
) -> dict[str, Any] | None:
    computed_review: dict[str, Any] = {}
    try:
        computed_review = GoalProgressReviewService.build(db, user_number, vision.id)
    except ValueError:
        if vision.id not in saved_reviews_by_vision:
            return None

    saved = saved_reviews_by_vision.get(vision.id)
    if saved:
        review = {
            "status": saved.status,
            "executive_summary": saved.executive_summary,
            "recommended_focus": saved.recommended_focus,
            "health_scores": saved.health_scores or {},
            "created_at": _iso(saved.created_at),
            "source": "ai_saved",
        }
    else:
        review = computed_review
        review["source"] = "computed"

    return {
        "goal_id": vision.id,
        "goal_title": _goal_title(vision),
        "status": review.get("status") or "steady",
        "health": _goal_health_color(review),
        "executive_summary": review.get("executive_summary") or "No progress review summary is available yet.",
        "recommended_focus": computed_review.get("recommended_focus") or review.get("recommended_focus") or "Create the next concrete task linked to this goal.",
        "review_created_at": review.get("created_at"),
        "source": review.get("source"),
    }


class HomeDashboardService:
    def __init__(self, db: Session):
        self.db = db

    @staticmethod
    def _has_current_schema(snapshot: HomeDashboardSnapshot | None) -> bool:
        payload = snapshot.payload if snapshot else {}
        return (
            isinstance(payload, dict)
            and payload.get("schema_version") == HOME_DASHBOARD_SCHEMA_VERSION
            and "goal_progress_reviews" in payload
        )

    def _journal_source_state(self, user_number: str) -> dict[str, Any]:
        entry_count, latest_scored_at = (
            self.db.query(func.count(Message.id), func.max(Message.reflection_depth_scored_at))
            .filter(
                Message.user_number == user_number,
                Message.sender == "user",
                Message.reflection_depth_score.isnot(None),
            )
            .one()
        )
        return {
            "entry_count": int(entry_count or 0),
            "latest_scored_at": _iso(latest_scored_at),
        }

    def _is_fresh(self, snapshot: HomeDashboardSnapshot | None, user_number: str) -> bool:
        if not self._has_current_schema(snapshot):
            return False
        payload = snapshot.payload or {}
        return (payload.get("source_state") or {}).get("journal") == self._journal_source_state(user_number)

    def get_or_refresh(self, user_number: str, force: bool = False, source: str = "on_demand") -> HomeDashboardSnapshot:
        timezone_name = get_user_timezone(self.db, user_number)
        snapshot_date = today_for_timezone(timezone_name)
        snapshot = (
            self.db.query(HomeDashboardSnapshot)
            .filter(HomeDashboardSnapshot.user_number == user_number, HomeDashboardSnapshot.snapshot_date == snapshot_date)
            .first()
        )
        if snapshot and not force and self._is_fresh(snapshot, user_number):
            return snapshot
        return self.refresh(user_number, source=source)

    def refresh_daily_recommendations(self, user_number: str) -> int:
        user = self.db.query(User).filter(
            or_(User.phone_number == user_number, User.email == user_number)
        ).first()
        if not user:
            return 0

        generated = get_best_opportunities(
            user_id=user.id,
            surface="home_dashboard",
            opportunity_type="task",
            limit=3,
            db=self.db,
        )
        new_ids = [int(item["id"]) for item in generated]
        stale_query = self.db.query(OpportunitySuggestion).filter(
            OpportunitySuggestion.user_id == user.id,
            OpportunitySuggestion.surface == "home_dashboard",
            OpportunitySuggestion.status == "suggested",
        )
        if new_ids:
            stale_query = stale_query.filter(~OpportunitySuggestion.id.in_(new_ids))
        for suggestion in stale_query.all():
            suggestion.status = "expired"
            suggestion.updated_at = datetime.utcnow()
        self.db.commit()
        return len(new_ids)

    def refresh(self, user_number: str, source: str = "manual") -> HomeDashboardSnapshot:
        timezone_name = get_user_timezone(self.db, user_number)
        today = today_for_timezone(timezone_name)

        goals = self.db.query(JourneyGoal).filter(JourneyGoal.user_number == user_number).all()
        user_goals = [goal for goal in goals if not is_starter_goal_example(goal)]
        goals_by_id = {goal.id: goal for goal in user_goals}
        tasks = (
            self.db.query(Task)
            .filter(Task.user_number == user_number, Task.status == "open")
            .all()
        )
        scores_by_task = _latest_scores(self.db, user_number, [task.id for task in tasks])

        mtn = get_task_mtn_trends(user_number, self.db, timezone_name)
        habits = self.db.query(Habit).filter(Habit.user_number == user_number, Habit.is_active == True).all()
        habit_trends = get_habit_trends(user_number, self.db, timezone_name)
        journal = get_reflection_depth_trends(user_number, self.db, include_starter_examples=False)
        mtn_chart = _completed_days(mtn.get("trend_chart") or [], today)
        habit_chart = _completed_days(habit_trends.get("trend_chart") or [], today)
        journal_chart = _completed_days(journal.get("trend_chart") or [], today)
        energy_chart = _completed_days(habit_trends.get("energy_trend") or [], today)
        readiness = get_current_belt_status(self.db, user_number, load_journey_trials_config())
        assessment = (
            self.db.query(BeltAssessment)
            .filter(BeltAssessment.user_number == user_number)
            .order_by(desc(BeltAssessment.created_at))
            .first()
        )
        trials = (
            self.db.query(JourneyBeltTrial)
            .filter(JourneyBeltTrial.user_number == user_number)
            .order_by(desc(JourneyBeltTrial.started_at))
            .all()
        )
        opportunities = (
            self.db.query(OpportunitySuggestion)
            .join(User, OpportunitySuggestion.user_id == User.id)
            .filter(
                or_(User.phone_number == user_number, User.email == user_number),
                OpportunitySuggestion.status == "suggested",
                OpportunitySuggestion.surface == "home_dashboard",
            )
            .order_by(desc(OpportunitySuggestion.mtn_score), desc(OpportunitySuggestion.created_at))
            .limit(3)
            .all()
        )

        mtn_week = _mtn_period_stats(mtn_chart, 7)
        mtn_month = _mtn_period_stats(mtn_chart, 30)
        mtn_delta = mtn_week["average_score"] - mtn_month["average_score"]
        mtn_week["trend"] = {
            "label": "Improving" if mtn_delta >= 1 else "Declining" if mtn_delta <= -1 else "Stable",
            "delta_vs_30": round(mtn_delta, 2),
        }
        habit_week = ((habit_trends.get("summary") or {}).get("last_7_days") or {})
        habit_baseline = ((habit_trends.get("summary") or {}).get("last_90_days") or {})
        journal_metrics = _weekly_journal_metrics({**journal, "trend_chart": journal_chart})
        wheel_segments = _wheel_segments(assessment)
        vision_goals = [
            goal for goal in user_goals
            if _goal_level(goal) == "vision"
        ]
        vision_goals.sort(key=lambda goal: (goal.sort_order or 0, goal.first_seen_at or datetime.min, goal.id or 0))
        latest_saved_reviews: dict[int, VisionProgressReview] = {}
        if vision_goals:
            saved_reviews = (
                self.db.query(VisionProgressReview)
                .filter(
                    VisionProgressReview.user_number == user_number,
                    VisionProgressReview.vision_id.in_([goal.id for goal in vision_goals]),
                )
                .order_by(VisionProgressReview.vision_id, desc(VisionProgressReview.created_at))
                .all()
            )
            for review in saved_reviews:
                if review.vision_id not in latest_saved_reviews:
                    latest_saved_reviews[review.vision_id] = review
        goal_progress_reviews = [
            item for item in (
                _serialize_goal_progress_review(self.db, user_number, goal, latest_saved_reviews)
                for goal in vision_goals
            )
            if item
        ]

        activation_ready = (
            (len(user_goals) >= 1 or len(tasks) >= 3)
            and len(habits) >= 1
            and (
                int((journal.get("summary") or {}).get("total_journal_entries") or 0) >= 1
                or any((trial.status or "").lower() in {"passed", "completed"} for trial in trials)
            )
        )

        metrics = {
            "mtn": {
                "score": _as_float(mtn_week.get("average_score"), 0),
                "completed_tasks": int(mtn_week.get("completed_tasks") or 0),
                "average_tasks_per_day": round(int(mtn_week.get("completed_tasks") or 0) / 7, 1),
                "delta": _as_float((mtn_week.get("trend") or {}).get("delta_vs_30"), 0),
                "status": (mtn_week.get("trend") or {}).get("label") or "Stable",
                "sparkline": [item.get("rolling_average") for item in mtn_chart[-14:]],
                "five_week_average": _average_chart_value(mtn_chart, "mtn_score"),
            },
            "habits": {
                "compliance_rate": int(habit_week.get("compliance_rate") or 0),
                "completed": int(habit_week.get("completed") or 0),
                "expected": int(habit_week.get("expected") or 0),
                "delta": int(habit_week.get("compliance_rate") or 0) - int(habit_baseline.get("compliance_rate") or 0),
                "status": (habit_week.get("trend") or {}).get("label") or "Stable",
                "five_week_average": _average_chart_value(habit_chart, "rolling_average"),
            },
            "journal": {
                **journal_metrics,
                "sparkline": [item.get("weekly_average") for item in journal_chart[-14:]],
                "five_week_average": _five_week_wisdom_average(journal_chart),
            },
        }
        trends = {"mtn": mtn_chart, "habits": habit_chart, "journal": journal_chart, "energy": energy_chart}

        existing_snapshot = self.db.query(HomeDashboardSnapshot).filter(
            HomeDashboardSnapshot.user_number == user_number,
            HomeDashboardSnapshot.snapshot_date == today,
        ).first()
        operating_commentary = ((existing_snapshot.payload or {}).get("operating_commentary") if existing_snapshot else None)
        if source == "morning_nudge" or not operating_commentary:
            user = self.db.query(User).filter(
                or_(User.phone_number == user_number, User.email == user_number)
            ).first()
            recent_journal = self.db.query(Message).filter(
                Message.user_number == user_number,
                Message.sender == "user",
            ).order_by(Message.timestamp.desc()).limit(8).all()
            recent_meeting_feedback = self.db.query(MeetingLeadershipDomainAssessment).join(Meeting).filter(
                Meeting.user_number == user_number,
            ).order_by(Meeting.created_at.desc()).limit(12).all()
            try:
                operating_commentary = _operating_system_commentary(
                    metrics,
                    trends,
                    tasks,
                    recent_journal,
                    recent_meeting_feedback,
                    (user.language_preference if user else "en"),
                )
            except Exception as exc:
                logger.warning("Failed to generate Home operating commentary for %s: %s", user_number, exc)
                operating_commentary = operating_commentary or ""

        payload = {
            "schema_version": HOME_DASHBOARD_SCHEMA_VERSION,
            "snapshot_date": today.isoformat(),
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "source_state": {
                "journal": self._journal_source_state(user_number),
            },
            "activation_ready": activation_ready,
            "metrics": metrics,
            "trends": trends,
            "operating_commentary": operating_commentary,
            "top_tasks": _rank_top_tasks(tasks, scores_by_task, goals_by_id, today),
            "procrastinated_tasks": _rank_procrastinated_tasks(tasks, scores_by_task, goals_by_id),
            "recommendations": [
                {
                    "id": item.id,
                    "title": item.title,
                    "description": item.description,
                    "reason": item.rationale,
                    "mtn_score": _as_float(item.mtn_score, 0),
                }
                for item in opportunities
            ],
            "leadership_wheel": {
                "current_belt": readiness.get("current_belt") or "white",
                "target_belt": readiness.get("target_belt") or "yellow",
                "assessment_id": assessment.id if assessment else None,
                "assessment_status": assessment.status if assessment else None,
                "segments": wheel_segments,
            },
            "goal_progress_reviews": goal_progress_reviews,
            "next_trial": _next_trial(readiness, trials, wheel_segments),
        }

        snapshot = existing_snapshot
        if snapshot:
            snapshot.payload = payload
            snapshot.source = source
            snapshot.updated_at = datetime.now(timezone.utc)
        else:
            snapshot = HomeDashboardSnapshot(
                user_number=user_number,
                snapshot_date=today,
                payload=payload,
                source=source,
            )
            self.db.add(snapshot)

        self.db.commit()
        self.db.refresh(snapshot)
        return snapshot
