# app/services/priority_service.py
"""
Priority Service: Core business logic for task prioritization.

Handles:
- Context snapshot creation (immutable records)
- Task scoring and recommendation generation
- User decision recording (critical for learning)
- Top 10 management and updates
"""

from datetime import datetime, timezone, time
from typing import List, Dict, Optional, Tuple
import pytz
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.models import (
    Task,
    JourneyGoal,
    TaskPrioritizationContext,
    TaskPriorityScore,
    TaskPriorityRecommendation,
    TaskPriorityDecision
)
from app.services.timezone_service import DEFAULT_TIMEZONE, get_user_timezone

ET = pytz.timezone(DEFAULT_TIMEZONE)

GOAL_LEVEL_ALIASES = {
    "long": ["long", "long_term", "vision"],
    "medium": ["medium", "medium_term", "pillar"],
    "short": ["short", "short_term", "outcome"],
    "vision": ["long", "long_term", "vision"],
    "pillar": ["medium", "medium_term", "pillar"],
    "outcome": ["short", "short_term", "outcome"],
}


class PriorityService:
    """Service for task prioritization recommendations."""

    def __init__(self, db: Session):
        self.db = db

    def _timezone_for_user(self, user_number: str):
        return pytz.timezone(get_user_timezone(self.db, user_number))

    def create_context_snapshot(self, user_number: str) -> TaskPrioritizationContext:
        """
        Create immutable context snapshot for this prioritization run.

        Captures:
        - Active goals across all time horizons
        - Current task metrics (total, top10, overdue)
        - Temporal context (day of week, week of year)
        - Optional user state (energy level)

        This snapshot enables:
        - Reproducible scoring
        - Future ML training
        - Understanding what context led to which decisions
        """
        user_tz = self._timezone_for_user(user_number)
        now = datetime.now(user_tz)

        # Fetch active goals by time horizon
        long_term_goals = self._get_goals_by_horizon(user_number, "long")
        short_term_goals = self._get_goals_by_horizon(user_number, "short")
        mid_term_goals = self._get_goals_by_horizon(user_number, "medium")

        # Calculate task metrics
        open_tasks = self.db.query(Task).filter(
            Task.user_number == user_number,
            Task.status == "open"
        ).all()

        current_top10 = self.db.query(Task).filter(
            Task.user_number == user_number,
            Task.in_top10 == True,
            Task.status == "open"
        ).order_by(Task.top10_position).all()

        tasks_with_due = len([t for t in open_tasks if t.due_date])
        # Fix timezone comparison - make due_date timezone-aware if needed
        overdue = len([
            t for t in open_tasks
            if t.due_date and (
                t.due_date.replace(tzinfo=user_tz) if t.due_date.tzinfo is None else t.due_date
            ) < now
        ])

        # Create context
        context = TaskPrioritizationContext(
            user_number=user_number,
            snapshot_at=now,
            active_long_term_goals=long_term_goals,
            active_short_term_goals=short_term_goals,
            active_mid_term_goals=mid_term_goals,
            total_open_tasks=len(open_tasks),
            tasks_in_top10=[t.id for t in current_top10],
            tasks_with_due_dates=tasks_with_due,
            overdue_tasks=overdue,
            day_of_week=now.strftime("%A"),
            week_of_year=now.isocalendar()[1],
            self_reported_energy=None  # Can be set by user later
        )

        self.db.add(context)
        self.db.commit()
        self.db.refresh(context)

        return context

    def _get_goals_by_horizon(self, user_number: str, horizon: str) -> List[Dict]:
        """
        Get active goals for a specific time horizon.

        Returns list of {id, title, goal_text} for LLM context.
        Limits to top 5 goals to keep context manageable.
        """
        goals = self.db.query(JourneyGoal).filter(
            JourneyGoal.user_number == user_number,
            JourneyGoal.time_horizon.in_(GOAL_LEVEL_ALIASES.get(horizon, [horizon]))
        ).order_by(JourneyGoal.sort_order).limit(5).all()

        return [
            {
                "id": g.id,
                "title": g.title,
                "goal_text": g.goal_text,
                "why": g.why
            }
            for g in goals
        ]

    def get_tasks_for_scoring(self, user_number: str) -> List[Task]:
        """
        Get tasks that need prioritization scoring.

        ONLY includes:
        - Tasks due today
        - Overdue tasks
        - Tasks currently in Top 10 (to validate they should stay)

        This focuses on actionable tasks for TODAY.

        Ordered by:
        1. Due date (earliest first)
        2. Created date (newest first)
        """
        from datetime import datetime, time

        # Get today's date as string (YYYY-MM-DD) in the user's timezone.
        # This matches how the frontend TodoList filters
        now = datetime.now(self._timezone_for_user(user_number))
        today_str = now.strftime('%Y-%m-%d')  # e.g., "2026-01-18"

        # Query all open tasks
        tasks = self.db.query(Task).filter(
            Task.user_number == user_number,
            Task.status == "open"
        ).all()

        # Filter to only include:
        # - Tasks due today or earlier (date-only comparison)
        # - Tasks currently in Top 10 (to validate they should stay)
        filtered_tasks = []
        for task in tasks:
            # Always include if in Top 10
            if task.in_top10:
                filtered_tasks.append(task)
                continue

            # Include if due today or overdue (date-only comparison)
            if task.due_date:
                # Extract date part as string (handles both date and datetime)
                if isinstance(task.due_date, str):
                    task_date_str = task.due_date.split('T')[0]
                else:
                    task_date_str = task.due_date.strftime('%Y-%m-%d')

                # String comparison: "2026-01-18" <= "2026-01-18"
                if task_date_str <= today_str:
                    filtered_tasks.append(task)

        # Sort by due date (earliest first), then created date
        filtered_tasks.sort(
            key=lambda t: (
                t.due_date.strftime('%Y-%m-%d') if t.due_date else '9999-12-31',
                -t.created_at.timestamp() if t.created_at else 0
            )
        )

        return filtered_tasks

    def get_latest_recommendation_for_today(
            self,
            user_number: str
    ) -> Optional[TaskPriorityRecommendation]:
        """Return the latest MTN recommendation generated today in the user's timezone."""
        start, end = self._today_window(user_number)

        return (
            self.db.query(TaskPriorityRecommendation)
            .join(
                TaskPrioritizationContext,
                TaskPriorityRecommendation.context_id == TaskPrioritizationContext.id
            )
            .filter(
                TaskPriorityRecommendation.user_number == user_number,
                TaskPrioritizationContext.snapshot_at >= start,
                TaskPrioritizationContext.snapshot_at <= end
            )
            .order_by(desc(TaskPriorityRecommendation.generated_at))
            .first()
        )

    def _today_window(self, user_number: str) -> Tuple[datetime, datetime]:
        """Return the user's local start/end timestamps for today."""
        user_tz = self._timezone_for_user(user_number)
        now = datetime.now(user_tz)
        start = user_tz.localize(datetime.combine(now.date(), time.min))
        end = user_tz.localize(datetime.combine(now.date(), time.max))
        return start, end

    def get_latest_scores_for_today(
            self,
            user_number: str,
            task_ids: Optional[List[int]] = None
    ) -> Dict[int, TaskPriorityScore]:
        """Return each task's latest MTN score generated today."""
        start, end = self._today_window(user_number)
        query = (
            self.db.query(TaskPriorityScore)
            .filter(
                TaskPriorityScore.user_number == user_number,
                TaskPriorityScore.scored_at >= start,
                TaskPriorityScore.scored_at <= end
            )
            .order_by(TaskPriorityScore.task_id, desc(TaskPriorityScore.scored_at))
        )

        if task_ids:
            query = query.filter(TaskPriorityScore.task_id.in_(task_ids))

        latest_by_task_id = {}
        for score in query.all():
            if score.task_id not in latest_by_task_id:
                latest_by_task_id[score.task_id] = score

        return latest_by_task_id

    def run_prioritization(
            self,
            user_number: str,
            llm_service,
            max_tasks: Optional[int] = None,
            reuse_today: bool = False
    ) -> Tuple[TaskPrioritizationContext, Optional[TaskPriorityRecommendation], List[TaskPriorityScore], int]:
        """
        Run and persist one MTN prioritization pass.

        If reuse_today is true, the latest recommendation from today is returned
        instead of calling the LLM again.
        """
        if reuse_today:
            existing = self.get_latest_recommendation_for_today(user_number)
            if existing:
                context = self.db.query(TaskPrioritizationContext).get(existing.context_id)
                scores = self.get_scores_for_recommendation(existing.id)
                return context, existing, scores, 0

        context = self.create_context_snapshot(user_number)
        tasks = self.get_tasks_for_scoring(user_number)
        if max_tasks:
            tasks = tasks[:max_tasks]

        if not tasks:
            return context, None, [], 0

        llm_result = llm_service.score_tasks(tasks, context)
        scores = self.save_priority_scores(
            context_id=context.id,
            scores=llm_result["scores"],
            llm_model=getattr(llm_service, "model", "gpt-4o"),
            tokens_used=llm_result["tokens_used"]
        )
        recommendation = self.generate_recommendations(context_id=context.id, scores=scores)
        self.persist_mtn_results_to_tasks(scores, recommendation)

        return context, recommendation, scores, llm_result["tokens_used"]

    def backfill_task_scores_for_today(
            self,
            user_number: str,
            task_ids: List[int],
            llm_service,
            max_tasks: int = 50
    ) -> Dict:
        """
        Score visible open tasks that do not yet have an MTN score today.

        This is intentionally narrower than the full morning prioritization:
        it does not rewrite Top 10 membership or create a new recommendation
        that could override the morning run.
        """
        requested_ids = list(dict.fromkeys([int(task_id) for task_id in task_ids if task_id]))
        if not requested_ids:
            return {
                "requested": 0,
                "eligible": 0,
                "already_scored": 0,
                "scored": 0,
                "skipped": 0,
                "tokens_used": 0,
                "message": "No tasks were sent for MTN backfill."
            }

        tasks = self.db.query(Task).filter(
            Task.user_number == user_number,
            Task.status == "open",
            Task.id.in_(requested_ids)
        ).all()
        tasks_by_id = {task.id: task for task in tasks}

        existing_scores = self.get_latest_scores_for_today(user_number, requested_ids)
        missing_tasks = [
            tasks_by_id[task_id]
            for task_id in requested_ids
            if task_id in tasks_by_id and task_id not in existing_scores
        ]

        if max_tasks and len(missing_tasks) > max_tasks:
            missing_tasks = missing_tasks[:max_tasks]

        if not missing_tasks:
            return {
                "requested": len(requested_ids),
                "eligible": len(tasks),
                "already_scored": len(existing_scores),
                "scored": 0,
                "skipped": len(requested_ids) - len(tasks),
                "tokens_used": 0,
                "message": "All visible tasks already have today's MTN score."
            }

        context = self.create_context_snapshot(user_number)
        llm_result = llm_service.score_tasks(missing_tasks, context)
        scores = self.save_priority_scores(
            context_id=context.id,
            scores=llm_result["scores"],
            llm_model=getattr(llm_service, "model", "gpt-4o"),
            tokens_used=llm_result["tokens_used"]
        )

        now = datetime.now(self._timezone_for_user(user_number))
        for score in scores:
            task = tasks_by_id.get(score.task_id)
            if not task:
                continue
            task.move_the_needle_score = float(score.top10_likelihood)
            task.last_prioritized_at = now

        self.db.commit()

        return {
            "requested": len(requested_ids),
            "eligible": len(tasks),
            "already_scored": len(existing_scores),
            "scored": len(scores),
            "skipped": len(requested_ids) - len(tasks),
            "tokens_used": llm_result["tokens_used"],
            "context_id": context.id,
            "task_ids": [score.task_id for score in scores],
            "message": f"Backfilled MTN scores for {len(scores)} task(s)."
        }

    def get_scores_for_recommendation(self, recommendation_id: int) -> List[TaskPriorityScore]:
        recommendation = self.db.query(TaskPriorityRecommendation).get(recommendation_id)
        if not recommendation:
            return []

        return (
            self.db.query(TaskPriorityScore)
            .filter(TaskPriorityScore.context_id == recommendation.context_id)
            .order_by(desc(TaskPriorityScore.top10_likelihood))
            .all()
        )

    def persist_mtn_results_to_tasks(
            self,
            scores: List[TaskPriorityScore],
            recommendation: Optional[TaskPriorityRecommendation]
    ) -> None:
        """Store the latest MTN score/rank on tasks for list-level visibility."""
        if not scores:
            return

        now = datetime.now(ET)
        sorted_scores = sorted(scores, key=lambda s: s.top10_likelihood, reverse=True)
        top_ids_by_position = {score.task_id: idx + 1 for idx, score in enumerate(sorted_scores[:10])}

        for score in sorted_scores:
            task = self.db.query(Task).get(score.task_id)
            if not task:
                continue

            task.move_the_needle_score = float(score.top10_likelihood)
            task.last_prioritized_at = now
            if score.task_id in top_ids_by_position:
                task.in_top10 = True
                task.top10_position = top_ids_by_position[score.task_id]
            else:
                task.in_top10 = False
                task.top10_position = None

        self.db.commit()

    def serialize_recommendation(
            self,
            recommendation: Optional[TaskPriorityRecommendation],
            context: Optional[TaskPrioritizationContext] = None,
            scores: Optional[List[TaskPriorityScore]] = None
    ) -> Optional[Dict]:
        """Format a stored MTN recommendation for API/UI use."""
        if not recommendation:
            return None

        context = context or self.db.query(TaskPrioritizationContext).get(recommendation.context_id)
        scores = scores if scores is not None else self.get_scores_for_recommendation(recommendation.id)

        all_scored = []
        for idx, s in enumerate(sorted(scores, key=lambda item: item.top10_likelihood, reverse=True), 1):
            task = self.db.query(Task).get(s.task_id)
            all_scored.append({
                "task_id": s.task_id,
                "title": task.title if task else f"Task #{s.task_id}",
                "notes": task.notes if task else None,
                "priority": task.priority if task else None,
                "project": task.project if task else None,
                "score": float(s.top10_likelihood),
                "reason": s.primary_reason,
                "risk_if_ignored": s.risk_if_ignored,
                "confidence": s.confidence,
                "rank": idx,
                "is_top_mtn": idx <= 3,
                "in_current_top10": s.task_id in (context.tasks_in_top10 or []) if context else False
            })

        return {
            "context_id": recommendation.context_id,
            "recommendation_id": recommendation.id,
            "current_top10": context.tasks_in_top10 or [] if context else [],
            "recommended_changes": recommendation.changes_from_current,
            "recommended_top10": recommendation.recommended_top10,
            "all_scored_tasks": all_scored,
            "prioritized_at": context.snapshot_at.isoformat() if context and context.snapshot_at else None,
            "top_mtn_tasks": all_scored[:3],
            "message": f"Loaded Alfred's stored MTN prioritization for today."
        }

    def save_priority_scores(
            self,
            context_id: int,
            scores: List[Dict],
            llm_model: str,
            tokens_used: int
    ) -> List[TaskPriorityScore]:
        """
        Save LLM priority scores for tasks.

        Args:
            context_id: The context snapshot ID
            scores: List of score dicts from LLM
            llm_model: Model used (e.g., "gpt-4o")
            tokens_used: Total tokens consumed

        Returns:
            List of saved TaskPriorityScore records
        """
        score_records = []

        for score_data in scores:
            score = TaskPriorityScore(
                context_id=context_id,
                task_id=score_data["task_id"],
                user_number=score_data["user_number"],
                top10_likelihood=float(score_data["top10_likelihood"]),
                primary_reason=score_data["primary_reason"],
                risk_if_ignored=score_data.get("risk_if_ignored"),
                confidence=score_data["confidence"],
                raw_llm_response=score_data,
                llm_model=llm_model,
                llm_tokens_used=tokens_used
            )
            self.db.add(score)
            score_records.append(score)

        self.db.commit()

        # Refresh all to get IDs
        for score in score_records:
            self.db.refresh(score)

        return score_records

    def generate_recommendations(
            self,
            context_id: int,
            scores: List[TaskPriorityScore]
    ) -> TaskPriorityRecommendation:
        """
        Generate Top 10 recommendations from scores.

        Logic:
        1. Sort tasks by top10_likelihood (descending)
        2. Select top 10 candidates
        3. Compare with current Top 10
        4. Generate diff-based recommendations (add/remove/keep)

        This diff-based approach is crucial for trust - we don't
        wholesale replace the Top 10, we suggest specific changes.
        """
        # Get context to find current Top 10
        context = self.db.query(TaskPrioritizationContext).get(context_id)
        current_top10_ids = set(context.tasks_in_top10 or [])

        # Sort scores by likelihood (highest first)
        sorted_scores = sorted(
            scores,
            key=lambda s: s.top10_likelihood,
            reverse=True
        )

        # Select top 10 candidates
        recommended = sorted_scores[:10]
        recommended_ids = {s.task_id for s in recommended}

        # Calculate changes (set operations)
        to_add = recommended_ids - current_top10_ids
        to_remove = current_top10_ids - recommended_ids
        to_keep = current_top10_ids & recommended_ids

        # Format recommendation data with task details
        recommended_top10 = []
        for idx, s in enumerate(recommended):
            # Fetch task details
            task = self.db.query(Task).get(s.task_id)
            recommended_top10.append({
                "task_id": s.task_id,
                "title": task.title if task else f"Task #{s.task_id}",
                "notes": task.notes if task else None,
                "priority": task.priority if task else None,
                "project": task.project if task else None,
                "score": float(s.top10_likelihood),
                "reason": s.primary_reason,
                "risk_if_ignored": s.risk_if_ignored,
                "confidence": s.confidence,
                "position": idx + 1
            })

        changes = {
            "add": list(to_add),
            "remove": list(to_remove),
            "keep": list(to_keep)
        }

        # Save recommendation
        recommendation = TaskPriorityRecommendation(
            context_id=context_id,
            user_number=context.user_number,
            recommended_top10=recommended_top10,
            changes_from_current=changes
        )

        self.db.add(recommendation)
        self.db.commit()
        self.db.refresh(recommendation)

        return recommendation

    def record_user_decision(
            self,
            recommendation_id: int,
            task_id: int,
            user_number: str,
            action_recommended: str,
            llm_score: float,
            llm_reason: str,
            user_action: str,
            user_reason: Optional[str] = None
    ) -> TaskPriorityDecision:
        """
        Record user's decision on a recommendation.

        This is CRITICAL for learning. Every decision teaches us
        about the user's prioritization preferences.

        Args:
            recommendation_id: ID of the recommendation
            task_id: Task being decided on
            user_number: User identifier
            action_recommended: What we recommended ("add", "remove", "keep")
            llm_score: Score we gave this task (0.00-1.00)
            llm_reason: Why we scored it this way
            user_action: User's choice ("accept", "reject", "replace", "skip")
            user_reason: Optional explanation of why they disagreed
        """
        # Snapshot task state at decision time
        task = self.db.query(Task).get(task_id)
        task_snapshot = {
            "title": task.title,
            "priority": task.priority,
            "due_date": task.due_date.isoformat() if task.due_date else None,
            "project": task.project,
            "goal_id": task.goal_id,
            "delegated_to": task.delegated_to,
            "times_postponed": task.times_postponed,
            "created_at": task.created_at.isoformat(),
            "notes": task.notes
        }

        decision = TaskPriorityDecision(
            recommendation_id=recommendation_id,
            task_id=task_id,
            user_number=user_number,
            action_recommended=action_recommended,
            llm_score=llm_score,
            llm_reason=llm_reason,
            user_action=user_action,
            user_reason=user_reason,
            task_state_snapshot=task_snapshot
        )

        self.db.add(decision)
        self.db.commit()
        self.db.refresh(decision)

        return decision

    def apply_approved_changes(
            self,
            user_number: str,
            approved_adds: List[int],
            approved_removes: List[int]
    ) -> Dict:
        """
        Apply user-approved changes to Top 10.

        Process:
        1. Remove approved removals from Top 10
        2. Add approved additions to Top 10
        3. Assign positions to maintain order
        4. Update last_prioritized_at timestamp

        Returns:
            Summary of changes applied
        """
        now = datetime.now(ET)

        # Remove approved removals
        if approved_removes:
            removed = self.db.query(Task).filter(
                Task.id.in_(approved_removes)
            ).update({
                "in_top10": False,
                "top10_position": None,
                "last_prioritized_at": now
            }, synchronize_session=False)
        else:
            removed = 0

        # Get current Top 10 (after removals) to find next position
        current_top10 = self.db.query(Task).filter(
            Task.user_number == user_number,
            Task.in_top10 == True,
            Task.status == "open"
        ).order_by(Task.top10_position).all()

        # Add approved additions
        added = 0
        position = len(current_top10) + 1
        for task_id in approved_adds:
            task = self.db.query(Task).get(task_id)
            if task:
                task.in_top10 = True
                task.top10_position = position
                task.last_prioritized_at = now
                position += 1
                added += 1

        self.db.commit()

        return {
            "added": added,
            "removed": removed,
            "current_top10_count": len(current_top10) + added
        }

    def get_recent_context_snapshots(
            self,
            user_number: str,
            limit: int = 10
    ) -> List[TaskPrioritizationContext]:
        """Get recent prioritization runs for history view."""
        return self.db.query(TaskPrioritizationContext).filter(
            TaskPrioritizationContext.user_number == user_number
        ).order_by(
            desc(TaskPrioritizationContext.snapshot_at)
        ).limit(limit).all()

    def get_decision_analytics(self, user_number: str) -> Dict:
        """
        Get learning insights from user decisions.

        Useful for:
        - Understanding acceptance patterns
        - Debugging LLM scoring
        - Planning future ML features
        """
        decisions = self.db.query(TaskPriorityDecision).filter(
            TaskPriorityDecision.user_number == user_number
        ).all()

        if not decisions:
            return {
                "total_decisions": 0,
                "message": "No decisions recorded yet"
            }

        total = len(decisions)
        accepted = len([d for d in decisions if d.user_action == "accept"])
        rejected = len([d for d in decisions if d.user_action == "reject"])
        replaced = len([d for d in decisions if d.user_action == "replace"])
        skipped = len([d for d in decisions if d.user_action == "skip"])

        accepted_scores = [float(d.llm_score) for d in decisions if d.user_action == "accept" and d.llm_score]
        rejected_scores = [float(d.llm_score) for d in decisions if d.user_action == "reject" and d.llm_score]

        return {
            "total_decisions": total,
            "acceptance_rate": accepted / total if total > 0 else 0,
            "rejection_rate": rejected / total if total > 0 else 0,
            "decisions_by_action": {
                "accept": accepted,
                "reject": rejected,
                "replace": replaced,
                "skip": skipped
            },
            "average_llm_score_accepted": sum(accepted_scores) / len(accepted_scores) if accepted_scores else 0,
            "average_llm_score_rejected": sum(rejected_scores) / len(rejected_scores) if rejected_scores else 0,
            "score_differential": (
                    (sum(accepted_scores) / len(accepted_scores) if accepted_scores else 0) -
                    (sum(rejected_scores) / len(rejected_scores) if rejected_scores else 0)
            )
        }
