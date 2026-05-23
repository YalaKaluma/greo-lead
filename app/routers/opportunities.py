from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import Optional

from app.db import get_db
from app.models import User
from app.services.opportunity import accept_opportunity, decline_opportunity, get_best_opportunities

router = APIRouter()


class GenerateOpportunitiesRequest(BaseModel):
    user_number: str = Field(..., description="User identifier")
    surface: str = "task_page"
    type: str = "task"
    limit: int = Field(3, ge=1, le=5)


class DeclineOpportunityRequest(BaseModel):
    user_number: str
    reason: Optional[str] = None


class AcceptOpportunityRequest(BaseModel):
    user_number: str


def _get_user_id(db: Session, user_number: str) -> int:
    user = db.query(User).filter(User.phone_number == user_number).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user.id


@router.post("/generate")
def generate_opportunities(
    request: GenerateOpportunitiesRequest,
    db: Session = Depends(get_db),
):
    try:
        user_id = _get_user_id(db, request.user_number)
        opportunities = get_best_opportunities(
            user_id=user_id,
            surface=request.surface,
            opportunity_type=request.type,
            limit=request.limit,
            db=db,
        )
        return {"opportunities": opportunities}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate opportunities: {str(e)}")


@router.post("/{opportunity_id}/accept")
def accept_suggestion(
    opportunity_id: int,
    request: AcceptOpportunityRequest,
    db: Session = Depends(get_db),
):
    try:
        user_id = _get_user_id(db, request.user_number)
        return accept_opportunity(db, user_id, opportunity_id)
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to accept opportunity: {str(e)}")


@router.post("/{opportunity_id}/decline")
def decline_suggestion(
    opportunity_id: int,
    request: DeclineOpportunityRequest,
    db: Session = Depends(get_db),
):
    try:
        user_id = _get_user_id(db, request.user_number)
        return decline_opportunity(db, user_id, opportunity_id, request.reason)
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to decline opportunity: {str(e)}")
