# app/routers/priority.py
"""
Priority API Router: Endpoints for task prioritization system.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel, Field

from app.db import get_db
from app.services.priority_service import PriorityService
from app.services.priority_llm_service import PriorityLLMService
from app.models import Task

# ⚠️ IMPORTANT: No prefix here - it's added during registration
router = APIRouter(tags=["priority"])


# ============================================================================
# Pydantic Request/Response Models
# ============================================================================

class PriorityRunRequest(BaseModel):
    """Request to run prioritization."""
    user_number: str = Field(..., description="User identifier (phone number or email)")


class PriorityRunResponse(BaseModel):
    """Response from prioritization run."""
    context_id: int
    recommendation_id: int
    current_top10: List[int]
    recommended_changes: dict
    recommended_top10: List[dict]
    tokens_used: int
    message: str


class UserDecisionRequest(BaseModel):
    """Request to record user decision."""
    recommendation_id: int
    task_id: int
    user_number: str
    user_action: str = Field(..., description="One of: accept, reject, replace, skip")
    user_reason: Optional[str] = Field(None, description="Optional: why they made this choice")


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
    """Run complete prioritization: context → scoring → recommendations."""
    priority_service = PriorityService(db)
    llm_service = PriorityLLMService()

    try:
        context = priority_service.create_context_snapshot(request.user_number)
        tasks = priority_service.get_tasks_for_scoring(request.user_number)

        if not tasks:
            raise HTTPException(
                status_code=404,
                detail="No open tasks found. Create some tasks first!"
            )

        llm_result = llm_service.score_tasks(tasks, context)

        scores = priority_service.save_priority_scores(
            context_id=context.id,
            scores=llm_result["scores"],
            llm_model="gpt-4o",
            tokens_used=llm_result["tokens_used"]
        )

        recommendation = priority_service.generate_recommendations(
            context_id=context.id,
            scores=scores
        )

        changes = recommendation.changes_from_current
        num_changes = len(changes["add"]) + len(changes["remove"])

        return PriorityRunResponse(
            context_id=context.id,
            recommendation_id=recommendation.id,
            current_top10=context.tasks_in_top10 or [],
            recommended_changes=changes,
            recommended_top10=recommendation.recommended_top10,
            tokens_used=llm_result["tokens_used"],
            message=f"Analyzed {len(tasks)} tasks. Suggesting {num_changes} changes to your Top 10."
        )

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Prioritization failed: {str(e)}"
        )


@router.post("/decision")
def record_decision(
        request: UserDecisionRequest,
        db: Session = Depends(get_db)
):
    """Record user's decision on a recommendation."""
    priority_service = PriorityService(db)

    valid_actions = {"accept", "reject", "replace", "skip"}
    if request.user_action not in valid_actions:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid user_action. Must be one of: {valid_actions}"
        )

    try:
        from app.models import TaskPriorityRecommendation
        recommendation = db.query(TaskPriorityRecommendation).get(request.recommendation_id)

        if not recommendation:
            raise HTTPException(status_code=404, detail="Recommendation not found")

        task_rec = next(
            (t for t in recommendation.recommended_top10 if t["task_id"] == request.task_id),
            None
        )

        if not task_rec:
            raise HTTPException(status_code=404, detail="Task not in recommendation")

        changes = recommendation.changes_from_current
        if request.task_id in changes["add"]:
            action_recommended = "add"
        elif request.task_id in changes["remove"]:
            action_recommended = "remove"
        elif request.task_id in changes["keep"]:
            action_recommended = "keep"
        else:
            action_recommended = "unknown"

        decision = priority_service.record_user_decision(
            recommendation_id=request.recommendation_id,
            task_id=request.task_id,
            user_number=request.user_number,
            action_recommended=action_recommended,
            llm_score=task_rec["score"],
            llm_reason=task_rec["reason"],
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
        raise HTTPException(
            status_code=500,
            detail=f"Failed to record decision: {str(e)}"
        )


@router.post("/apply", response_model=ApplyChangesResponse)
def apply_changes(
        request: ApplyChangesRequest,
        db: Session = Depends(get_db)
):
    """Apply user-approved changes to Top 10."""
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
        raise HTTPException(
            status_code=500,
            detail=f"Failed to apply changes: {str(e)}"
        )


@router.get("/history")
def get_prioritization_history(
        user_number: str = Query(..., description="User identifier"),
        limit: int = Query(10, ge=1, le=50, description="Number of runs to return"),
        db: Session = Depends(get_db)
):
    """Get recent prioritization runs for a user."""
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
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch history: {str(e)}"
        )


@router.get("/learning-insights")
def get_learning_insights(
        user_number: str = Query(..., description="User identifier"),
        db: Session = Depends(get_db)
):
    """Get insights from user decisions for debugging/future ML."""
    priority_service = PriorityService(db)

    try:
        analytics = priority_service.get_decision_analytics(user_number)
        return analytics

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch insights: {str(e)}"
        )


@router.get("/health")
def health_check():
    """Health check endpoint for monitoring."""
    return {
        "status": "healthy",
        "service": "priority_system",
        "version": "1.0.0"
    }