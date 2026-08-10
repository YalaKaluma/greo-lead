from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import Optional

from app.db import get_db
from app.models import User
from app.routers.auth import require_authenticated_user
from app.services.opportunity import accept_opportunity, decline_opportunity, get_best_opportunities
from app.utils.safe_errors import internal_error

router = APIRouter()


class GenerateOpportunitiesRequest(BaseModel):
    surface: str = "task_page"
    type: str = "task"
    limit: int = Field(3, ge=1, le=5)


class DeclineOpportunityRequest(BaseModel):
    reason: Optional[str] = None


class AcceptOpportunityRequest(BaseModel):
    pass


@router.post("/generate")
def generate_opportunities(
    request: GenerateOpportunitiesRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authenticated_user),
):
    try:
        opportunities = get_best_opportunities(
            user_id=current_user.id,
            surface=request.surface,
            opportunity_type=request.type,
            limit=request.limit,
            db=db,
        )
        return {"opportunities": opportunities}
    except HTTPException:
        raise
    except Exception as e:
        raise internal_error("opportunity_generate", e, "Failed to generate opportunities.")


@router.post("/{opportunity_id}/accept")
def accept_suggestion(
    opportunity_id: int,
    request: AcceptOpportunityRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authenticated_user),
):
    try:
        return accept_opportunity(db, current_user.id, opportunity_id)
    except HTTPException:
        raise
    except ValueError:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    except Exception as e:
        raise internal_error("opportunity_accept", e, "Failed to accept opportunity.")


@router.post("/{opportunity_id}/decline")
def decline_suggestion(
    opportunity_id: int,
    request: DeclineOpportunityRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authenticated_user),
):
    try:
        return decline_opportunity(db, current_user.id, opportunity_id, request.reason)
    except HTTPException:
        raise
    except ValueError:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    except Exception as e:
        raise internal_error("opportunity_decline", e, "Failed to decline opportunity.")
