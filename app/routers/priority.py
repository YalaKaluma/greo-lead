# app/routers/priority.py
"""
Priority API Router: Endpoints for task prioritization system.

Endpoints:
- POST /api/priority/run - Run full prioritization (context → scoring → recommendations)
- POST /api/priority/decision - Record user decision on recommendation
- POST /api/priority/apply - Apply user-approved changes to Top 10
- GET /api/priority/history - View past prioritization runs
- GET /api/priority/learning-insights - Analytics on user decisions
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel, Field

from app.db import get_db
from app.services.priority_service import PriorityService
from app.services.priority_llm_service import PriorityLLMService
from app.models import Task
from app.utils.safe_errors import internal_error

router = APIRouter(tags=["priority"])


# ============================================================================
# Pydantic Request/Response Models
# ============================================================================

class PriorityRunRequest(BaseModel):
    """Request to run prioritization."""
    user_number: str = Field(..., description="User identifier (phone number or email)")


class PriorityBackfillRequest(BaseModel):
    """Request to score visible tasks that missed today's MTN run."""
    user_number: str = Field(..., description="User identifier (phone number or email)")
    task_ids: List[int] = Field(default_factory=list, description="Visible open task IDs to check")
    max_tasks: int = Field(50, ge=1, le=100, description="Safety limit for one background catch-up pass")


class PriorityBackfillResponse(BaseModel):
    """Response from background MTN scoring catch-up."""
    requested: int
    eligible: int
    already_scored: int
    scored: int
    skipped: int
    tokens_used: int
    message: str
    context_id: Optional[int] = None
    task_ids: List[int] = Field(default_factory=list)


class PriorityRunResponse(BaseModel):
    """Response from prioritization run."""
    context_id: int
    recommendation_id: int
    current_top10: List[int]
    recommended_changes: dict
    recommended_top10: List[dict]
    all_scored_tasks: List[dict]  # NEW: All tasks scored, sorted by score
    tokens_used: int
    message: str
    prioritized_at: Optional[str] = None
    top_mtn_tasks: List[dict] = Field(default_factory=list)


class UserDecisionRequest(BaseModel):
    """Request to record user decision."""
    recommendation_id: int
    task_id: int
    user_number: str
    user_action: str = Field(..., description="One of: accept, reject, replace, skip")
    user_reason: Optional[str] = Field(None, description="Optional: why they made this choice")


class PriorityFeedbackRequest(BaseModel):
    """Request to record MTN tag feedback."""
    recommendation_id: Optional[int] = None
    score_id: Optional[int] = None
    task_id: int
    user_number: str
    rating: int = Field(..., ge=1, le=5, description="User feedback rating from 1 to 5 stars")
    tag: str = Field(..., description="MTN label shown to the user")
    feedback: Optional[str] = Field(None, description="Optional user explanation")
    adjusted_score: float = Field(..., ge=0, le=1, description="User-selected absolute MTN score")


class ApplyChangesRequest(BaseModel):
    """Request to apply approved changes."""
    user_number: str
    approved_adds: List[int] = Field(default_factory=list)
    approved_removes: List[int] = Field(default_factory=list)


class ApplyChangesResponse(BaseModel):
    """Response from applying changes."""
    message: str
    added: int
    removed: int
    current_top10_count: int


# ============================================================================
# API Endpoints
# ============================================================================

@router.post("/run", response_model=PriorityRunResponse)
def run_prioritization(
        request: PriorityRunRequest,
        db: Session = Depends(get_db)
):
    """
    Run complete prioritization: context → scoring → recommendations.

    Process:
    1. Create immutable context snapshot
    2. Get all open tasks for scoring
    3. Score tasks with LLM (GPT-4o)
    4. Generate recommendations (add/remove/keep)
    5. Return results for user review

    Returns:
        Complete recommendation with LLM scores and suggested changes
    """
    priority_service = PriorityService(db)
    llm_service = PriorityLLMService()

    try:
        context, recommendation, scores, tokens_used = priority_service.run_prioritization(
            user_number=request.user_number,
            llm_service=llm_service
        )

        if not recommendation or not scores:
            raise HTTPException(
                status_code=404,
                detail="No open tasks found. Create some tasks first!"
            )

        serialized = priority_service.serialize_recommendation(recommendation, context, scores)
        changes = recommendation.changes_from_current
        num_changes = len(changes["add"]) + len(changes["remove"])

        return PriorityRunResponse(
            context_id=context.id,
            recommendation_id=recommendation.id,
            current_top10=context.tasks_in_top10 or [],
            recommended_changes=changes,
            recommended_top10=recommendation.recommended_top10,
            all_scored_tasks=serialized["all_scored_tasks"],
            tokens_used=tokens_used,
            message=f"Analyzed {len(scores)} tasks. Suggesting {num_changes} changes to your Top 10.",
            prioritized_at=serialized["prioritized_at"],
            top_mtn_tasks=serialized["top_mtn_tasks"]
        )

    except Exception as e:
        raise internal_error("priority_run", e, "Prioritization could not be completed.")


@router.post("/backfill-task-scores", response_model=PriorityBackfillResponse)
def backfill_task_scores(
        request: PriorityBackfillRequest,
        db: Session = Depends(get_db)
):
    """
    Score visible open tasks that do not yet have today's MTN score.

    This is used by the To-Do List after load/create/update so tasks added
    after the morning run still get an MTN lens without slowing down saving.
    """
    priority_service = PriorityService(db)
    llm_service = PriorityLLMService()

    try:
        return priority_service.backfill_task_scores_for_today(
            user_number=request.user_number,
            task_ids=request.task_ids,
            llm_service=llm_service,
            max_tasks=request.max_tasks
        )

    except Exception as e:
        raise internal_error("priority_mtn_backfill", e, "The MTN backfill could not be completed.")


@router.get("/latest")
def get_latest_prioritization(
        user_number: str = Query(..., description="User identifier"),
        db: Session = Depends(get_db)
):
    """
    Return today's stored MTN prioritization without running the LLM.
    """
    priority_service = PriorityService(db)

    try:
        recommendation = priority_service.get_latest_recommendation_for_today(user_number)
        if not recommendation:
            return {
                "has_prioritization": False,
                "message": "No MTN prioritization has been stored for today."
            }

        serialized = priority_service.serialize_recommendation(recommendation)
        return {
            "has_prioritization": True,
            **serialized
        }

    except Exception as e:
        raise internal_error("priority_latest", e, "Prioritization data could not be loaded.")


@router.post("/decision")
def record_decision(
        request: UserDecisionRequest,
        db: Session = Depends(get_db)
):
    """
    Record user's decision on a recommendation.

    This is CRITICAL for learning user preferences.
    Every accept/reject teaches us about their prioritization criteria.

    Args:
        request: Contains recommendation_id, task_id, user_action, optional reason

    Returns:
        Confirmation with decision ID
    """
    priority_service = PriorityService(db)

    # Validate user_action
    valid_actions = {"accept", "reject", "replace", "skip"}
    if request.user_action not in valid_actions:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid user_action. Must be one of: {valid_actions}"
        )

    try:
        # Get the recommendation to find the LLM's reasoning
        from app.models import TaskPriorityRecommendation
        recommendation = db.query(TaskPriorityRecommendation).get(request.recommendation_id)

        if not recommendation:
            raise HTTPException(status_code=404, detail="Recommendation not found")

        # Find this task in ALL scored tasks (not just top 10)
        # We now show all tasks, so we need to check all_scored_tasks
        from app.models import TaskPriorityScore
        task_score = db.query(TaskPriorityScore).filter(
            TaskPriorityScore.context_id == recommendation.context_id,
            TaskPriorityScore.task_id == request.task_id
        ).first()

        if not task_score:
            raise HTTPException(status_code=404, detail="Task not in this prioritization run")

        # Determine what action was recommended
        changes = recommendation.changes_from_current
        if request.task_id in changes["add"]:
            action_recommended = "add"
        elif request.task_id in changes["remove"]:
            action_recommended = "remove"
        elif request.task_id in changes["keep"]:
            action_recommended = "keep"
        else:
            action_recommended = "unknown"

        # Record decision
        decision = priority_service.record_user_decision(
            recommendation_id=request.recommendation_id,
            task_id=request.task_id,
            user_number=request.user_number,
            action_recommended=action_recommended,
            llm_score=float(task_score.top10_likelihood),
            llm_reason=task_score.primary_reason,
            user_action=request.user_action,
            user_reason=request.user_reason
        )

        return {
            "decision_id": decision.id,
            "message": "Decision recorded successfully",
            "action": request.user_action
        }

    except HTTPException:
        raise
    except Exception as e:
        raise internal_error("priority_decision", e, "The decision could not be recorded.")


@router.post("/feedback")
def record_priority_feedback(
        request: PriorityFeedbackRequest,
        db: Session = Depends(get_db)
):
    """
    Record user feedback on an MTN tag.

    This keeps MTN as a lightweight lens while still capturing learning data
    for future scoring improvements.
    """
    priority_service = PriorityService(db)

    try:
        from app.models import TaskMtnFeedback, TaskPriorityRecommendation, TaskPriorityScore

        task_score = None
        if request.score_id:
            task_score = db.query(TaskPriorityScore).filter(
                TaskPriorityScore.id == request.score_id,
                TaskPriorityScore.task_id == request.task_id,
                TaskPriorityScore.user_number == request.user_number,
            ).first()
        elif request.recommendation_id:
            recommendation = db.query(TaskPriorityRecommendation).get(request.recommendation_id)
            if recommendation:
                task_score = db.query(TaskPriorityScore).filter(
                    TaskPriorityScore.context_id == recommendation.context_id,
                    TaskPriorityScore.task_id == request.task_id
                ).first()
        if not task_score:
            task_score = db.query(TaskPriorityScore).filter(
                TaskPriorityScore.task_id == request.task_id,
                TaskPriorityScore.user_number == request.user_number,
            ).order_by(TaskPriorityScore.scored_at.desc()).first()
        if not task_score:
            raise HTTPException(status_code=404, detail="No MTN score found for this task")

        task = db.query(Task).filter(Task.id == request.task_id, Task.user_number == request.user_number).first()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        correction = TaskMtnFeedback(
            score_id=task_score.id,
            task_id=request.task_id,
            user_number=request.user_number,
            original_score=float(task_score.top10_likelihood),
            adjusted_score=request.adjusted_score,
            selected_tag=request.tag,
            rating=request.rating,
            feedback=request.feedback,
        )
        db.add(correction)
        task_score.top10_likelihood = request.adjusted_score
        task.move_the_needle_score = request.adjusted_score
        db.commit()
        db.refresh(correction)

        return {
            "feedback_id": correction.id,
            "adjusted_score": request.adjusted_score,
            "message": "MTN feedback recorded successfully"
        }

    except HTTPException:
        raise
    except Exception as e:
        raise internal_error("priority_mtn_feedback", e, "The feedback could not be recorded.")


@router.post("/apply", response_model=ApplyChangesResponse)
def apply_changes(
        request: ApplyChangesRequest,
        db: Session = Depends(get_db)
):
    """
    Apply user-approved changes to Top 10.

    Updates:
    - task.in_top10 (True/False)
    - task.top10_position (1-10 or NULL)
    - task.last_prioritized_at (timestamp)

    Args:
        request: Lists of task IDs to add and remove

    Returns:
        Summary of changes applied
    """
    priority_service = PriorityService(db)

    try:
        result = priority_service.apply_approved_changes(
            user_number=request.user_number,
            approved_adds=request.approved_adds,
            approved_removes=request.approved_removes
        )

        return ApplyChangesResponse(
            message="Top 10 updated successfully",
            added=result["added"],
            removed=result["removed"],
            current_top10_count=result["current_top10_count"]
        )

    except Exception as e:
        raise internal_error("priority_apply", e, "The changes could not be applied.")


@router.get("/history")
def get_prioritization_history(
        user_number: str = Query(..., description="User identifier"),
        limit: int = Query(10, ge=1, le=50, description="Number of runs to return"),
        db: Session = Depends(get_db)
):
    """
    Get recent prioritization runs for a user.

    Useful for showing:
    - "Last reviewed: X days ago"
    - History of prioritization sessions
    - Frequency of use

    Returns:
        List of context snapshots with timestamps
    """
    priority_service = PriorityService(db)

    try:
        contexts = priority_service.get_recent_context_snapshots(
            user_number=user_number,
            limit=limit
        )

        return {
            "runs": [
                {
                    "context_id": c.id,
                    "snapshot_at": c.snapshot_at.isoformat(),
                    "total_tasks": c.total_open_tasks,
                    "top10_count": len(c.tasks_in_top10 or []),
                    "day_of_week": c.day_of_week,
                    "overdue_tasks": c.overdue_tasks
                }
                for c in contexts
            ],
            "total_runs": len(contexts)
        }

    except Exception as e:
        raise internal_error("priority_history", e, "Prioritization history could not be loaded.")


@router.get("/learning-insights")
def get_learning_insights(
        user_number: str = Query(..., description="User identifier"),
        db: Session = Depends(get_db)
):
    """
    Get insights from user decisions (for debugging/future ML).

    Returns analytics on:
    - Acceptance vs rejection rates
    - Average LLM scores for accepted/rejected tasks
    - Decision patterns

    This data is crucial for:
    - Iterating on LLM prompts
    - Understanding user preferences
    - Planning ML features
    """
    priority_service = PriorityService(db)

    try:
        analytics = priority_service.get_decision_analytics(user_number)
        return analytics

    except Exception as e:
        raise internal_error("priority_insights", e, "Prioritization insights could not be loaded.")


@router.get("/health")
def health_check():
    """Health check endpoint for monitoring."""
    return {
        "status": "healthy",
        "service": "priority_system",
        "version": "1.0.0"
    }
