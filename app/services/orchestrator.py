# app/services/orchestrator.py
"""
Orchestration Service for Alfred's Brain

This is the core decision-making layer that routes to appropriate handlers
based on conversation state. All behavior flows through this orchestrator.
"""

import json
from uuid import uuid4
from datetime import datetime
from typing import Dict, List, Any, Optional
from sqlalchemy.orm import Session
from openai import OpenAI

from app.services.prompt_service import load_prompt
from app.services.intent_service import detect_intents, format_recent_context, get_top_intent, has_conflict
from app.services.state_machine import (
    get_or_create_state, transition_state, save_state_transition, States
)
from app.services.journey_context import build_journey_context
from app.services.message_service import load_conversation_history
from app.utils.task_context import get_today_tasks, format_tasks_for_context
from app.config import OPENAI_API_KEY, OPENAI_MODEL
from app.models import Task, JourneyGoal, GoalReviewSession, User
from app.services.task_service import create_task
from app.services.people_review_orchestrator import handle_people_review_session
from app.services.language import normalize_language, response_language_instruction

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
        channel: str = "whatsapp",
        preferred_language: str | None = None
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

    print(f"\n{'=' * 60}")
    print(f"🧠 BRAIN ORCHESTRATION")
    print(f"User: {user_number}")
    if preferred_language is None:
        user = db.query(User).filter(User.phone_number == user_number).first()
        preferred_language = getattr(user, "language_preference", None)
    preferred_language = normalize_language(preferred_language)
    print(f"Message: {user_message[:100]}...")
    print(f"Preferred language: {preferred_language}")
    print(f"{'=' * 60}")

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

    # CRITICAL: Check for explicit goal review request - override any state
    top_intent = intents[0] if intents else None
    if top_intent and top_intent['name'] == 'GOAL_REVIEW' and top_intent['confidence'] > 0.7:
        # Check if user is explicitly starting a NEW goal review
        keywords = ["goal review", "review session", "review my goal", "do a review"]
        if any(kw in user_message.lower() for kw in keywords):
            print(f"🔄 FORCING STATE TRANSITION: {state.current_state} → GOAL_REVIEW")
            print(f"   Reason: Explicit goal review request detected")
            # Clear any existing state context to start fresh
            state.state_context = None
            new_state = States.GOAL_REVIEW
            reason = "explicit_goal_review_request"
        else:
            # Normal state transition
            new_state, reason = transition_state(
                db=db,
                state=state,
                intents=intents,
                explicit_execution=explicit_execution,
                user_message=user_message
            )
    # CRITICAL: Check for explicit people review request - override any state
    elif top_intent and top_intent['name'] == 'PEOPLE_REVIEW' and top_intent['confidence'] > 0.7:
        keywords = ["people review", "relationship review", "review my relationship", "review my people"]
        if any(kw in user_message.lower() for kw in keywords):
            print(f"🔄 FORCING STATE TRANSITION: {state.current_state} → PEOPLE_REVIEW")
            print(f"   Reason: Explicit people review request detected")
            state.state_context = None
            new_state = States.PEOPLE_REVIEW
            reason = "explicit_people_review_request"
        else:
            new_state, reason = transition_state(
                db=db,
                state=state,
                intents=intents,
                explicit_execution=explicit_execution,
                user_message=user_message
            )
    # CRITICAL: Check for explicit leadership coaching request - override any state
    elif top_intent and top_intent['name'] == 'LEADERSHIP_COACHING' and top_intent['confidence'] > 0.7:
        keywords = ["leadership coaching", "leadership session", "work on my leadership", "be a better leader", "leadership development", "start leadership"]
        if any(kw in user_message.lower() for kw in keywords):
            print(f"🔄 FORCING STATE TRANSITION: {state.current_state} → LEADERSHIP_COACHING")
            print(f"   Reason: Explicit leadership coaching request detected")
            state.state_context = None
            new_state = States.LEADERSHIP_COACHING
            reason = "explicit_leadership_coaching_request"
        else:
            new_state, reason = transition_state(
                db=db,
                state=state,
                intents=intents,
                explicit_execution=explicit_execution,
                user_message=user_message
            )
    else:
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
        States.GOAL_REVIEW: handle_goal_review,
        States.PEOPLE_REVIEW: handle_people_review,
        States.LEADERSHIP_COACHING: handle_leadership_coaching,
    }

    handler = handlers.get(new_state, handle_idle)
    result = handler(
        db=db,
        user_number=user_number,
        user_message=user_message,
        intents=intents,
        explicit_execution=explicit_execution,
        current_state=state,
        reason=reason,
        preferred_language=preferred_language
    )

    # Step 5: Save state transition
    save_state_transition(
        db=db,
        state=state,
        new_state=result.state,
        reason=reason,
        intents=intents,
        pending_action=result.data.get('pending_action'),
        pending_payload=result.data.get('pending_payload'),
        state_context=result.data.get('state_context')
    )

    print(f"✅ Response generated ({len(result.response)} chars)")
    print(f"{'=' * 60}\n")

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
        reason: str,
        preferred_language: str = "en"
) -> OrchestrationResult:
    """
    Handle IDLE state - default listening mode.
    """

    top_intent = get_top_intent(intents)

    if not top_intent or top_intent['confidence'] < 0.3:
        return OrchestrationResult(
            response="Je ne suis pas certain de comprendre. Pouvez-vous préciser ?" if preferred_language == "fr" else "I'm not sure I understand. Could you clarify?",
            state=States.IDLE
        )

    # Generate contextual response
    response = _generate_gpt_response(
        db=db,
        user_number=user_number,
        user_message=user_message,
        state=States.IDLE,
        system_context="You are in listening mode. Respond naturally and helpfully.",
        preferred_language=preferred_language
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
        reason: str,
        preferred_language: str = "en"
) -> OrchestrationResult:
    """
    Handle COACHING state - reflective, developmental mode.

    Goals for this handler (Phase 1):
    - Use externalized prompt (versioned YAML)
    - Inject structured journey context
    - Enforce non-generic, memory-anchored coaching
    - Keep response short (WhatsApp-friendly)
    """

    print(f"💭 COACHING MODE ACTIVE")

    # If user explicitly requests action, do NOT execute immediately.
    # Keep current design: ask for approval / propose a task.
    if explicit_execution and any(i['name'] == 'EXECUTE' for i in intents if i['confidence'] > 0.7):
        return OrchestrationResult(
            response="Would you like me to capture this as a task?",
            state=States.AWAITING_APPROVAL,
            data={'pending_action': 'PROPOSE_TASK'}
        )

    # Load prompt from YAML
    prompt = load_prompt("app/prompts/coaching/coaching_v1.yaml")
    prompt_version = prompt.get("version", "unknown")
    system_rules = prompt["system_prompt"]
    style_guidelines = prompt.get("style_guidelines", "").strip()

    # Build structured journey context
    journey_context = build_journey_context(db, user_number)

    # Optional: include a small amount of recent chat history to avoid "stateless" coaching
    history = load_conversation_history(db, user_number)
    recent = history[-6:] if history else []

    # Compose system prompt with explicit context usage requirement
    system_prompt = f"""{system_rules}

{style_guidelines}

{response_language_instruction(preferred_language)}

HARD REQUIREMENTS:
- You MUST explicitly reference at least ONE item from the CONTEXT below.
- Ask EXACTLY ONE question.
- Keep the final answer under 320 characters if possible (hard max: 450).

CONTEXT:
{journey_context}
"""

    response = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            *recent,
            {"role": "user", "content": user_message},
        ],
        temperature=0.6,
        max_tokens=180
    )

    coaching_response = (response.choices[0].message.content or "").strip()

    # Enforce a hard length cap (WhatsApp readability). If the model exceeds,
    # we cut at a safe boundary rather than sending long rambles.
    HARD_MAX = 450
    if len(coaching_response) > HARD_MAX:
        coaching_response = coaching_response[:HARD_MAX].rsplit(" ", 1)[0].strip() + "…"

    # Log prompt version so we can correlate with ratings later (no DB change needed)
    print(f"🏷️ Coaching prompt version: {prompt_version}")

    return OrchestrationResult(
        response=coaching_response,
        state=States.COACHING,
        actions=['capture_journey_signals'],
        data={"prompt_version": prompt_version}
    )


def handle_clarifying(
        db: Session,
        user_number: str,
        user_message: str,
        intents: List[Dict],
        explicit_execution: bool,
        current_state: Any,
        reason: str,
        preferred_language: str = "en"
) -> OrchestrationResult:
    """
    Handle CLARIFYING state - create task with what we have.
    """

    # Extract task title from message
    title = user_message
    for word in ["add task", "create task", "remind me to", "todo:", "task:", "please"]:
        title = title.replace(word, "").replace(word.capitalize(), "").strip()

    # Create the task (FIX: use datetime.now() not utcnow(), no due_date yet)
    new_task = Task(
        user_number=user_number,
        title=title[:200],
        status="open",
        due_date=None,  # Don't set due_date unless specified
        created_at=datetime.now(),  # Changed from utcnow()
        updated_at=datetime.now()  # Changed from utcnow()
    )

    db.add(new_task)
    db.commit()
    db.refresh(new_task)

    print(f"✅ Task created: ID={new_task.id}, Title={title}")

    return OrchestrationResult(
        response=f"✅ Task created: {title}",
        state=States.EXECUTING,
        actions=['task_created'],
        data={'task_id': new_task.id, 'task_title': title}
    )


def handle_executing(
        db: Session,
        user_number: str,
        user_message: str,
        intents: List[Dict],
        explicit_execution: bool,
        current_state: Any,
        reason: str,
        preferred_language: str = "en"
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
        reason: str,
        preferred_language: str = "en"
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
        reason: str,
        preferred_language: str = "en"
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
        reason: str,
        preferred_language: str = "en"
) -> OrchestrationResult:
    """
    Handle REVIEWING state - end-of-day/week reflection.
    """

    # For now, treat like coaching
    return handle_coaching(
        db, user_number, user_message, intents,
        explicit_execution, current_state, reason, preferred_language
    )


def handle_learning(
        db: Session,
        user_number: str,
        user_message: str,
        intents: List[Dict],
        explicit_execution: bool,
        current_state: Any,
        reason: str,
        preferred_language: str = "en"
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
        reason: str,
        preferred_language: str = "en"
) -> OrchestrationResult:
    """
    Handle PROACTIVE state - system-initiated nudge.
    """

    # Nudge should have already been sent
    # This handles the user's response to the nudge
    return handle_coaching(
        db, user_number, user_message, intents,
        explicit_execution, current_state, reason, preferred_language
    )


# ============================================================
# HELPER FUNCTIONS
# ============================================================

def _generate_gpt_response(
        db: Session,
        user_number: str,
        user_message: str,
        state: str,
        system_context: str,
        preferred_language: str = "en"
) -> str:
    """Generate GPT response with full context."""

    journey_context = build_journey_context(db, user_number)
    tasks = get_today_tasks(user_number)
    tasks_context = format_tasks_for_context(tasks) or "No tasks scheduled for today."
    history = load_conversation_history(db, user_number)

    system_prompt = f"""You are Alfred, an AI Chief of Staff.

Current mode: {state}
{system_context}

{response_language_instruction(preferred_language)}

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


def _finalize_goal_review_session(
        db: Session,
        user_number: str,
        state_ctx: Dict[str, Any],
        force_end: bool = False
) -> int:
    """
    Finalize a goal review session by creating tasks and saving summary.
    Returns number of tasks created.

    Args:
        force_end: If True, skip closure prompts and just extract/save what we have
    """
    from datetime import timedelta

    journey_context = build_journey_context(db, user_number)
    history = load_conversation_history(db, user_number, conversation_type="goal_coaching") or []
    goal_tree = _format_goal_tree_for_prompt(state_ctx)
    prompt_base = "app/prompts/coaching/goal_review"

    # Generate session summary
    summary = _run_internal_prompt(
        f"{prompt_base}/session_summary.yaml",
        journey_context=journey_context,
        goal_tree=goal_tree,
        state_context=state_ctx
    )

    if not isinstance(summary, dict):
        print(f"⚠️ session_summary returned non-dict: {type(summary)}")
        summary = {}

    print(f"📋 Session summary generated:")
    print(f"   - summary: {'✅' if summary.get('summary') else '❌'}")
    print(f"   - key_progress: {'✅' if summary.get('key_progress') else '❌'}")
    print(f"   - key_blockers: {'✅' if summary.get('key_blockers') else '❌'}")
    print(f"   - key_pattern: {'✅' if summary.get('key_pattern') else '❌'}")
    print(f"   - chosen_adjustment: {'✅' if summary.get('chosen_adjustment') else '❌'}")

    # Generate tasks
    tasks = _run_internal_prompt(
        f"{prompt_base}/task_synthesis.yaml",
        journey_context=journey_context,
        goal_tree=goal_tree,
        state_context=state_ctx
    )

    if not isinstance(tasks, list):
        print(f"⚠️ task_synthesis returned non-list: {type(tasks)}")
        tasks = []

    print(f"🔨 Creating {len(tasks)} tasks from goal review session")

    created_tasks = []
    for i, t in enumerate(tasks, 1):
        try:
            if not isinstance(t, dict):
                print(f"⚠️ Skipping invalid task #{i}: not a dict")
                continue

            # Support both 'title' and 'task' field names
            title = t.get("title") or t.get("task")
            if not title:
                print(f"⚠️ Skipping invalid task #{i}: missing title/task - {t}")
                continue

            # Calculate due_date - support both formats
            due_date = None
            if "due_in_days" in t:
                due_in_days = t.get("due_in_days", 7)
                due_date = datetime.utcnow() + timedelta(days=due_in_days)
            elif "deadline" in t:
                try:
                    from dateutil import parser as date_parser
                    due_date = date_parser.parse(t["deadline"])
                except Exception:
                    due_date = datetime.utcnow() + timedelta(days=7)
            else:
                due_date = datetime.utcnow() + timedelta(days=7)

            notes = t.get("notes") or t.get("description")

            task = create_task(
                db=db,
                user_number=user_number,
                title=title,
                notes=notes,
                due_date=due_date,
                priority=t.get("priority", "Medium"),
                goal_id=state_ctx.get("goal_id")
            )

            created_tasks.append(task.id)
            print(f"✅ Created task #{i}: {title} (ID: {task.id})")

        except Exception as e:
            print(f"❌ Failed to create task #{i}: {e}")
            continue

    # Save session to database
    from dateutil import parser as date_parser
    session_started = date_parser.parse(state_ctx["session_started_at"]) if isinstance(
        state_ctx.get("session_started_at"), str) else state_ctx.get("session_started_at", datetime.utcnow())

    # Ensure summary is never NULL (database constraint)
    summary_text = summary.get("summary") or "Session completed early - summary not generated"

    session = GoalReviewSession(
        user_number=user_number,
        goal_id=state_ctx.get("goal_id"),
        goal_title=state_ctx.get("goal_title", ""),
        session_started_at=session_started,
        session_ended_at=datetime.utcnow(),
        summary=summary_text,  # Never NULL
        key_progress=summary.get("key_progress") or "Not captured",
        key_blockers=summary.get("key_blockers") or "Not captured",
        key_pattern=summary.get("key_pattern") or "Not captured",
        chosen_adjustment=summary.get("chosen_adjustment") or "Not captured",
        progress_status=state_ctx.get("progress_status"),  # NEW: Save status (green/orange/red)
        created_tasks=created_tasks,
        prompt_version="goal_review_v2"
        # Note: ended_early field not added yet - requires DB migration
    )

    db.add(session)
    db.commit()

    print(f"✅ Goal review session saved (ID: {session.id})")
    print(f"   - Goal: {session.goal_title}")
    print(f"   - Tasks created: {len(created_tasks)}")
    print(f"   - Has summary: {'Yes' if session.summary else 'No'}")
    print(f"   - Ended early: {'Yes' if force_end else 'No'}")

    return len(created_tasks)


# ============================================================
# GOAL REVIEW (NEW STATE)
# ============================================================

def _build_goal_review_status(phase: str, state_ctx: Dict[str, Any]) -> Dict[str, Any]:
    """Build goal review status metadata for frontend display."""
    # Map backend phases to frontend stages (0-indexed for 5 progress dots)
    # Frontend stages: framing(0), reflection(1), diagnosis(2), adjustment(3), closure(4)
    # Backend phases: select_goal(0), framing(1), reflection(2), diagnosis(3), adjustment(4), closure(5)
    
    phase_to_stage_map = {
        "select_goal": {"stage": "framing", "stage_index": 0, "name": "Framing"},  # Map to framing
        "framing": {"stage": "framing", "stage_index": 0, "name": "Framing"},
        "reflection": {"stage": "reflection", "stage_index": 1, "name": "Reflection"},
        "diagnosis": {"stage": "diagnosis", "stage_index": 2, "name": "Diagnosis"},
        "adjustment": {"stage": "adjustment", "stage_index": 3, "name": "Adjustment"},
        "closure": {"stage": "closure", "stage_index": 4, "name": "Closure"}
    }

    stage_info = phase_to_stage_map.get(phase, {"stage": "framing", "stage_index": 0, "name": "Framing"})

    return {
        "active": True,
        "stage": stage_info["stage"],  # Frontend expects 'stage' not 'phase'
        "stage_index": stage_info["stage_index"],  # Frontend expects 'stage_index' not 'phase_number'
        "stage_name": stage_info["name"],
        "total_stages": 5,
        "goal_title": state_ctx.get("goal_title", ""),
        "goal_id": state_ctx.get("goal_id"),
        "session_id": state_ctx.get("session_id"),
        # Keep backend fields for compatibility
        "phase": phase,
        "phase_number": stage_info["stage_index"]
    }


def _normalize_text(s: str) -> str:
    return "".join(ch.lower() for ch in (s or "") if ch.isalnum() or ch.isspace()).strip()


def _fetch_goals(db: Session, user_number: str) -> List[JourneyGoal]:
    return (
        db.query(JourneyGoal)
        .filter(JourneyGoal.user_number == user_number)
        .order_by(JourneyGoal.sort_order.asc(), JourneyGoal.id.asc())
        .all()
    )


def _build_goal_index(goals: List[JourneyGoal]) -> Dict[str, Any]:
    by_id = {g.id: g for g in goals}
    children: Dict[int, List[int]] = {}
    for g in goals:
        if g.parent_goal_id is not None:
            children.setdefault(g.parent_goal_id, []).append(g.id)
    return {"by_id": by_id, "children": children}


def _collect_descendants(index: Dict[str, Any], root_id: int) -> List[int]:
    out: List[int] = []
    stack = [root_id]
    while stack:
        cur = stack.pop()
        for cid in index["children"].get(cur, []):
            out.append(cid)
            stack.append(cid)
    return out


def _normalize_goal_level(value: str | None) -> str:
    return {
        "long": "vision",
        "long_term": "vision",
        "vision": "vision",
        "medium": "pillar",
        "medium_term": "pillar",
        "pillar": "pillar",
        "short": "outcome",
        "short_term": "outcome",
        "outcome": "outcome",
    }.get((value or "").lower(), value or "")


def _match_long_term_goal(long_goals: List[JourneyGoal], user_text: str) -> List[JourneyGoal]:
    q = _normalize_text(user_text)
    if not q:
        return []

    scored = []
    q_tokens = set(q.split())

    for g in long_goals:
        hay = _normalize_text(f"{g.title or ''} {g.goal_text or ''}")
        score = 0
        if q in hay:
            score += 60
        if q_tokens:
            h_tokens = set(hay.split())
            score += int(40 * (len(q_tokens & h_tokens) / max(1, len(q_tokens))))
        scored.append((score, g))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [g for s, g in scored if s > 0]


def _render_long_goal_menu(long_goals: List[JourneyGoal]) -> str:
    lines = [
        "Which vision would you like to review?",
        "Reply with the number or the vision name. (You can type 'cancel' anytime.)"
    ]
    for i, g in enumerate(long_goals, start=1):
        title = g.title or (g.goal_text[:60] + ("…" if g.goal_text and len(g.goal_text) > 60 else ""))
        lines.append(f"{i}. {title}")
    return "\n".join(lines)


def _format_goal_tree_for_prompt(ctx: Dict[str, Any]) -> str:
    mg = ctx.get("medium_goals") or []
    sg = ctx.get("short_goals") or []
    mg_txt = "\n".join([f"- {x['title']}" for x in mg]) or "- (none)"
    sg_txt = "\n".join([f"- {x['title']}" for x in sg]) or "- (none)"
    return f"""VISION:
- {ctx.get('goal_title')}

PILLARS:
{mg_txt}

OUTCOMES:
{sg_txt}
"""


def _run_goal_review_prompt(
        prompt_path: str,
        journey_context: str,
        goal_tree: str,
        recent_history: List[Dict[str, str]],
        user_input: str = "",
        preferred_language: str = "en"
) -> str:
    """
    Run a goal review prompt phase.
    Returns the GPT response as a string.
    """
    prompt = load_prompt(prompt_path)

    system_prompt = f"""{prompt['system_prompt']}

{response_language_instruction(preferred_language)}

GOAL TREE:
{goal_tree}

JOURNEY MEMORY:
{journey_context}
"""

    messages = [{"role": "system", "content": system_prompt}]

    def _normalize_history(history):
        out = []
        for h in history:
            if isinstance(h, dict) and "role" in h and "content" in h:
                out.append(h)
        return out

    if recent_history:
        history_msgs = _normalize_history(recent_history)
        messages.extend(recent_history[-10:])

    if user_input:
        messages.append({"role": "user", "content": user_input})

    resp = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=messages,
        temperature=0.6,
        max_tokens=260
    )
    return (resp.choices[0].message.content or "").strip()


def _run_internal_prompt(
        prompt_path: str,
        journey_context: str,
        goal_tree: str,
        state_context: Dict[str, Any]
) -> Dict[str, Any] | List[Dict[str, Any]]:
    """
    Run internal prompt for session summary or task synthesis.
    Returns parsed JSON (dict or list).
    """
    prompt = load_prompt(prompt_path)

    system_prompt = f"""{prompt['system_prompt']}

GOAL TREE:
{goal_tree}

JOURNEY MEMORY:
{journey_context}

SESSION CONTEXT:
{json.dumps(state_context, indent=2)}

CRITICAL: You MUST respond with ONLY valid JSON. No markdown, no explanations, no preamble. 
Just the raw JSON object or array. Your response should start with {{ or [.
"""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user",
         "content": "Generate the JSON output based on the session context. Return ONLY the JSON, nothing else."}
    ]

    # Determine if we need json_object or json_array based on the prompt
    use_json_object = "task_synthesis" not in prompt_path
    
    resp = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=messages,
        temperature=0.3,
        max_tokens=1000,  # Increased from 500 to allow for more tasks
        response_format={"type": "json_object"} if use_json_object else None  # Only force object for summary
    )

    content = (resp.choices[0].message.content or "").strip()

    # Strip markdown code blocks if present
    if content.startswith("```"):
        lines = content.split("\n")
        content = "\n".join(lines[1:-1]) if len(lines) > 2 else content
        content = content.replace("```json", "").replace("```", "").strip()

    # Try to parse as JSON (could be dict or list)
    try:
        parsed = json.loads(content)
        
        # If task_synthesis returned a dict with a "tasks" key, extract the array
        if "task_synthesis" in prompt_path and isinstance(parsed, dict) and "tasks" in parsed:
            return parsed["tasks"]
        
        return parsed
    except Exception as e:
        print(f"⚠️ Failed to parse JSON from internal prompt: {e}")
        print(f"Raw content: {content[:400]}")
        # Return empty list for task synthesis, empty dict for summary
        if "task_synthesis" in prompt_path:
            return []
        return {}


def handle_goal_review(
        db: Session,
        user_number: str,
        user_message: str,
        intents: List[Dict],
        explicit_execution: bool,
        current_state: Any,
        reason: str,
        preferred_language: str = "en"
) -> OrchestrationResult:
    """
    Multi-phase goal review conversation.

    Phases:
      0. select_goal      – user picks a long-term goal (or we menu if ambiguous)
      1. framing          – orient them to the goal tree
      2. reflection       – "How's it going overall?"
      3. diagnosis        – deeper: progress, blockers, patterns
      4. adjustment       – pick an adjustment
      5. closure          – internal summary + create tasks
      6. status           – user sets green/orange/red progress indicator

    At closure:
      - Alfred generates a session summary (internal)
      - Alfred deterministically creates tasks
      - Session memory is persisted with status
    """

    state_ctx = current_state.state_context or {}
    phase = state_ctx.get("phase") or "select_goal"
    msg_lower = (user_message or "").lower()

    print(f"\n{'=' * 60}")
    print(f"🎯 GOAL REVIEW SESSION")
    print(f"Current phase: {phase}")
    print(f"User message: {user_message[:100]}...")
    print(f"{'=' * 60}")

    # --------------------------------------------------------------
    # Cancel anytime - MUST be explicit whole words/phrases
    # --------------------------------------------------------------
    import re
    cancel_patterns = [
        r'\bcancel\b',
        r'\bstop\b',
        r'\bexit\b',
        r'\bquit\b',
        r'\bnever\s*mind\b',
        r'\bforget\s*it\b'
    ]
    is_cancel = any(re.search(pattern, msg_lower) for pattern in cancel_patterns)

    # Additional check: message must be SHORT (< 50 chars) to be a cancel
    # Long reflective messages shouldn't trigger cancel even if they contain the word
    if is_cancel and len(user_message.strip()) < 50:
        print(f"🛑 User cancelled goal review session")
        return OrchestrationResult(
            response="✅ Goal review cancelled. I've stopped the session. What would you like to do instead?",
            state=States.IDLE,
            data={"state_context": None}
        )

    goals = _fetch_goals(db, user_number)
    long_goals = [g for g in goals if _normalize_goal_level(g.time_horizon) == "vision"]

    if not long_goals:
        return OrchestrationResult(
            response="I don't see any visions yet. Add one in My Vision & Goals, then we can do a review.",
            state=States.IDLE,
            data={"state_context": None}
        )

    # --------------------------------------------------------------
    # Phase 0 — Select goal
    # --------------------------------------------------------------
    if phase == "select_goal":
        chosen: Optional[JourneyGoal] = None
        stripped = (user_message or "").strip()

        # Numeric selection
        if stripped.isdigit():
            idx = int(stripped)
            if 1 <= idx <= len(long_goals):
                chosen = long_goals[idx - 1]

        # Text match
        if chosen is None and stripped:
            candidates = _match_long_term_goal(long_goals, user_message)

            if len(candidates) == 1:
                chosen = candidates[0]
            elif len(candidates) > 1:
                options = "\n".join(
                    [f"{i + 1}. {c.title or c.goal_text[:60]}" for i, c in enumerate(candidates[:5])]
                )
                select_ctx = {"phase": "select_goal"}
                return OrchestrationResult(
                    response=f"I found multiple matches. Which one do you mean?\n{options}",
                    state=States.GOAL_REVIEW,
                    data={
                        "state_context": select_ctx,
                        "goal_review_status": _build_goal_review_status("select_goal", select_ctx)
                    }
                )

        # Still no goal → show menu
        if chosen is None:
            select_ctx = {"phase": "select_goal"}
            return OrchestrationResult(
                response=_render_long_goal_menu(long_goals),
                state=States.GOAL_REVIEW,
                data={
                    "state_context": select_ctx,
                    "goal_review_status": _build_goal_review_status("select_goal", select_ctx)
                }
            )

        # Build goal tree
        index = _build_goal_index(goals)
        descendants = _collect_descendants(index, chosen.id)
        medium, short = [], []

        for gid in descendants:
            g = index["by_id"].get(gid)
            if not g:
                continue
            th = _normalize_goal_level(g.time_horizon)
            if th == "pillar":
                medium.append({"id": g.id, "title": g.title or (g.goal_text or "")[:80]})
            elif th == "outcome":
                short.append({"id": g.id, "title": g.title or (g.goal_text or "")[:80]})

        # >>> NEW: session bookkeeping
        state_ctx = {
            "phase": "framing",
            "goal_id": chosen.id,
            "goal_title": chosen.title or (chosen.goal_text or "")[:80],
            "time_window": "last_2_weeks",
            "medium_goals": medium,
            "short_goals": short,
            "session_id": str(uuid4()),
            "session_started_at": datetime.utcnow().isoformat()  # Convert to ISO string for JSON
        }
        phase = "framing"

    journey_context = build_journey_context(db, user_number)
    history = load_conversation_history(db, user_number, conversation_type="goal_coaching") or []
    goal_tree = _format_goal_tree_for_prompt(state_ctx)
    prompt_base = "app/prompts/coaching/goal_review"

    # --------------------------------------------------------------
    # Phase 1 — Framing
    # --------------------------------------------------------------
    if phase == "framing":
        print(f"📍 PHASE 1: FRAMING")
        text = _run_goal_review_prompt(
            f"{prompt_base}/framing.yaml",
            journey_context=journey_context,
            goal_tree=goal_tree,
            recent_history=history,
            preferred_language=preferred_language
        )
        state_ctx["phase"] = "reflection"
        print(f"✅ Phase transition: framing → reflection")
        return OrchestrationResult(
            response=text,
            state=States.GOAL_REVIEW,
            data={
                "state_context": state_ctx,
                "goal_review_status": _build_goal_review_status("reflection", state_ctx)  # FIXED: Report NEW stage
            }
        )

    # --------------------------------------------------------------
    # Phase 2 — Reflection
    # --------------------------------------------------------------
    if phase == "reflection":
        print(f"📍 PHASE 2: REFLECTION")
        state_ctx["user_reflection"] = user_message
        text = _run_goal_review_prompt(
            f"{prompt_base}/reflection.yaml",
            journey_context=journey_context,
            goal_tree=goal_tree,
            recent_history=history,
            user_input=user_message,
            preferred_language=preferred_language
        )
        state_ctx["phase"] = "diagnosis"
        print(f"✅ Phase transition: reflection → diagnosis")
        return OrchestrationResult(
            response=text,
            state=States.GOAL_REVIEW,
            data={
                "state_context": state_ctx,
                "goal_review_status": _build_goal_review_status("diagnosis", state_ctx)  # FIXED: Report NEW stage
            }
        )

    # --------------------------------------------------------------
    # Phase 3 — Diagnosis
    # --------------------------------------------------------------
    if phase == "diagnosis":
        print(f"📍 PHASE 3: DIAGNOSIS")
        state_ctx["diagnosis_input"] = user_message
        text = _run_goal_review_prompt(
            f"{prompt_base}/diagnosis.yaml",
            journey_context=journey_context,
            goal_tree=goal_tree,
            recent_history=history,
            user_input=user_message,
            preferred_language=preferred_language
        )
        state_ctx["phase"] = "adjustment"
        print(f"✅ Phase transition: diagnosis → adjustment")
        return OrchestrationResult(
            response=text,
            state=States.GOAL_REVIEW,
            data={
                "state_context": state_ctx,
                "goal_review_status": _build_goal_review_status("adjustment", state_ctx)  # FIXED: Report NEW stage
            }
        )

    # --------------------------------------------------------------
    # Phase 4 — Adjustment
    # --------------------------------------------------------------
    if phase == "adjustment":
        print(f"📍 PHASE 4: ADJUSTMENT")
        state_ctx["adjustment_input"] = user_message
        text = _run_goal_review_prompt(
            f"{prompt_base}/adjustment.yaml",
            journey_context=journey_context,
            goal_tree=goal_tree,
            recent_history=history,
            user_input=user_message,
            preferred_language=preferred_language
        )
        state_ctx["phase"] = "closure"
        print(f"✅ Phase transition: adjustment → closure")
        return OrchestrationResult(
            response=text,
            state=States.GOAL_REVIEW,
            data={
                "state_context": state_ctx,
                "goal_review_status": _build_goal_review_status("closure", state_ctx)  # FIXED: Report NEW stage
            }
        )

    # --------------------------------------------------------------
    # Phase 5 — Closure
    # --------------------------------------------------------------
    if phase == "closure":
        print(f"📍 PHASE 5: CLOSURE - Generating summary")
        
        closure_text = _run_goal_review_prompt(
            f"{prompt_base}/closure.yaml",
            journey_context=journey_context,
            goal_tree=goal_tree,
            recent_history=history,
            user_input=user_message,
            preferred_language=preferred_language
        )
        
        # Store closure summary for later
        state_ctx["closure_summary"] = closure_text
        state_ctx["phase"] = "status"
        
        print(f"✅ Phase transition: closure → status")
        return OrchestrationResult(
            response=closure_text,
            state=States.GOAL_REVIEW,
            data={
                "state_context": state_ctx,
                "goal_review_status": _build_goal_review_status("status", state_ctx)
            }
        )
    
    # --------------------------------------------------------------
    # Phase 6 — Status (NEW - Set progress indicator)
    # --------------------------------------------------------------
    print(f"📍 PHASE 6: STATUS - Getting progress indicator")
    
    # Detect status from user input
    detected_status = None
    if "green" in msg_lower or "🟢" in user_message:
        detected_status = "green"
    elif "orange" in msg_lower or "🟠" in user_message or "yellow" in msg_lower:
        detected_status = "orange"
    elif "red" in msg_lower or "🔴" in user_message:
        detected_status = "red"
    
    if detected_status:
        # User provided status - finalize session
        print(f"✅ Status detected: {detected_status}")
        state_ctx["progress_status"] = detected_status
        
        # Finalize session with status
        tasks_created = _finalize_goal_review_session(
            db=db,
            user_number=user_number,
            state_ctx=state_ctx,
            force_end=False
        )
        
        # Build final response
        status_emoji = {"green": "🟢", "orange": "🟠", "red": "🔴"}[detected_status]
        status_label = {"green": "On track", "orange": "Needs attention", "red": "At risk"}[detected_status]
        
        completion_msg = f"""Got it - marking this goal as {status_emoji} {status_label}.

✅ **Session complete!** I've created {tasks_created} task{'s' if tasks_created != 1 else ''} and saved our review. You can find your new tasks in your todo list."""
        
        print(f"🎉 GOAL REVIEW SESSION COMPLETE - Returning to IDLE state")
        
        return OrchestrationResult(
            response=completion_msg,
            state=States.IDLE,
            data={"state_context": None}
        )
    else:
        # No valid status yet - ask user
        status_prompt = """Based on our conversation, how would you rate the current progress on this goal?

🟢 Green - On track, making good progress
🟠 Orange - Needs attention, some concerns
🔴 Red - At risk, significant challenges

Just reply with the color (green, orange, or red)."""
        
        return OrchestrationResult(
            response=status_prompt,
            state=States.GOAL_REVIEW,
            data={
                "state_context": state_ctx,
                "goal_review_status": _build_goal_review_status("status", state_ctx)
            }
        )


def handle_people_review(
        db: Session,
        user_number: str,
        user_message: str,
        intents: List[Dict],
        explicit_execution: bool,
        current_state: Any,
        reason: str,
        preferred_language: str = "en"
) -> OrchestrationResult:
    """
    Handle PEOPLE_REVIEW state - structured relationship review sessions.
    
    Delegates to people_review_orchestrator for phase management.
    """
    
    state_ctx = current_state.state_context or {}
    
    # If no phase set, start with select_person
    if 'phase' not in state_ctx:
        state_ctx['phase'] = 'select_person'
    
    # Delegate to orchestrator
    result = handle_people_review_session(
        db=db,
        user_number=user_number,
        user_message=user_message,
        state_context=state_ctx,
        preferred_language=preferred_language
    )
    
    # Extract response and next state
    response = result['response']
    next_phase = result['next_phase']
    updated_context = result['state_context']
    
    # Determine next state
    if next_phase == 'completed':
        next_state = States.IDLE
        updated_context = None
    else:
        next_state = States.PEOPLE_REVIEW
        if updated_context:
            updated_context['phase'] = next_phase
    
    return OrchestrationResult(
        response=response,
        state=next_state,
        data={
            'state_context': updated_context,
            'people_review_status': {
                'active': next_phase != 'completed',
                'phase': next_phase
            } if next_phase != 'completed' else None
        }
    )


def handle_leadership_coaching(
        db: Session,
        user_number: str,
        user_message: str,
        intents: List[Dict],
        explicit_execution: bool,
        current_state: Any,
        reason: str,
        preferred_language: str = "en"
) -> OrchestrationResult:
    """
    Handle LEADERSHIP_COACHING state - structured leadership development sessions.
    
    Delegates to leadership_coaching_orchestrator for phase management.
    Follows the same pattern as goal_review and people_review.
    """
    
    from app.services.leadership_coaching_orchestrator import orchestrate_leadership_coaching
    
    print(f"\n{'=' * 60}")
    print(f"🧭 LEADERSHIP COACHING SESSION")
    print(f"User message: {user_message[:100]}...")
    print(f"{'=' * 60}")
    
    # Call the leadership coaching orchestrator
    result = orchestrate_leadership_coaching(
        db=db,
        user_number=user_number,
        user_message=user_message,
        preferred_language=preferred_language
    )
    
    # Extract response and metadata
    response = result["response"]
    completed = result.get("completed", False)
    session_id = result.get("session_id")
    next_phase = result.get("next_phase")
    
    # Determine next state
    if completed:
        next_state = States.IDLE
        state_context = None
        print(f"✅ Leadership coaching session completed")
    else:
        next_state = States.LEADERSHIP_COACHING
        state_context = {
            "session_id": session_id,
            "phase": next_phase
        }
        print(f"📍 Continuing in phase: {next_phase}")
    
    return OrchestrationResult(
        response=response,
        state=next_state,
        data={
            'state_context': state_context,
            'leadership_coaching_status': {
                'active': not completed,
                'session_id': session_id,
                'phase': next_phase
            } if not completed else None
        }
    )
