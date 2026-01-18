# app/services/priority_service.py
"""
Priority Service: Core business logic for task prioritization.

Handles:
- Context snapshot creation (immutable records)
- Task scoring and recommendation generation
- User decision recording (critical for learning)
- Top 10 management and updates
"""

from datetime import datetime, timezone
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

ET = pytz.timezone("America/New_York")


class PriorityService:
    """Service for task prioritization recommendations."""
    
    def __init__(self, db: Session):
        self.db = db
    
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
        now = datetime.now(ET)
        
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
        overdue = len([t for t in open_tasks if t.due_date and t.due_date < now])
        
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
            JourneyGoal.time_horizon == horizon
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
        Get all open tasks that need prioritization scoring.
        
        Includes:
        - Tasks currently in Top 10 (to validate they should stay)
        - All other open tasks (to find new candidates)
        
        Ordered by:
        1. Due date (nulls last)
        2. Created date (newest first)
        """
        return self.db.query(Task).filter(
            Task.user_number == user_number,
            Task.status == "open"
        ).order_by(
            Task.due_date.nullslast(),
            desc(Task.created_at)
        ).all()
    
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
        
        # Format recommendation data
        recommended_top10 = [
            {
                "task_id": s.task_id,
                "score": float(s.top10_likelihood),
                "reason": s.primary_reason,
                "risk_if_ignored": s.risk_if_ignored,
                "confidence": s.confidence,
                "position": idx + 1
            }
            for idx, s in enumerate(recommended)
        ]
        
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
