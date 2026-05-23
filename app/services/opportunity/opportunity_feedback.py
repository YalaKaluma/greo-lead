from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.models import OpportunitySuggestion


def mark_opportunity_declined(
    db: Session,
    opportunity_id: int,
    user_id: int,
    reason: Optional[str] = None,
) -> OpportunitySuggestion:
    suggestion = db.query(OpportunitySuggestion).filter(
        OpportunitySuggestion.id == opportunity_id,
        OpportunitySuggestion.user_id == user_id,
    ).first()
    if not suggestion:
        raise ValueError("Opportunity not found")

    suggestion.status = "declined"
    suggestion.user_feedback = reason
    suggestion.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(suggestion)
    return suggestion
