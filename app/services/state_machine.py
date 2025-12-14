# app/services/state_machine.py
"""
State Machine Service for Alfred's Brain

Manages conversation state transitions based on intents and context.
All state transitions must go through this service.
"""

from sqlalchemy.orm import Session
from app.models import ConversationState
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
import json


# Valid states
class States:
    IDLE = "IDLE"
    CLARIFYING = "CLARIFYING"
    DRAFTING = "DRAFTING"
    AWAITING_APPROVAL = "AWAITING_APPROVAL"
    EXECUTING = "EXECUTING"
    COACHING = "COACHING"
    REVIEWING = "REVIEWING"
    PROACTIVE = "PROACTIVE"
    LEARNING = "LEARNING"


# State timeout configuration (in minutes)
STATE_TIMEOUTS = {
    States.CLARIFYING: 2,
    States.AWAITING_APPROVAL: 5,
    States.COACHING: 5,
    States.DRAFTING: 3,
    States.REVIEWING: 10,
}


def get_or_create_state(db: Session, user_number: str) -> ConversationState:
    """
    Get existing conversation state or create new one in IDLE.
    
    Args:
        db: Database session
        user_number: User identifier (WhatsApp number or email)
        
    Returns:
        ConversationState object
    """
    state = db.query(ConversationState).filter(
        ConversationState.user_number == user_number
    ).first()
    
    if not state:
        state = ConversationState(
            user_number=user_number,
            current_state=States.IDLE,
            active_intents=None,
            pending_action=None,
            pending_payload=None,
            state_context=None
        )
        db.add(state)
        db.commit()
        db.refresh(state)
        print(f"✨ Created new conversation state for {user_number}")
    
    return state


def check_timeout(state: ConversationState) -> bool:
    """
    Check if current state has timed out.

    Returns:
        True if state should be reset to IDLE
    """
    if state.current_state not in STATE_TIMEOUTS:
        return False

    timeout_minutes = STATE_TIMEOUTS[state.current_state]

    # Make datetime timezone-aware
    from datetime import timezone
    now = datetime.now(timezone.utc)

    # Ensure last_transition_at is timezone-aware
    last_transition = state.last_transition_at
    if last_transition.tzinfo is None:
        last_transition = last_transition.replace(tzinfo=timezone.utc)

    timeout_threshold = now - timedelta(minutes=timeout_minutes)

    return last_transition < timeout_threshold


def transition_state(
    db: Session,
    state: ConversationState,
    intents: List[Dict],
    explicit_execution: bool,
    user_message: str
) -> tuple[str, str]:
    """
    Determine next state based on current state and detected intents.
    
    Args:
        db: Database session
        state: Current conversation state
        intents: Detected intents with confidence scores
        explicit_execution: Whether user explicitly requested action
        user_message: The user's message (for context)
        
    Returns:
        Tuple of (new_state, reason)
    """
    
    # Check for timeout first
    if check_timeout(state):
        print(f"⏰ State {state.current_state} timed out, resetting to IDLE")
        return States.IDLE, "timeout"
    
    current = state.current_state
    top_intent = intents[0] if intents else None
    
    if not top_intent:
        return States.IDLE, "no_intent_detected"
    
    intent_name = top_intent["name"]
    confidence = top_intent["confidence"]
    
    # META always wins - user is correcting Alfred
    if intent_name == "META":
        return States.LEARNING, "meta_correction"
    
    # State-specific transitions
    if current == States.IDLE:
        return _transition_from_idle(intent_name, confidence, explicit_execution)
    
    elif current == States.COACHING:
        return _transition_from_coaching(intent_name, confidence, explicit_execution)
    
    elif current == States.CLARIFYING:
        return _transition_from_clarifying(user_message)
    
    elif current == States.DRAFTING:
        return _transition_from_drafting(user_message)
    
    elif current == States.AWAITING_APPROVAL:
        return _transition_from_awaiting_approval(user_message)
    
    elif current == States.EXECUTING:
        return States.IDLE, "execution_complete"
    
    elif current == States.LEARNING:
        return States.IDLE, "learning_complete"
    
    elif current == States.REVIEWING:
        if intent_name == "EXECUTE" and explicit_execution:
            return States.CLARIFYING, "action_requested"
        return States.IDLE, "review_complete"
    
    elif current == States.PROACTIVE:
        # Proactive nudges transition to coaching or reviewing
        if intent_name == "COACH":
            return States.COACHING, "proactive_to_coaching"
        return States.REVIEWING, "proactive_to_reviewing"
    
    # Default: stay in current state
    return current, "continue"


def _transition_from_idle(intent: str, confidence: float, explicit: bool) -> tuple[str, str]:
    """Transitions from IDLE state."""
    
    if intent == "COACH" and confidence > 0.7:
        return States.COACHING, "high_confidence_coaching"
    
    if intent == "EXECUTE":
        if explicit:
            return States.CLARIFYING, "explicit_execution_request"
        else:
            return States.DRAFTING, "implicit_execution_mention"
    
    if intent == "COMMUNICATE":
        return States.DRAFTING, "communication_request"
    
    if intent == "THINK":
        return States.COACHING, "thinking_support_request"
    
    if intent == "ORGANIZE":
        return States.DRAFTING, "organization_request"
    
    # Low confidence - stay in IDLE but respond
    return States.IDLE, "low_confidence_response"


def _transition_from_coaching(intent: str, confidence: float, explicit: bool) -> tuple[str, str]:
    """
    Transitions from COACHING state.
    
    CRITICAL: Coaching mode should NOT auto-transition to execution.
    Only explicit user requests should trigger action creation.
    """
    
    if intent == "EXECUTE" and explicit and confidence > 0.7:
        return States.AWAITING_APPROVAL, "explicit_action_from_coaching"
    
    if intent == "COACH":
        return States.COACHING, "continue_coaching"
    
    # Any other intent - stay in coaching unless user explicitly breaks out
    return States.COACHING, "maintain_coaching_mode"


def _transition_from_clarifying(message: str) -> tuple[str, str]:
    """Transitions from CLARIFYING state."""
    # Assume user provided the missing information
    return States.EXECUTING, "clarification_received"


def _transition_from_drafting(message: str) -> tuple[str, str]:
    """Transitions from DRAFTING state."""
    
    # Simple keyword detection for approval/rejection
    message_lower = message.lower()
    
    if any(word in message_lower for word in ["yes", "correct", "go ahead", "do it", "please"]):
        return States.EXECUTING, "draft_approved"
    
    if any(word in message_lower for word in ["no", "don't", "cancel", "nevermind"]):
        return States.IDLE, "draft_rejected"
    
    # If user is modifying, stay in drafting
    return States.DRAFTING, "draft_modification"


def _transition_from_awaiting_approval(message: str) -> tuple[str, str]:
    """Transitions from AWAITING_APPROVAL state."""
    
    message_lower = message.lower()
    
    if any(word in message_lower for word in ["yes", "correct", "go ahead", "do it"]):
        return States.EXECUTING, "approval_received"
    
    if any(word in message_lower for word in ["no", "don't", "cancel"]):
        return States.IDLE, "approval_rejected"
    
    return States.AWAITING_APPROVAL, "awaiting_clear_response"


def save_state_transition(
    db: Session,
    state: ConversationState,
    new_state: str,
    reason: str,
    intents: List[Dict],
    pending_action: Optional[str] = None,
    pending_payload: Optional[Dict] = None,
    state_context: Optional[Dict] = None
):
    """
    Save state transition to database.
    
    Args:
        db: Database session
        state: ConversationState object
        new_state: New state to transition to
        reason: Reason for transition (for logging)
        intents: Detected intents
        pending_action: Action waiting for approval (optional)
        pending_payload: Data for pending action (optional)
        state_context: Additional context (optional)
    """
    
    old_state = state.current_state
    
    state.current_state = new_state
    state.active_intents = intents if intents else None
    state.pending_action = pending_action
    state.pending_payload = pending_payload
    state.state_context = state_context
    state.last_transition_at = datetime.now()
    
    db.commit()
    
    print(f"🔄 State transition: {old_state} → {new_state} (reason: {reason})")
    
    # Log for debugging
    _log_transition(state.user_number, old_state, new_state, reason, intents)


def _log_transition(user: str, old: str, new: str, reason: str, intents: List[Dict]):
    """Log state transition for debugging."""
    intent_summary = ", ".join([f"{i['name']}({i['confidence']:.2f})" for i in intents[:2]]) if intents else "none"
    print(f"  User: {user}")
    print(f"  Intents: {intent_summary}")
    print(f"  Reason: {reason}")
