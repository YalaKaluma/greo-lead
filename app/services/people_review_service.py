# app/services/people_review_service.py
"""
People Review Service

Handles relationship review sessions with guided reflection and action planning.
"""

from typing import Optional, List, Dict, Any
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from app.models import JourneyPerson, RelationshipReview, Task


class PeopleReviewService:
    
    @staticmethod
    def get_review_candidates(
        db: Session,
        user_number: str,
        include_all: bool = False
    ) -> Dict[str, Any]:
        """
        Get list of people who could benefit from a review.
        
        Prioritizes by:
        1. needs_attention flag
        2. Never reviewed
        3. Longest time since last review
        """
        query = db.query(JourneyPerson).filter(
            JourneyPerson.user_number == user_number
        )
        
        all_people = query.all()
        
        # Build candidate list with metadata
        all_candidates = []
        for person in all_people:
            days_since = None
            if person.last_reviewed_at:
                # Make datetime timezone-aware if needed
                last_review = person.last_reviewed_at
                if last_review.tzinfo is None:
                    last_review = last_review.replace(tzinfo=timezone.utc)
                days_since = (datetime.now(timezone.utc) - last_review).days
            
            # Determine if needs review based on frequency setting
            needs_review = person.needs_attention or person.last_reviewed_at is None
            
            if not needs_review and days_since is not None:
                freq = person.review_frequency or 'monthly'
                threshold_days = {
                    'weekly': 7,
                    'monthly': 30,
                    'quarterly': 90,
                    'as-needed': 999999  # Never suggest unless flagged
                }.get(freq, 30)
                
                needs_review = days_since > threshold_days
            
            all_candidates.append({
                "id": person.id,
                "name": person.name,
                "relation": person.relation,
                "email": person.email,
                "phone": person.phone,
                "context": person.context,
                "last_reviewed_at": person.last_reviewed_at.isoformat() if person.last_reviewed_at else None,
                "days_since_review": days_since,
                "needs_attention": person.needs_attention or False,
                "relationship_health": person.relationship_health,
                "review_frequency": person.review_frequency,
                "needs_review": needs_review
            })
        
        # Sort by priority: needs_attention first, then never reviewed, then oldest review
        all_candidates.sort(
            key=lambda x: (
                not x["needs_attention"],  # False (needs attention) comes first
                x["last_reviewed_at"] is not None,  # None (never reviewed) comes first
                -(x["days_since_review"] or 0)  # Negative so oldest comes first
            )
        )
        
        # Return all or top candidates based on flag
        if include_all:
            candidates = all_candidates
        else:
            candidates = all_candidates[:5]  # Top 5 priorities
        
        stats = {
            "total_people": len(all_people),
            "showing": len(candidates),
            "needs_review": len([c for c in all_candidates if c.get("needs_attention")]),
            "never_reviewed": len([c for c in all_candidates if c["last_reviewed_at"] is None])
        }
        
        return {
            "people": candidates,
            "stats": stats
        }
    
    @staticmethod
    def start_review(
        db: Session,
        user_number: str,
        person_id: int,
        review_type: str = "regular"
    ) -> Dict[str, Any]:
        """Initialize a new review session"""
        person = db.query(JourneyPerson).filter(
            JourneyPerson.id == person_id,
            JourneyPerson.user_number == user_number
        ).first()
        
        if not person:
            raise ValueError("Person not found")
        
        # Get previous review if exists
        previous_review = db.query(RelationshipReview).filter(
            RelationshipReview.person_id == person_id,
            RelationshipReview.user_number == user_number
        ).order_by(RelationshipReview.review_date.desc()).first()
        
        # Create new review
        review = RelationshipReview(
            user_number=user_number,
            person_id=person_id,
            review_type=review_type,
            review_date=datetime.now(timezone.utc)
        )
        db.add(review)
        db.commit()
        db.refresh(review)
        
        # Generate conversation starter
        starter = PeopleReviewService._generate_starter(person, previous_review)
        
        return {
            "review_id": review.id,
            "person": {
                "id": person.id,
                "name": person.name,
                "relation": person.relation,
                "context": person.context
            },
            "previous_review": {
                "review_date": previous_review.review_date.isoformat() if previous_review.review_date else None,
                "relationship_strength": previous_review.relationship_strength,
                "insights": previous_review.insights,
                "next_steps": previous_review.next_steps
            } if previous_review else None,
            "conversation_starter": starter
        }
    
    @staticmethod
    def _generate_starter(person: JourneyPerson, previous_review: Optional[RelationshipReview]) -> str:
        """Generate opening message for review"""
        if previous_review and previous_review.review_date:
            # Format date nicely
            review_date = previous_review.review_date
            if review_date.tzinfo is None:
                review_date = review_date.replace(tzinfo=timezone.utc)
            
            days_ago = (datetime.now(timezone.utc) - review_date).days
            if days_ago < 7:
                time_desc = f"{days_ago} days ago"
            elif days_ago < 60:
                time_desc = f"about {days_ago // 7} weeks ago"
            else:
                time_desc = f"about {days_ago // 30} months ago"
            
            return (
                f"Let's review your relationship with {person.name} ({person.relation}). "
                f"We last talked about them {time_desc}. "
                f"When did you last have a meaningful interaction with {person.name}?"
            )
        else:
            return (
                f"Let's reflect on your relationship with {person.name}"
                f"{' (' + person.relation + ')' if person.relation else ''}. "
                f"This is our first structured review of this relationship. "
                f"When did you last have a meaningful interaction with them?"
            )
    
    @staticmethod
    def update_review(
        db: Session,
        review_id: int,
        user_number_or_updates: str | Dict[str, Any],
        updates: Optional[Dict[str, Any]] = None
    ) -> RelationshipReview:
        """Update review with new information"""
        user_number = user_number_or_updates if isinstance(user_number_or_updates, str) else None
        update_values = updates if updates is not None else user_number_or_updates

        query = db.query(RelationshipReview).filter(RelationshipReview.id == review_id)
        if user_number:
            query = query.filter(RelationshipReview.user_number == user_number)
        review = query.first()
        
        if not review:
            raise ValueError("Review not found")
        
        # Update fields
        for key, value in update_values.items():
            if hasattr(review, key) and value is not None:
                setattr(review, key, value)
        
        review.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(review)
        
        return review
    
    @staticmethod
    def complete_review(
        db: Session,
        review_id: int,
        user_number: Optional[str] = None
    ) -> Dict[str, Any]:
        """Mark review as complete and update person record"""
        query = db.query(RelationshipReview).filter(RelationshipReview.id == review_id)
        if user_number:
            query = query.filter(RelationshipReview.user_number == user_number)
        review = query.first()
        
        if not review:
            raise ValueError("Review not found")
        
        # Update person record
        owner_number = user_number or review.user_number
        person = db.query(JourneyPerson).filter(
            JourneyPerson.id == review.person_id,
            JourneyPerson.user_number == owner_number
        ).first()
        
        if person:
            person.last_reviewed_at = datetime.now(timezone.utc)
            person.relationship_health = review.relationship_strength
            person.needs_attention = False  # Clear flag after review
        
        db.commit()
        
        return {
            "review_id": review.id,
            "person_id": review.person_id,
            "completed": True
        }
    
    @staticmethod
    def get_review_history(
        db: Session,
        person_id: int,
        user_number: str
    ) -> Dict[str, Any]:
        """Get all reviews for a person"""
        reviews = db.query(RelationshipReview).filter(
            RelationshipReview.person_id == person_id,
            RelationshipReview.user_number == user_number
        ).order_by(RelationshipReview.review_date.desc()).all()
        
        # Calculate trends
        strength_over_time = [r.relationship_strength for r in reviews if r.relationship_strength]
        dates = [r.review_date for r in reviews]
        
        return {
            "reviews": [
                {
                    "id": r.id,
                    "review_date": r.review_date.isoformat() if r.review_date else None,
                    "review_type": r.review_type,
                    "relationship_strength": r.relationship_strength,
                    "insights": r.insights,
                    "next_steps": r.next_steps,
                    "patterns_noticed": r.patterns_noticed
                }
                for r in reviews
            ],
            "trends": {
                "relationship_strength_over_time": strength_over_time,
                "review_dates": [d.isoformat() if d else None for d in dates],
                "average_strength": sum(strength_over_time) / len(strength_over_time) if strength_over_time else None,
                "total_reviews": len(reviews)
            }
        }
    
    @staticmethod
    def get_active_review(
        db: Session,
        user_number: str
    ) -> Optional[Dict[str, Any]]:
        """Get the most recent review session if it's still in progress (< 2 hours old)"""
        cutoff = datetime.now(timezone.utc) - timedelta(hours=2)
        
        review = db.query(RelationshipReview).filter(
            RelationshipReview.user_number == user_number,
            RelationshipReview.review_date >= cutoff
        ).order_by(RelationshipReview.review_date.desc()).first()
        
        if not review:
            return None
        
        person = db.query(JourneyPerson).filter(
            JourneyPerson.id == review.person_id,
            JourneyPerson.user_number == user_number
        ).first()
        
        if not person:
            return None
        
        return {
            "review_id": review.id,
            "person": {
                "id": person.id,
                "name": person.name,
                "relation": person.relation
            },
            "review_date": review.review_date.isoformat()
        }
