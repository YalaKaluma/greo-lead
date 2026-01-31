# app/services/people_review_orchestrator.py
"""
People Review Orchestrator - Rewritten to match Goal Review pattern

Uses GPT-generated adaptive questions via YAML prompts instead of hardcoded question sequences.
Each phase asks ONE thoughtful question that reacts to what the user said.
"""

from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from openai import OpenAI
from app.services.people_review_service import PeopleReviewService
from app.services.journey_context import build_journey_context
from app.services.message_service import load_conversation_history
from app.services.prompt_service import load_prompt
from app.models import RelationshipReview, JourneyPerson
from app.config import OPENAI_API_KEY, OPENAI_MODEL

client = OpenAI(api_key=OPENAI_API_KEY)


def handle_people_review_session(
    db: Session,
    user_number: str,
    user_message: str,
    state_context: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Main entry point for people review sessions.
    Routes to appropriate phase handler.
    
    Phases (like goal review):
    - select_person: Choose who to review
    - reflection: ONE question about current state
    - diagnostics: ONE question about patterns/dynamics
    - planning: ONE question about actions
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
    if phase == 'select_person':
        return _handle_selection(db, user_number, user_message, state_context)
    
    # All other phases use GPT-generated questions
    if phase == 'reflection':
        return _handle_reflection(db, user_number, user_message, state_context)
    
    if phase == 'diagnostics':
        return _handle_diagnostics(db, user_number, user_message, state_context)
    
    if phase == 'planning':
        return _handle_planning(db, user_number, user_message, state_context)
    
    if phase == 'closure':
        return _handle_closure(db, user_number, user_message, state_context)
    
    # Fallback
    return {
        "response": "Something went wrong. Let's start over.",
        "next_phase": "completed",
        "state_context": None
    }


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
        # Check if user wants to see all
        show_all = 'all' in user_message.lower()
        
        candidates_data = PeopleReviewService.get_review_candidates(
            db, user_number, include_all=show_all
        )
        candidates = candidates_data['people']
        stats = candidates_data['stats']
        
        state_context['candidates'] = candidates
        
        if not candidates:
            return {
                "response": "I don't see any people in your network yet. Add some in My Leadership Journey first!",
                "next_phase": "completed",
                "state_context": None
            }
        
        # Format candidates for display
        people_list = []
        display_count = min(len(candidates), 5) if not show_all else len(candidates)
        
        for i, person in enumerate(candidates[:display_count], 1):
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
        
        # Build response
        if show_all or len(candidates) <= 5:
            intro = f"I see {stats['total_people']} people in your network:"
        else:
            intro = f"I see {stats['total_people']} people in your network. Here are 5 who might benefit from reflection:"
        
        response = intro + "\n\n" + "\n".join(people_list)
        
        if not show_all and len(candidates) > 5:
            response += "\n\nWho would you like to focus on? (Say their name, pick a number, or type 'all' to see everyone)"
        else:
            response += "\n\nWho would you like to focus on? (Say their name or number)"
        
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
        
        # Move to reflection phase
        state_context['phase'] = 'reflection'
        
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
    """
    Handle reflection phase - ONE GPT-generated question.
    Like goal review's reflection phase.
    """
    
    print(f"📍 PHASE: REFLECTION")
    
    review_id = state_context['active_review_id']
    person = state_context['person']
    
    # Save user's reflection
    PeopleReviewService.update_review(db, review_id, {
        'recent_interactions': user_message,
        'current_dynamics': user_message
    })
    state_context['user_reflection'] = user_message
    
    # Generate ONE adaptive question using GPT
    journey_context = build_journey_context(db, user_number)
    history = load_conversation_history(db, user_number)
    
    # Build previous review summary if exists
    prev_review = state_context.get('previous_review')
    prev_summary = ""
    if prev_review:
        prev_summary = f"Last review: {prev_review.get('review_date', 'N/A')}, strength {prev_review.get('relationship_strength', 'N/A')}/5"
    
    text = _run_people_review_prompt(
        "app/prompts/coaching/people_review/reflection.yaml",
        person_name=person['name'],
        relation=person.get('relation', 'colleague'),
        previous_review_summary=prev_summary,
        user_input=user_message,
        journey_context=journey_context,
        recent_conversation=_format_recent_history(history, limit=5)
    )
    
    # Move to diagnostics
    state_context['phase'] = 'diagnostics'
    print(f"✅ Phase transition: reflection → diagnostics")
    
    return {
        "response": text,
        "next_phase": "diagnostics",
        "state_context": state_context
    }


def _handle_diagnostics(
    db: Session,
    user_number: str,
    user_message: str,
    state_context: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Handle diagnostics phase - ONE GPT-generated diagnostic question.
    Like goal review's diagnosis phase.
    """
    
    print(f"📍 PHASE: DIAGNOSTICS")
    
    review_id = state_context['active_review_id']
    person = state_context['person']
    
    # Save diagnostic insights
    PeopleReviewService.update_review(db, review_id, {
        'unresolved_issues': user_message,
        'patterns_noticed': user_message
    })
    state_context['diagnosis_input'] = user_message
    
    # Generate ONE diagnostic question using GPT
    journey_context = build_journey_context(db, user_number)
    history = load_conversation_history(db, user_number)
    
    # Build reflection summary
    reflection_summary = state_context.get('user_reflection', 'No reflection captured')
    
    text = _run_people_review_prompt(
        "app/prompts/coaching/people_review/diagnostics.yaml",
        person_name=person['name'],
        relation=person.get('relation', 'colleague'),
        reflection_summary=reflection_summary,
        user_input=user_message,
        journey_context=journey_context,
        recent_conversation=_format_recent_history(history, limit=5)
    )
    
    # Move to planning
    state_context['phase'] = 'planning'
    print(f"✅ Phase transition: diagnostics → planning")
    
    return {
        "response": text,
        "next_phase": "planning",
        "state_context": state_context
    }


def _handle_planning(
    db: Session,
    user_number: str,
    user_message: str,
    state_context: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Handle planning phase - ONE GPT-generated action question.
    Like goal review's adjustment phase.
    """
    
    print(f"📍 PHASE: PLANNING")
    
    review_id = state_context['active_review_id']
    person = state_context['person']
    
    # Save action plans
    PeopleReviewService.update_review(db, review_id, {
        'how_to_strengthen': user_message,
        'communication_plan': user_message,
        'next_steps': user_message
    })
    state_context['planning_input'] = user_message
    
    # Generate ONE planning question using GPT
    journey_context = build_journey_context(db, user_number)
    history = load_conversation_history(db, user_number)
    
    # Build summaries
    reflection_summary = state_context.get('user_reflection', '')
    diagnosis_summary = state_context.get('diagnosis_input', '')
    
    text = _run_people_review_prompt(
        "app/prompts/coaching/people_review/planning.yaml",
        person_name=person['name'],
        relation=person.get('relation', 'colleague'),
        reflection_summary=reflection_summary,
        diagnosis_summary=diagnosis_summary,
        user_input=user_message,
        journey_context=journey_context,
        recent_conversation=_format_recent_history(history, limit=5)
    )
    
    # Move to closure
    state_context['phase'] = 'closure'
    print(f"✅ Phase transition: planning → closure")
    
    return {
        "response": text,
        "next_phase": "closure",
        "state_context": state_context
    }


def _handle_closure(
    db: Session,
    user_number: str,
    user_message: str,
    state_context: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Handle closure phase - GPT-generated summary.
    Like goal review's closure phase.
    """
    
    print(f"📍 PHASE: CLOSURE")
    
    review_id = state_context['active_review_id']
    person = state_context['person']
    
    # Save final input
    current_plan = state_context.get('planning_input', '')
    combined_plan = f"{current_plan}\n{user_message}" if current_plan else user_message
    
    PeopleReviewService.update_review(db, review_id, {
        'next_steps': combined_plan
    })
    
    # Get full review for summary
    review = db.query(RelationshipReview).filter(
        RelationshipReview.id == review_id
    ).first()
    
    if not review:
        return {
            "response": "Sorry, I couldn't find the review session. Let's start fresh.",
            "next_phase": "completed",
            "state_context": None
        }
    
    # Build comprehensive review summary
    review_summary = _build_review_summary_for_prompt(review, state_context, person)
    
    # Generate closure summary using GPT
    text = _run_people_review_prompt(
        "app/prompts/coaching/people_review/closure.yaml",
        person_name=person['name'],
        relation=person.get('relation', 'colleague'),
        review_summary=review_summary,
        user_input=user_message,
        journey_context="",  # Not needed for closure
        recent_conversation=""  # Not needed for closure
    )
    
    # Complete the review
    PeopleReviewService.complete_review(db, review_id)
    
    print(f"✅ PEOPLE REVIEW SESSION COMPLETE")
    
    return {
        "response": text,
        "next_phase": "completed",
        "state_context": None
    }


# ============================================================
# HELPER FUNCTIONS
# ============================================================

def _run_people_review_prompt(
    prompt_path: str,
    person_name: str,
    relation: str,
    user_input: str,
    journey_context: str,
    recent_conversation: str,
    **kwargs
) -> str:
    """
    Run a people review prompt phase using GPT.
    Similar to _run_goal_review_prompt in orchestrator.py
    """
    prompt = load_prompt(prompt_path)
    
    # Build system prompt with all context
    system_prompt = prompt['system_prompt'].format(
        person_name=person_name,
        relation=relation,
        user_input=user_input,
        recent_conversation=recent_conversation,
        **kwargs  # Additional context like reflection_summary, etc.
    )
    
    if journey_context:
        system_prompt += f"\n\nJOURNEY CONTEXT:\n{journey_context}"
    
    messages = [{"role": "system", "content": system_prompt}]
    
    # Add recent conversation history
    if recent_conversation:
        # Recent conversation is already formatted, just use it for context
        # Don't add to messages array to avoid duplication
        pass
    
    # Add current user input
    if user_input:
        messages.append({"role": "user", "content": user_input})
    
    # Call GPT
    resp = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=messages,
        temperature=0.6,
        max_tokens=260
    )
    
    return (resp.choices[0].message.content or "").strip()


def _format_recent_history(history: List[Dict], limit: int = 5) -> str:
    """Format recent conversation history for prompt context"""
    if not history:
        return "No recent history"
    
    recent = history[-limit * 2:]  # Get last N exchanges
    formatted = []
    
    for msg in recent:
        role = "User" if msg.get("role") == "user" else "Alfred"
        content = msg.get("content", "")
        formatted.append(f"{role}: {content}")
    
    return "\n".join(formatted)


def _build_review_summary_for_prompt(
    review: RelationshipReview,
    state_context: Dict[str, Any],
    person: Dict[str, Any]
) -> str:
    """Build comprehensive review summary for closure prompt"""
    
    summary_parts = [
        f"Person: {person['name']} ({person.get('relation', 'colleague')})",
    ]
    
    # Add relationship strength if captured
    if review.relationship_strength:
        summary_parts.append(f"Strength rating: {review.relationship_strength}/5")
    
    # Add reflection insights
    if state_context.get('user_reflection'):
        summary_parts.append(f"\nReflection: {state_context['user_reflection'][:200]}")
    
    # Add diagnostic insights
    if state_context.get('diagnosis_input'):
        summary_parts.append(f"\nDiagnosis: {state_context['diagnosis_input'][:200]}")
    
    # Add planning
    if review.next_steps:
        summary_parts.append(f"\nPlanned actions: {review.next_steps[:200]}")
    
    return "\n".join(summary_parts)


def _parse_selection(user_message: str, candidates: List[Dict]) -> Optional[Dict]:
    """Parse user's selection from message"""
    msg_lower = user_message.lower().strip()
    
    # Check for number selection
    if msg_lower.isdigit():
        idx = int(msg_lower)
        if 1 <= idx <= len(candidates):
            return candidates[idx - 1]
    
    # Check for name match (partial matching)
    for person in candidates:
        if person['name'].lower() in msg_lower:
            return person
        # Also check if user's message is IN the person's name
        if msg_lower in person['name'].lower():
            return person
    
    return None
