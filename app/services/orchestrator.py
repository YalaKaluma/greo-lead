# app/services/orchestrator.py
"""
Orchestration Service for Alfred's Brain

This is the core decision-making layer that routes to appropriate handlers
based on conversation state. All behavior flows through this orchestrator.
"""

from sqlalchemy.orm import Session
from typing import Dict, List, Any, Optional
from app.services.intent_service import detect_intents, format_recent_context, get_top_intent, has_conflict
from app.services.state_machine import (
    get_or_create_state, transition_state, save_state_transition, States
)
from app.services.journey_context import build_journey_context
from app.services.message_service import load_conversation_history
from app.utils.task_context import get_today_tasks, format_tasks_for_context
from openai import OpenAI
from app.config import OPENAI_API_KEY, OPENAI_MODEL
from app.models import Task
from datetime import datetime

client = OpenAI(api_key=OPENAI_API_KEY)


class OrchestrationResult:
    """Result from orchestration with response and metadata."""
    
    def __init__(
        self,
        response: str,
        state: str,
        actions: List[str] = None,
        data: Dict = None
    ):
        self.response = response
        self.state = state
        self.actions = actions or []
        self.data = data or {}


def orchestrate(
    db: Session,
    user_number: str,
    user_message: str,
    channel: str = "whatsapp"
) -> OrchestrationResult:
    """
    Main orchestration entry point.
    
    This function:
    1. Loads/creates conversation state
    2. Detects intents
    3. Determines state transition
    4. Routes to appropriate handler
    5. Saves new state
    6. Returns response
    
    Args:
        db: Database session
        user_number: User identifier
        user_message: The user's message
        channel: Communication channel (whatsapp/email)
        
    Returns:
        OrchestrationResult with response and metadata
    """
    
    print(f"\n{'='*60}")
    print(f"🧠 BRAIN ORCHESTRATION")
    print(f"User: {user_number}")
    print(f"Message: {user_message[:100]}...")
    print(f"{'='*60}")
    
    # Step 1: Load conversation state
    state = get_or_create_state(db, user_number)
    print(f"📍 Current state: {state.current_state}")
    
    # Step 2: Detect intents
    history = load_conversation_history(db, user_number)
    recent_context = format_recent_context(history, limit=3)
    
    intent_result = detect_intents(
        user_message=user_message,
        recent_context=recent_context,
        current_state=state.current_state
    )
    
    intents = intent_result["intents"]
    explicit_execution = intent_result["explicit_execution"]
    
    print(f"🎯 Intents detected:")
    for intent in intents[:2]:  # Show top 2
        print(f"   - {intent['name']}: {intent['confidence']:.2f}")
    print(f"   Explicit execution: {explicit_execution}")
    
    # Step 3: Determine state transition
    new_state, reason = transition_state(
        db=db,
        state=state,
        intents=intents,
        explicit_execution=explicit_execution,
        user_message=user_message
    )
    
    # Step 4: Route to appropriate handler
    handlers = {
        States.IDLE: handle_idle,
        States.COACHING: handle_coaching,
        States.CLARIFYING: handle_clarifying,
        States.DRAFTING: handle_drafting,
        States.AWAITING_APPROVAL: handle_awaiting_approval,
        States.EXECUTING: handle_executing,
        States.REVIEWING: handle_reviewing,
        States.LEARNING: handle_learning,
        States.PROACTIVE: handle_proactive,
    }
    
    handler = handlers.get(new_state, handle_idle)
    result = handler(
        db=db,
        user_number=user_number,
        user_message=user_message,
        intents=intents,
        explicit_execution=explicit_execution,
        current_state=state,
        reason=reason
    )
    
    # Step 5: Save state transition
    save_state_transition(
        db=db,
        state=state,
        new_state=new_state,
        reason=reason,
        intents=intents,
        pending_action=result.data.get('pending_action'),
        pending_payload=result.data.get('pending_payload'),
        state_context=result.data.get('state_context')
    )
    
    print(f"✅ Response generated ({len(result.response)} chars)")
    print(f"{'='*60}\n")
    
    return result


# ============================================================
# HANDLER FUNCTIONS (One per state)
# ============================================================

def handle_idle(
    db: Session,
    user_number: str,
    user_message: str,
    intents: List[Dict],
    explicit_execution: bool,
    current_state: Any,
    reason: str
) -> OrchestrationResult:
    """
    Handle IDLE state - default listening mode.
    """
    
    top_intent = get_top_intent(intents)
    
    if not top_intent or top_intent['confidence'] < 0.3:
        return OrchestrationResult(
            response="I'm not sure I understand. Could you clarify?",
            state=States.IDLE
        )
    
    # Generate contextual response
    response = _generate_gpt_response(
        db=db,
        user_number=user_number,
        user_message=user_message,
        state=States.IDLE,
        system_context="You are in listening mode. Respond naturally and helpfully."
    )
    
    return OrchestrationResult(
        response=response,
        state=States.IDLE
    )


def handle_coaching(
    db: Session,
    user_number: str,
    user_message: str,
    intents: List[Dict],
    explicit_execution: bool,
    current_state: Any,
    reason: str
) -> OrchestrationResult:
    """
    Handle COACHING state - reflective, developmental mode.
    
    CRITICAL RULES:
    1. Do NOT create tasks unless explicitly asked
    2. Do NOT solve problems unprompted
    3. DO mirror emotions
    4. DO ask ONE reflective question max
    5. DO capture journey signals
    """
    
    print(f"💭 COACHING MODE ACTIVE")
    
    # Check if user explicitly requests action
    if explicit_execution and any(i['name'] == 'EXECUTE' for i in intents if i['confidence'] > 0.7):
        return OrchestrationResult(
            response="Would you like me to capture this as a task?",
            state=States.AWAITING_APPROVAL,
            data={'pending_action': 'PROPOSE_TASK'}
        )
    
    # Generate coaching response
    journey_context = build_journey_context(db, user_number)
    
    coaching_prompt = f"""You are Alfred in COACHING mode.

User said: "{user_message}"

Journey context:
{journey_context}

Your role (CRITICAL RULES):
1. MIRROR their emotion/experience first
2. ASK one reflective question (max)
3. NO solutions, NO task creation, NO optimization
4. Keep response under 280 characters
5. Use their exact language, not business jargon

Examples:

User: "I felt overwhelmed in that board meeting"
Alfred: "Board meetings can be intense, especially when you're carrying a lot. What specifically felt overwhelming?"

User: "I'm struggling to delegate to my team"
Alfred: "It sounds like letting go is hard right now. What would need to be true for you to feel comfortable delegating?"

Generate response:
"""
    
    response = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {"role": "system", "content": coaching_prompt},
            {"role": "user", "content": user_message}
        ],
        temperature=0.7,
        max_tokens=150
    )
    
    coaching_response = response.choices[0].message.content.strip()
    
    # Extract journey signals (implement in Phase 3)
    # For now, log that we would capture signals
    print(f"📝 Would extract journey signals here")
    
    return OrchestrationResult(
        response=coaching_response,
        state=States.COACHING,
        actions=['capture_journey_signals']
    )


# Add this import at the top
from app.models import Task
from datetime import datetime


# Replace handle_clarifying function:
def handle_clarifying(
        db: Session,
        user_number: str,
        user_message: str,
        intents: List[Dict],
        explicit_execution: bool,
        current_state: Any,
        reason: str
) -> OrchestrationResult:
    """
    Handle CLARIFYING state - asking for missing information.

    For now, create the task directly with what we have.
    Later: check for missing fields and ask for them.
    """

    # Extract task title from message
    # Remove common action words
    title = user_message
    for word in ["add task", "create task", "remind me to", "todo:", "task:"]:
        title = title.replace(word, "").strip()

    # Create the task
    new_task = Task(
        user_number=user_number,
        title=title[:200],  # Limit to 200 chars
        status="open",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )

    db.add(new_task)
    db.commit()
    db.refresh(new_task)

    return OrchestrationResult(
        response=f"✅ Task created: {title}",
        state=States.EXECUTING,
        actions=['task_created'],
        data={'task_id': new_task.id}
    )


# Replace handle_executing function:
def handle_executing(
        db: Session,
        user_number: str,
        user_message: str,
        intents: List[Dict],
        explicit_execution: bool,
        current_state: Any,
        reason: str
) -> OrchestrationResult:
    """
    Handle EXECUTING state - action completed, return to IDLE.
    """

    return OrchestrationResult(
        response="Done! Anything else?",
        state=States.IDLE
    )

def handle_drafting(
    db: Session,
    user_number: str,
    user_message: str,
    intents: List[Dict],
    explicit_execution: bool,
    current_state: Any,
    reason: str
) -> OrchestrationResult:
    """
    Handle DRAFTING state - proposing action before executing.
    """
    
    # Generate a draft proposal
    proposal = f"I can help with that. Would you like me to create a task for: '{user_message}'?"
    
    return OrchestrationResult(
        response=proposal,
        state=States.AWAITING_APPROVAL,
        data={
            'pending_action': 'CREATE_TASK',
            'pending_payload': {'title': user_message}
        }
    )


def handle_awaiting_approval(
    db: Session,
    user_number: str,
    user_message: str,
    intents: List[Dict],
    explicit_execution: bool,
    current_state: Any,
    reason: str
) -> OrchestrationResult:
    """
    Handle AWAITING_APPROVAL state - user is confirming/rejecting proposal.
    """
    
    message_lower = user_message.lower()
    
    if any(word in message_lower for word in ["yes", "correct", "go ahead", "do it"]):
        # User approved - execute the pending action
        pending_action = current_state.pending_action
        pending_payload = current_state.pending_payload
        
        # For now, just confirm (actual task creation in Phase 2)
        return OrchestrationResult(
            response=f"Task created! ✅",
            state=States.EXECUTING,
            actions=['execute_pending_action'],
            data={'action': pending_action, 'payload': pending_payload}
        )
    
    elif any(word in message_lower for word in ["no", "don't", "cancel"]):
        return OrchestrationResult(
            response="No problem, I won't create that.",
            state=States.IDLE
        )
    
    else:
        return OrchestrationResult(
            response="I'm not sure - should I create this task? (Yes/No)",
            state=States.AWAITING_APPROVAL
        )


def handle_reviewing(
    db: Session,
    user_number: str,
    user_message: str,
    intents: List[Dict],
    explicit_execution: bool,
    current_state: Any,
    reason: str
) -> OrchestrationResult:
    """
    Handle REVIEWING state - end-of-day/week reflection.
    """
    
    # For now, treat like coaching
    return handle_coaching(
        db, user_number, user_message, intents, 
        explicit_execution, current_state, reason
    )


def handle_learning(
    db: Session,
    user_number: str,
    user_message: str,
    intents: List[Dict],
    explicit_execution: bool,
    current_state: Any,
    reason: str
) -> OrchestrationResult:
    """
    Handle LEARNING state - user is correcting Alfred.
    """
    
    # Store user preference (implement in Phase 3)
    print(f"📚 Would store user preference: {user_message}")
    
    return OrchestrationResult(
        response="Got it. I'll remember that.",
        state=States.IDLE,
        actions=['store_user_preference']
    )


def handle_proactive(
    db: Session,
    user_number: str,
    user_message: str,
    intents: List[Dict],
    explicit_execution: bool,
    current_state: Any,
    reason: str
) -> OrchestrationResult:
    """
    Handle PROACTIVE state - system-initiated nudge.
    """
    
    # Nudge should have already been sent
    # This handles the user's response to the nudge
    return handle_coaching(
        db, user_number, user_message, intents,
        explicit_execution, current_state, reason
    )


# ============================================================
# HELPER FUNCTIONS
# ============================================================

def _generate_gpt_response(
    db: Session,
    user_number: str,
    user_message: str,
    state: str,
    system_context: str
) -> str:
    """Generate GPT response with full context."""
    
    journey_context = build_journey_context(db, user_number)
    tasks = get_today_tasks(user_number)
    tasks_context = format_tasks_for_context(tasks) or "No tasks scheduled for today."
    history = load_conversation_history(db, user_number)
    
    system_prompt = f"""You are Alfred, an AI Chief of Staff.

Current mode: {state}
{system_context}

Journey Memory:
{journey_context}

Today's Tasks:
{tasks_context}

Reply concisely and warmly.
"""
    
    messages = [{"role": "system", "content": system_prompt}, *history[-10:]]
    
    response = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=messages,
        temperature=0.7,
        max_tokens=200
    )
    
    return response.choices[0].message.content.strip()
