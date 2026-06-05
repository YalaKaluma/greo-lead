# app/routers/leadership_coaching.py
"""
Leadership Coaching API Router
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.db import get_db
from app.services.leadership_coaching_service import LeadershipCoachingService
from app.services.leadership_coaching_orchestrator import orchestrate_leadership_coaching
from app.services.message_service import save_message
from app.models import User
from app.services.language import normalize_language
from typing import Optional
from pydantic import BaseModel

router = APIRouter()


# ============================================================
# REQUEST/RESPONSE MODELS
# ============================================================

class StartSessionRequest(BaseModel):
    user_number: str
    quadrant: str


class SessionMessageRequest(BaseModel):
    user_number: str
    message: str
    preferred_language: Optional[str] = None


# ============================================================
# ENDPOINTS
# ============================================================

@router.get("/quadrants")
def get_quadrants():
    """Get the 5 leadership quadrants for selection"""
    return {
        "quadrants": LeadershipCoachingService.get_quadrants()
    }


@router.post("/start")
def start_session(
    request: StartSessionRequest,
    db: Session = Depends(get_db)
):
    """Start a new leadership coaching session with selected quadrant"""
    try:
        session = LeadershipCoachingService.create_session(
            db=db,
            user_number=request.user_number,
            quadrant=request.quadrant
        )
        
        quadrants = LeadershipCoachingService.get_quadrants()
        quadrant_info = quadrants.get(request.quadrant)
        
        return {
            "success": True,
            "session_id": session.id,
            "message": f"Started {quadrant_info['name']} coaching session"
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/message")
def process_message(
    request: SessionMessageRequest,
    db: Session = Depends(get_db)
):
    """Process a message in the coaching conversation"""
    try:
        save_message(
            db=db,
            sender="user",
            user_number=request.user_number,
            content=request.message,
            message_type="leadership_coaching",
            conversation_type="leadership_coaching",
        )
        result = orchestrate_leadership_coaching(
            db=db,
            user_number=request.user_number,
            user_message=request.message,
            preferred_language=normalize_language(
                request.preferred_language
                or getattr(db.query(User).filter(User.phone_number == request.user_number).first(), "language_preference", None)
            )
        )
        assistant_message = save_message(
            db=db,
            sender="assistant",
            user_number=request.user_number,
            content=result["response"],
            message_type="leadership_coaching",
            conversation_type="leadership_coaching",
        )
        
        return {
            "success": True,
            "response": result["response"],
            "message_id": assistant_message.id,
            "session_id": result.get("session_id"),
            "completed": result.get("completed", False),
            "next_phase": result.get("next_phase")
        }
    except Exception as e:
        print(f"❌ Error in leadership coaching: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/active")
def get_active_session(
    user_number: str = Query(...),
    db: Session = Depends(get_db)
):
    """Get the user's active (incomplete) session"""
    session = LeadershipCoachingService.get_active_session(db, user_number)
    
    if not session:
        return {"active": False, "session": None}
    
    return {
        "active": True,
        "session": {
            "id": session.id,
            "quadrant": session.quadrant,
            "session_date": session.session_date.isoformat(),
            "has_situation": bool(session.situation),
            "has_reflection": bool(session.reflection),
            "has_pattern": bool(session.pattern),
            "has_experiment": bool(session.experiment)
        }
    }


@router.get("/history")
def get_session_history(
    user_number: str = Query(...),
    db: Session = Depends(get_db)
):
    """Get all completed sessions for user"""
    sessions = LeadershipCoachingService.get_all_sessions(db, user_number)
    
    return {
        "sessions": [
            {
                "id": s.id,
                "quadrant": s.quadrant,
                "session_date": s.session_date.isoformat(),
                "completed_at": s.completed_at.isoformat() if s.completed_at else None,
                "situation": s.situation,
                "pattern": s.pattern,
                "experiment": s.practice,
                "development_level": s.development_level,
                "insights": s.insights
            }
            for s in sessions
        ]
    }


@router.get("/stats")
def get_quadrant_stats(
    user_number: str = Query(...),
    db: Session = Depends(get_db)
):
    """Get statistics on which quadrants have been worked on"""
    stats = LeadershipCoachingService.get_quadrant_stats(db, user_number)
    return stats


@router.delete("/session/{session_id}")
def delete_session(
    session_id: int,
    user_number: str = Query(...),
    db: Session = Depends(get_db)
):
    """Delete a session"""
    success = LeadershipCoachingService.delete_session(db, session_id)
    
    if not success:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return {"success": True, "message": "Session deleted"}
