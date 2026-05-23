from datetime import date, datetime
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models import OpportunitySuggestion, Task, User
from app.services.opportunity.context_builder import build_opportunity_context
from app.services.opportunity.opportunity_feedback import mark_opportunity_declined
from app.services.opportunity.opportunity_generator import generate_candidate_opportunities
from app.services.opportunity.opportunity_scorer import score_opportunities_with_mtn
from app.services.opportunity.opportunity_selector import select_top_opportunities


def _serialize_opportunity(suggestion: OpportunitySuggestion) -> Dict[str, Any]:
    return {
        "id": str(suggestion.id),
        "user_id": suggestion.user_id,
        "surface": suggestion.surface,
        "type": suggestion.type,
        "title": suggestion.title,
        "description": suggestion.description,
        "rationale": suggestion.rationale,
        "domain": suggestion.domain,
        "linked_goal_id": suggestion.linked_goal_id,
        "mtn_score": float(suggestion.mtn_score) if suggestion.mtn_score is not None else None,
        "status": suggestion.status,
        "created_task_id": suggestion.created_task_id,
        "created_at": suggestion.created_at.isoformat() if suggestion.created_at else None,
    }


def persist_opportunity_suggestions(
    user_id: int,
    selected: List[Dict[str, Any]],
    surface: str,
    opportunity_type: str,
    context: Dict[str, Any],
    db: Session,
) -> List[OpportunitySuggestion]:
    records = []
    for item in selected:
        linked_goal_id = item.get("linked_goal_id")
        if linked_goal_id in ("", "null"):
            linked_goal_id = None

        suggestion = OpportunitySuggestion(
            user_id=user_id,
            surface=surface,
            type=opportunity_type,
            title=item["title"],
            description=item.get("description"),
            rationale=item.get("rationale"),
            domain=item.get("domain"),
            linked_goal_id=linked_goal_id,
            mtn_score=item.get("mtn_score"),
            status="suggested",
            generated_context=context,
            scoring_details=item.get("scoring_details"),
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(suggestion)
        records.append(suggestion)

    db.commit()
    for record in records:
        db.refresh(record)
    return records


def get_best_opportunities(
    user_id: int,
    surface: str,
    opportunity_type: str = "task",
    limit: int = 3,
    db: Optional[Session] = None,
):
    if db is None:
        raise ValueError("A database session is required")

    context = build_opportunity_context(user_id, surface, db)
    candidates = generate_candidate_opportunities(context, opportunity_type, n=10)
    scored_candidates = score_opportunities_with_mtn(candidates, context)
    selected = select_top_opportunities(scored_candidates, limit=limit)
    records = persist_opportunity_suggestions(
        user_id=user_id,
        selected=selected,
        surface=surface,
        opportunity_type=opportunity_type,
        context=context,
        db=db,
    )
    return [_serialize_opportunity(record) for record in records]


def accept_opportunity(
    db: Session,
    user_id: int,
    opportunity_id: int,
) -> Dict[str, Any]:
    suggestion = db.query(OpportunitySuggestion).filter(
        OpportunitySuggestion.id == opportunity_id,
        OpportunitySuggestion.user_id == user_id,
    ).first()
    if not suggestion:
        raise ValueError("Opportunity not found")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise ValueError("User not found")

    created_task = None
    if suggestion.type == "task":
        created_task = Task(
            user_number=user.phone_number,
            title=suggestion.title,
            notes=suggestion.description,
            due_date=date.today(),
            priority="High" if float(suggestion.mtn_score or 0) >= 8 else "Medium",
            status="open",
            goal_id=suggestion.linked_goal_id,
            strategic_intent=suggestion.rationale,
            move_the_needle_score=float(suggestion.mtn_score) if suggestion.mtn_score is not None else None,
            ai_enriched=True,
            originating_opportunity_id=suggestion.id,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(created_task)
        db.flush()
        suggestion.created_task_id = created_task.id
        suggestion.status = "accepted"
    else:
        suggestion.status = "accepted"

    suggestion.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(suggestion)
    if created_task:
        db.refresh(created_task)

    return {
        "opportunity": _serialize_opportunity(suggestion),
        "created_task_id": created_task.id if created_task else None,
        "message": "Opportunity accepted",
    }


def decline_opportunity(
    db: Session,
    user_id: int,
    opportunity_id: int,
    reason: Optional[str] = None,
) -> Dict[str, Any]:
    suggestion = mark_opportunity_declined(db, opportunity_id, user_id, reason)
    return {
        "opportunity": _serialize_opportunity(suggestion),
        "message": "Opportunity declined",
    }
