# app/services/leadership_coaching_service.py
"""
Leadership Coaching Service - CRUD operations for leadership development sessions
"""

from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from app.models import LeadershipCoachingSession

# The 5 quadrants of the Alfred Leadership Model
LEADERSHIP_QUADRANTS = {
    "vision_goals": {
        "name": "Vision & Goals",
        "icon": "🎯",
        "description": "Your direction and purpose",
        "facets": ["Values", "Strengths", "Goals", "Team Composition"]
    },
    "people": {
        "name": "People",
        "icon": "👥", 
        "description": "Leading, inspiring, and developing others",
        "facets": ["Inspire", "Coach & Delegate"]
    },
    "prioritize_execute": {
        "name": "Prioritize & Execute",
        "icon": "⚡",
        "description": "Getting things done effectively",
        "facets": ["Prioritization", "Execution System", "Procrastination"]
    },
    "learning_development": {
        "name": "Learning & Development",
        "icon": "📚",
        "description": "Growing from experience",
        "facets": ["Development Plan", "Development Opportunities", "Failures & Scars"]
    },
    "time_energy": {
        "name": "Time & Energy",
        "icon": "⏰",
        "description": "Managing your capacity",
        "facets": ["Energy Sources", "Energy Drains", "Recovery"]
    }
}


class LeadershipCoachingService:
    """Service for managing leadership coaching sessions"""
    
    @staticmethod
    def get_quadrants() -> Dict[str, Any]:
        """Return the 5 leadership quadrants for selection"""
        return LEADERSHIP_QUADRANTS
    
    @staticmethod
    def create_session(db: Session, user_number: str, quadrant: str) -> LeadershipCoachingSession:
        """Create a new leadership coaching session"""
        if quadrant not in LEADERSHIP_QUADRANTS:
            raise ValueError(f"Invalid quadrant: {quadrant}")
        
        session = LeadershipCoachingSession(
            user_number=user_number,
            quadrant=quadrant,
            session_date=datetime.now(timezone.utc)
        )
        db.add(session)
        db.commit()
        db.refresh(session)
        
        print(f"✅ Created leadership coaching session {session.id} for quadrant: {quadrant}")
        return session
    
    @staticmethod
    def get_session(db: Session, session_id: int, user_number: Optional[str] = None) -> Optional[LeadershipCoachingSession]:
        """Get a specific session by ID"""
        query = db.query(LeadershipCoachingSession).filter(
            LeadershipCoachingSession.id == session_id
        )
        if user_number:
            query = query.filter(LeadershipCoachingSession.user_number == user_number)
        return query.first()
    
    @staticmethod
    def get_active_session(db: Session, user_number: str) -> Optional[LeadershipCoachingSession]:
        """Get the most recent incomplete session for user"""
        return db.query(LeadershipCoachingSession).filter(
            LeadershipCoachingSession.user_number == user_number,
            LeadershipCoachingSession.completed_at.is_(None)
        ).order_by(LeadershipCoachingSession.created_at.desc()).first()
    
    @staticmethod
    def get_all_sessions(db: Session, user_number: str) -> List[LeadershipCoachingSession]:
        """Get all sessions for a user, ordered by date desc"""
        return db.query(LeadershipCoachingSession).filter(
            LeadershipCoachingSession.user_number == user_number
        ).order_by(LeadershipCoachingSession.session_date.desc()).all()
    
    @staticmethod
    def update_session(db: Session, session_id: int, updates: Dict[str, Any]) -> LeadershipCoachingSession:
        """Update session fields"""
        session = db.query(LeadershipCoachingSession).filter(
            LeadershipCoachingSession.id == session_id
        ).first()
        
        if not session:
            raise ValueError(f"Session {session_id} not found")
        
        for key, value in updates.items():
            if hasattr(session, key):
                setattr(session, key, value)
        
        session.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(session)
        
        return session
    
    @staticmethod
    def complete_session(db: Session, session_id: int) -> LeadershipCoachingSession:
        """Mark session as completed"""
        session = db.query(LeadershipCoachingSession).filter(
            LeadershipCoachingSession.id == session_id
        ).first()
        
        if not session:
            raise ValueError(f"Session {session_id} not found")
        
        session.completed_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(session)
        
        print(f"✅ Completed leadership coaching session {session_id}")
        return session
    
    @staticmethod
    def delete_session(db: Session, session_id: int, user_number: str) -> bool:
        """Delete a session"""
        session = db.query(LeadershipCoachingSession).filter(
            LeadershipCoachingSession.id == session_id,
            LeadershipCoachingSession.user_number == user_number,
        ).first()
        
        if not session:
            return False
        
        db.delete(session)
        db.commit()
        
        print(f"✅ Deleted leadership coaching session {session_id}")
        return True
    
    @staticmethod
    def get_quadrant_history(db: Session, user_number: str, quadrant: str) -> List[LeadershipCoachingSession]:
        """Get all sessions for a specific quadrant"""
        return db.query(LeadershipCoachingSession).filter(
            LeadershipCoachingSession.user_number == user_number,
            LeadershipCoachingSession.quadrant == quadrant,
            LeadershipCoachingSession.completed_at.isnot(None)
        ).order_by(LeadershipCoachingSession.session_date.desc()).all()
    
    @staticmethod
    def get_quadrant_stats(db: Session, user_number: str) -> Dict[str, Any]:
        """Get statistics on which quadrants have been worked on"""
        sessions = db.query(LeadershipCoachingSession).filter(
            LeadershipCoachingSession.user_number == user_number,
            LeadershipCoachingSession.completed_at.isnot(None)
        ).all()
        
        stats = {
            "total_sessions": len(sessions),
            "by_quadrant": {}
        }
        
        for quadrant_key in LEADERSHIP_QUADRANTS.keys():
            quadrant_sessions = [s for s in sessions if s.quadrant == quadrant_key]
            stats["by_quadrant"][quadrant_key] = {
                "count": len(quadrant_sessions),
                "last_session": quadrant_sessions[0].session_date if quadrant_sessions else None,
                "avg_level": sum(s.development_level for s in quadrant_sessions if s.development_level) / len(quadrant_sessions) if quadrant_sessions else None
            }
        
        return stats
