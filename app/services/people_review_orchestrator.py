# app/services/people_review_orchestrator.py
"""
People Review Orchestrator - v2 Simplified

Uses GPT-generated adaptive questions with INLINE prompts (no YAML dependency).
Each phase asks ONE thoughtful question that reacts to what the user said.
"""

from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from openai import OpenAI
from app.services.people_review_service import PeopleReviewService
from app.services.journey_context import build_journey_context
from app.services.message_service import load_conversation_history
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
    
    try:
        text = _generate_reflection_question(
            person_name=person['name'],
            relation=person.get('relation', 'colleague'),
            user_input=user_message,
            journey_context=journey_context,
            recent_history=history
        )
    except Exception as e:
        print(f"❌ Error generating reflection question: {e}")
        import traceback
        traceback.print_exc()
        # Fallback to simple question
        text = f"What's the real issue underneath what you just shared about {person['name']}?"
    
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
    reflection_summary = state_context.get('user_reflection', '')
    
    try:
        text = _generate_diagnostics_question(
            person_name=person['name'],
            relation=person.get('relation', 'colleague'),
            reflection_summary=reflection_summary,
            user_input=user_message,
            journey_context=journey_context,
            recent_history=history
        )
    except Exception as e:
        print(f"❌ Error generating diagnostics question: {e}")
        import traceback
        traceback.print_exc()
        text = f"What pattern have you noticed in how you and {person['name']} interact?"
    
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
    reflection_summary = state_context.get('user_reflection', '')
    diagnosis_summary = state_context.get('diagnosis_input', '')
    
    try:
        text = _generate_planning_question(
            person_name=person['name'],
            relation=person.get('relation', 'colleague'),
            reflection_summary=reflection_summary,
            diagnosis_summary=diagnosis_summary,
            user_input=user_message,
            journey_context=journey_context,
            recent_history=history
        )
    except Exception as e:
        print(f"❌ Error generating planning question: {e}")
        import traceback
        traceback.print_exc()
        text = f"What's the ONE action you need to take with {person['name']} this week?"
    
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
    
    # Generate smart summary with GPT
    try:
        summary = _generate_closure_summary(
            person_name=person['name'],
            relation=person.get('relation', 'colleague'),
            reflection=state_context.get('user_reflection', ''),
            diagnostics=state_context.get('diagnosis_input', ''),
            planning=combined_plan,
            relationship_strength=review.relationship_strength
        )
    except Exception as e:
        print(f"❌ Error generating closure summary: {e}")
        import traceback
        traceback.print_exc()
        # Fallback to simple summary
        strength_text = f"{review.relationship_strength}/5" if review.relationship_strength else "not rated"
        summary = f"We reviewed your relationship with {person['name']}:\n\n📊 Strength: {strength_text}\n✅ Next: {combined_plan[:100]}"
    
    # Add task creation offer
    full_response = summary + "\n\nI've saved this review. Would you like me to create any tasks related to this relationship?"
    
    # Complete the review
    PeopleReviewService.complete_review(db, review_id)
    
    print(f"✅ PEOPLE REVIEW SESSION COMPLETE")
    
    return {
        "response": full_response,
        "next_phase": "completed",
        "state_context": None
    }


# ============================================================
# GPT QUESTION GENERATORS - INLINE PROMPTS
# ============================================================

def _generate_reflection_question(
    person_name: str,
    relation: str,
    user_input: str,
    journey_context: str,
    recent_history: List[Dict]
) -> str:
    """Generate ONE adaptive reflection question based on what user said"""
    
    system_prompt = f"""You are Alfred, an executive coach helping reflect on a relationship with {person_name} ({relation}).

The user just said: "{user_input}"

Your task: Ask ONE thoughtful follow-up question that goes deeper into what they just shared.

CRITICAL RULES:
- Ask ONLY ONE question (not multiple)
- Keep under 250 characters
- React to what they actually said (don't ignore their answer)
- If they mention tension/conflict → probe that specifically
- If they mention positive aspects → explore what makes that work
- If they mention mixed feelings → help them untangle that
- Don't ask rating scales or frequency questions yet
- Make it conversational, not mechanical

Examples:
If they mention tension: "That tension you mentioned - what does that actually look like when it shows up?"
If they mention daily contact: "With daily contact, what's the difference between a good day and a tough day with {person_name}?"
If they mention supervision: "As your supervisor, where does the relationship feel most/least effective?"

Generate ONE question now that builds on what they said."""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_input}
    ]
    
    resp = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=messages,
        temperature=0.6,
        max_tokens=100
    )
    
    return (resp.choices[0].message.content or "").strip()


def _generate_diagnostics_question(
    person_name: str,
    relation: str,
    reflection_summary: str,
    user_input: str,
    journey_context: str,
    recent_history: List[Dict]
) -> str:
    """Generate ONE diagnostic question about patterns/dynamics"""
    
    system_prompt = f"""You are Alfred, helping diagnose relationship dynamics with {person_name} ({relation}).

Earlier they said: "{reflection_summary[:200]}"
Just now they said: "{user_input[:200]}"

Your task: Ask ONE strategic diagnostic question that reveals ROOT CAUSES or PATTERNS.

This is the DIAGNOSTICS phase - different from reflection. You need to:
- Identify PATTERNS or DYNAMICS, not just describe the relationship
- Ask WHY things happen, not WHAT happens
- Probe underlying causes
- Help them see the system/structure, not just symptoms

CRITICAL RULES:
- Ask ONLY ONE question
- Keep under 250 characters
- Focus on WHY or WHEN (not what/how)
- Look for patterns, triggers, dynamics
- Be specific to what they've shared

GOOD EXAMPLES:
"You bonded in crisis - does the relationship need stress to stay strong, or can it thrive in calm?"
"When is the trust strongest with Jack - in planning or in execution?"
"What makes collaboration easy with him versus when it gets complicated?"
"Is there a pattern to when you reach out to Jack versus when he reaches out to you?"

BAD EXAMPLES (too general):
"How does that influence your collaboration?" (too vague)
"What patterns have you noticed?" (too open)
"How important is this relationship?" (we know it's important)

Generate ONE diagnostic question that helps them see the underlying PATTERN or DYNAMIC."""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_input}
    ]
    
    resp = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=messages,
        temperature=0.6,
        max_tokens=100
    )
    
    return (resp.choices[0].message.content or "").strip()


def _generate_planning_question(
    person_name: str,
    relation: str,
    reflection_summary: str,
    diagnosis_summary: str,
    user_input: str,
    journey_context: str,
    recent_history: List[Dict]
) -> str:
    """Generate ONE action-oriented planning question"""
    
    system_prompt = f"""You are Alfred, helping plan actions to improve the relationship with {person_name} ({relation}).

What we've learned:
Reflection: {reflection_summary[:200]}
Diagnosis: {diagnosis_summary[:200]}
Just now: {user_input}

Your task: Ask ONE action-oriented question that leads to concrete next steps.

CRITICAL RULES:
- Ask ONLY ONE question
- Keep under 250 characters
- Make it specific to THIS relationship
- Focus on what THEY can control
- Force clarity on the single most important action
- Be direct and clear

Examples:
"What's the ONE conversation you need to have with {person_name} this week?"
"If you could only change one thing about how you work together, what would it be?"
"What boundary would reduce the most tension if you set it clearly?"

Generate ONE planning question."""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_input}
    ]
    
    resp = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=messages,
        temperature=0.6,
        max_tokens=100
    )
    
    return (resp.choices[0].message.content or "").strip()


def _generate_closure_summary(
    person_name: str,
    relation: str,
    reflection: str,
    diagnostics: str,
    planning: str,
    relationship_strength: Optional[int]
) -> str:
    """Generate a concise, insightful closure summary"""
    
    strength_text = f"{relationship_strength}/5" if relationship_strength else "not rated"
    
    system_prompt = f"""You are Alfred, summarizing a relationship review with {person_name} ({relation}).

CONVERSATION SUMMARY:
- Reflection: {reflection[:300]}
- Diagnostics: {diagnostics[:300]}
- Planning: {planning[:300]}

Your task: Create a concise summary with:
1. Relationship strength rating ({strength_text})
2. ONE key insight (10-15 words max) - NOT the full reflection, just the essence
3. Main action item (10-15 words max)

FORMAT:
We reviewed your relationship with {person_name}:

📊 Strength: {strength_text}
💡 Key insight: [10-15 words capturing the core dynamic/pattern]
✅ Next: [10-15 words stating the concrete action]

EXAMPLES:
💡 Key insight: Trust built through crisis, need to maintain connection beyond emergencies
✅ Next: Involve Jack in SKaiX projects to stay engaged

💡 Key insight: Daily supervision works but tension builds when pushing back
✅ Next: Clarify decision authority to reduce friction

RULES:
- Keep it punchy and clear
- Extract ESSENCE, don't copy their words verbatim
- Focus on what matters most
- Max 300 characters total
- Don't add commentary or advice

Generate the summary now."""

    messages = [
        {"role": "system", "content": system_prompt}
    ]
    
    resp = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=messages,
        temperature=0.5,
        max_tokens=150
    )
    
    return (resp.choices[0].message.content or "").strip()


# ============================================================
# HELPER FUNCTIONS
# ============================================================

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
