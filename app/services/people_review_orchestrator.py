# app/services/people_review_orchestrator.py
"""
People Review Orchestrator

Manages the conversation flow for relationship reviews.
Similar to goal review but focused on relationship dynamics.
"""

from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from app.services.people_review_service import PeopleReviewService
from app.models import RelationshipReview, JourneyPerson


def handle_people_review_session(
    db: Session,
    user_number: str,
    user_message: str,
    state_context: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Main entry point for people review sessions.
    Routes to appropriate phase handler.
    
    Phases:
    - select_person: Choose who to review
    - reflection: Recent interactions and current state
    - diagnostics: Deeper analysis of dynamics
    - planning: Action steps and improvements
    - closure: Summary and task creation
    """
    
    phase = state_context.get('phase', 'select_person')
    
    print(f"\n{'='*60}")
    print(f"👥 PEOPLE REVIEW SESSION")
    print(f"Phase: {phase}")
    print(f"Message: {user_message[:100]}...")
    print(f"{'='*60}")
    
    # Check for cancel
    if _is_cancel_request(user_message):
        return {
            "response": "✅ People review cancelled. What would you like to do instead?",
            "next_phase": "completed",
            "state_context": None
        }
    
    # Route to phase handler
    handlers = {
        'select_person': _handle_selection,
        'reflection': _handle_reflection,
        'diagnostics': _handle_diagnostics,
        'planning': _handle_planning,
        'closure': _handle_closure
    }
    
    handler = handlers.get(phase, _handle_selection)
    return handler(db, user_number, user_message, state_context)


def _is_cancel_request(message: str) -> bool:
    """Check if user wants to cancel"""
    import re
    msg_lower = message.lower().strip()
    
    # Must be short message
    if len(message) > 50:
        return False
    
    cancel_patterns = [
        r'\bcancel\b',
        r'\bstop\b',
        r'\bexit\b',
        r'\bquit\b',
        r'\bnever\s*mind\b',
        r'\bforget\s*it\b'
    ]
    
    return any(re.search(pattern, msg_lower) for pattern in cancel_patterns)


def _handle_selection(
    db: Session,
    user_number: str,
    user_message: str,
    state_context: Dict[str, Any]
) -> Dict[str, Any]:
    """Handle person selection phase"""
    
    # If no candidates loaded yet, load them
    if 'candidates' not in state_context:
        candidates_data = PeopleReviewService.get_review_candidates(db, user_number)
        candidates = candidates_data['people']
        stats = candidates_data['stats']
        
        state_context['candidates'] = candidates
        
        if not candidates:
            return {
                "response": "I don't see any people in your network yet. Add some in My Leadership Journey first!",
                "next_phase": "completed",
                "state_context": None
            }
        
        # Format candidates for display (top 5)
        people_list = []
        for i, person in enumerate(candidates[:5], 1):
            flag = "⚠️ " if person.get('needs_attention') else ""
            
            if person['days_since_review'] is None:
                time_desc = "Never reviewed"
            elif person['days_since_review'] == 0:
                time_desc = "Reviewed today"
            elif person['days_since_review'] < 7:
                time_desc = f"{person['days_since_review']} days ago"
            elif person['days_since_review'] < 60:
                time_desc = f"{person['days_since_review'] // 7} weeks ago"
            else:
                time_desc = f"{person['days_since_review'] // 30} months ago"
            
            relation = f" ({person['relation']})" if person.get('relation') else ""
            people_list.append(f"{i}. {flag}{person['name']}{relation} - {time_desc}")
        
        response = (
            f"I see {stats['total_people']} people in your network. "
            f"Here are some relationships that might benefit from reflection:\n\n"
            + "\n".join(people_list) +
            "\n\nWho would you like to focus on? (Say their name or number)"
        )
        
        return {
            "response": response,
            "next_phase": "select_person",
            "state_context": state_context
        }
    
    # User has selected someone
    selected_person = _parse_selection(user_message, state_context['candidates'])
    
    if not selected_person:
        return {
            "response": "I didn't catch who you'd like to review. Could you say their name or the number from the list?",
            "next_phase": "select_person",
            "state_context": state_context
        }
    
    # Start the review
    try:
        review_session = PeopleReviewService.start_review(
            db,
            user_number,
            selected_person['id']
        )
        
        state_context['active_review_id'] = review_session['review_id']
        state_context['person'] = review_session['person']
        state_context['previous_review'] = review_session.get('previous_review')
        state_context['reflection_step'] = 0
        
        return {
            "response": review_session['conversation_starter'],
            "next_phase": "reflection",
            "state_context": state_context
        }
    except Exception as e:
        print(f"❌ Error starting review: {e}")
        return {
            "response": "Sorry, I had trouble starting the review. Please try again.",
            "next_phase": "completed",
            "state_context": None
        }


def _handle_reflection(
    db: Session,
    user_number: str,
    user_message: str,
    state_context: Dict[str, Any]
) -> Dict[str, Any]:
    """Handle reflection phase - understanding current state"""
    
    review_id = state_context['active_review_id']
    person = state_context['person']
    step = state_context.get('reflection_step', 0)
    
    # Save user's response
    if step == 0:
        PeopleReviewService.update_review(db, review_id, {
            'last_meaningful_interaction': user_message
        })
    elif step == 1:
        PeopleReviewService.update_review(db, review_id, {
            'current_dynamics': user_message
        })
    elif step == 2:
        PeopleReviewService.update_review(db, review_id, {
            'recent_interactions': user_message
        })
    elif step == 3:
        # Extract strength rating
        strength = _extract_rating(user_message)
        PeopleReviewService.update_review(db, review_id, {
            'relationship_strength': strength
        })
    elif step == 4:
        # Extract frequency
        freq = _extract_frequency(user_message)
        PeopleReviewService.update_review(db, review_id, {
            'communication_frequency': freq
        })
    
    # Progress through reflection questions
    questions = [
        f"How would you describe the current state of your relationship with {person['name']}?",
        f"What's working well? What's challenging?",
        f"On a scale of 1-5, how strong is this relationship right now?",
        f"How frequently are you currently in touch? (daily/weekly/monthly/occasionally)"
    ]
    
    if step < len(questions):
        state_context['reflection_step'] = step + 1
        return {
            "response": questions[step],
            "next_phase": "reflection",
            "state_context": state_context
        }
    
    # Move to diagnostics
    state_context['diagnostic_step'] = 0
    return {
        "response": f"Thank you for that reflection. Now let's go a bit deeper. What value do you and {person['name']} provide each other?",
        "next_phase": "diagnostics",
        "state_context": state_context
    }


def _handle_diagnostics(
    db: Session,
    user_number: str,
    user_message: str,
    state_context: Dict[str, Any]
) -> Dict[str, Any]:
    """Handle diagnostic phase - deeper analysis"""
    
    review_id = state_context['active_review_id']
    person = state_context['person']
    step = state_context.get('diagnostic_step', 0)
    
    # Save diagnostic insights
    field_mapping = ['mutual_value', 'strategic_importance', 'unresolved_issues', 'patterns_noticed']
    if step < len(field_mapping):
        PeopleReviewService.update_review(db, review_id, {
            field_mapping[step]: user_message
        })
    
    questions = [
        f"How strategically important is this relationship to your current goals?",
        f"Are there any unresolved issues or tensions with {person['name']}?",
        f"What patterns have you noticed in your interactions?"
    ]
    
    if step < len(questions):
        state_context['diagnostic_step'] = step + 1
        return {
            "response": questions[step],
            "next_phase": "diagnostics",
            "state_context": state_context
        }
    
    # Move to planning
    state_context['planning_step'] = 0
    return {
        "response": f"Great insights. Now let's think about action. What specific steps could strengthen your relationship with {person['name']}?",
        "next_phase": "planning",
        "state_context": state_context
    }


def _handle_planning(
    db: Session,
    user_number: str,
    user_message: str,
    state_context: Dict[str, Any]
) -> Dict[str, Any]:
    """Handle action planning phase"""
    
    review_id = state_context['active_review_id']
    person = state_context['person']
    step = state_context.get('planning_step', 0)
    
    # Save action plans
    field_mapping = ['how_to_strengthen', 'what_to_appreciate', 'what_to_address', 'communication_plan']
    if step < len(field_mapping):
        PeopleReviewService.update_review(db, review_id, {
            field_mapping[step]: user_message
        })
    
    questions = [
        f"Is there anything you'd like to appreciate or acknowledge with {person['name']}?",
        f"Are there any difficult conversations you need to have?",
        f"When and how should you next reach out to {person['name']}?"
    ]
    
    if step < len(questions):
        state_context['planning_step'] = step + 1
        return {
            "response": questions[step],
            "next_phase": "planning",
            "state_context": state_context
        }
    
    # Move to closure
    return {
        "response": "Let me summarize what we discussed...",
        "next_phase": "closure",
        "state_context": state_context
    }


def _handle_closure(
    db: Session,
    user_number: str,
    user_message: str,
    state_context: Dict[str, Any]
) -> Dict[str, Any]:
    """Handle review closure and summary"""
    
    review_id = state_context['active_review_id']
    person = state_context['person']
    
    # Get full review
    review = db.query(RelationshipReview).filter(
        RelationshipReview.id == review_id
    ).first()
    
    if not review:
        return {
            "response": "Sorry, I couldn't find the review session. Let's start fresh.",
            "next_phase": "completed",
            "state_context": None
        }
    
    # Generate summary
    strength_text = f"{review.relationship_strength}/5" if review.relationship_strength else "not rated"
    
    summary_parts = [
        f"We reviewed your relationship with {person['name']}:",
        f"\n📊 Strength: {strength_text}"
    ]
    
    if review.how_to_strengthen:
        summary_parts.append(f"\n💪 To strengthen: {review.how_to_strengthen[:100]}")
    
    if review.what_to_appreciate:
        summary_parts.append(f"\n🙏 To appreciate: {review.what_to_appreciate[:100]}")
    
    if review.communication_plan:
        summary_parts.append(f"\n📅 Next steps: {review.communication_plan[:100]}")
    
    summary_parts.append("\n\nI've saved this review. Would you like me to create any tasks related to this relationship?")
    
    # Complete the review
    PeopleReviewService.complete_review(db, review_id)
    
    return {
        "response": "".join(summary_parts),
        "next_phase": "completed",
        "state_context": None
    }


def _parse_selection(user_message: str, candidates: List[Dict]) -> Optional[Dict]:
    """Parse user's selection from message"""
    msg_lower = user_message.lower().strip()
    
    # Check for number selection
    if msg_lower.isdigit():
        idx = int(msg_lower)
        if 1 <= idx <= len(candidates):
            return candidates[idx - 1]
    
    # Check for name match
    for person in candidates:
        if person['name'].lower() in msg_lower:
            return person
    
    return None


def _extract_rating(message: str) -> Optional[int]:
    """Extract 1-5 rating from message"""
    import re
    # Look for numbers 1-5
    matches = re.findall(r'\b([1-5])\b', message)
    if matches:
        return int(matches[0])
    
    # Look for words
    word_map = {
        'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
        'poor': 1, 'weak': 2, 'okay': 3, 'good': 4, 'strong': 5,
        'excellent': 5, 'great': 4
    }
    
    for word, rating in word_map.items():
        if word in message.lower():
            return rating
    
    return None


def _extract_frequency(message: str) -> Optional[str]:
    """Extract communication frequency from message"""
    msg_lower = message.lower()
    
    if 'daily' in msg_lower or 'every day' in msg_lower:
        return 'daily'
    elif 'weekly' in msg_lower or 'once a week' in msg_lower:
        return 'weekly'
    elif 'monthly' in msg_lower or 'once a month' in msg_lower:
        return 'monthly'
    elif 'occasional' in msg_lower or 'sometimes' in msg_lower:
        return 'occasional'
    elif 'rarely' in msg_lower or 'seldom' in msg_lower:
        return 'rare'
    
    return None
