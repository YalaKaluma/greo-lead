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
from app.models import Task, JourneyGoal, GoalReviewSession
from app.services.task_service import create_task

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

    print(f"\n{'=' * 60}")
    print(f"🧠 BRAIN ORCHESTRATION")
    print(f"User: {user_number}")
    print(f"Message: {user_message[:100]}...")
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
        reason: str
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
    history = load_conversation_history(db, user_number) or []
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
            if not isinstance(t, dict) or "title" not in t:
                print(f"⚠️ Skipping invalid task #{i}: {t}")
                continue

            due_in_days = t.get("due_in_days", 7)
            due_date = datetime.utcnow() + timedelta(days=due_in_days) if due_in_days else None

            task = create_task(
                db=db,
                user_number=user_number,
                title=t["title"],
                notes=t.get("notes"),
                due_date=due_date,
                priority=t.get("priority", "Medium"),
                goal_id=state_ctx.get("goal_id")
            )

            created_tasks.append(task.id)
            print(f"✅ Created task #{i}: {t['title']} (ID: {task.id})")

        except Exception as e:
            print(f"❌ Failed to create task #{i}: {e}")
            continue

    # Save session to database
    from dateutil import parser as date_parser
    session_started = date_parser.parse(state_ctx["session_started_at"]) if isinstance(
        state_ctx.get("session_started_at"), str) else state_ctx.get("session_started_at", datetime.utcnow())

    session = GoalReviewSession(
        user_number=user_number,
        goal_id=state_ctx.get("goal_id"),
        goal_title=state_ctx.get("goal_title", ""),
        session_started_at=session_started,
        session_ended_at=datetime.utcnow(),
        summary=summary.get("summary"),
        key_progress=summary.get("key_progress"),
        key_blockers=summary.get("key_blockers"),
        key_pattern=summary.get("key_pattern"),
        chosen_adjustment=summary.get("chosen_adjustment"),
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
    phase_map = {
        "select_goal": {"number": 0, "name": "Select Goal"},
        "framing": {"number": 1, "name": "Framing"},
        "reflection": {"number": 2, "name": "Reflection"},
        "diagnosis": {"number": 3, "name": "Diagnosis"},
        "adjustment": {"number": 4, "name": "Adjustment"},
        "closure": {"number": 5, "name": "Creating Tasks"}
    }

    phase_info = phase_map.get(phase, {"number": 0, "name": "Unknown"})

    return {
        "active": True,
        "phase": phase,
        "phase_name": phase_info["name"],
        "phase_number": phase_info["number"],
        "total_phases": 5,
        "goal_title": state_ctx.get("goal_title", ""),
        "goal_id": state_ctx.get("goal_id"),
        "session_id": state_ctx.get("session_id")
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
        "Which long-term goal would you like to review?",
        "Reply with the number or the goal name. (You can type 'cancel' anytime.)"
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
    return f"""LONG-TERM GOAL:
- {ctx.get('goal_title')}

MEDIUM-TERM GOALS:
{mg_txt}

SHORT-TERM GOALS:
{sg_txt}
"""


def _run_goal_review_prompt(
        prompt_path: str,
        journey_context: str,
        goal_tree: str,
        recent_history: List[Dict[str, str]],
        user_input: str = ""
) -> str:
    """
    Run a goal review prompt phase.
    Returns the GPT response as a string.
    """
    prompt = load_prompt(prompt_path)

    system_prompt = f"""{prompt['system_prompt']}

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

    resp = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=messages,
        temperature=0.3,
        max_tokens=1000,  # Increased from 500 to allow for more tasks
        response_format={"type": "json_object"} if "summary" in prompt_path else None  # Force JSON for summary
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
        reason: str
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

    At closure:
      - Alfred generates a session summary (internal)
      - Alfred deterministically creates tasks
      - Session memory is persisted
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
    long_goals = [g for g in goals if (g.time_horizon or "").lower() == "long"]

    if not long_goals:
        return OrchestrationResult(
            response="I don't see any long-term goals yet. Add one in My Vision & Goals, then we can do a review.",
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
            th = (g.time_horizon or "").lower()
            if th == "medium":
                medium.append({"id": g.id, "title": g.title or (g.goal_text or "")[:80]})
            elif th == "short":
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
    history = load_conversation_history(db, user_number) or []
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
            recent_history=history
        )
        state_ctx["phase"] = "reflection"
        print(f"✅ Phase transition: framing → reflection")
        return OrchestrationResult(
            response=text,
            state=States.GOAL_REVIEW,
            data={
                "state_context": state_ctx,
                "goal_review_status": _build_goal_review_status("framing", state_ctx)
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
            user_input=user_message
        )
        state_ctx["phase"] = "diagnosis"
        print(f"✅ Phase transition: reflection → diagnosis")
        return OrchestrationResult(
            response=text,
            state=States.GOAL_REVIEW,
            data={
                "state_context": state_ctx,
                "goal_review_status": _build_goal_review_status("reflection", state_ctx)
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
            user_input=user_message
        )
        state_ctx["phase"] = "adjustment"
        print(f"✅ Phase transition: diagnosis → adjustment")
        return OrchestrationResult(
            response=text,
            state=States.GOAL_REVIEW,
            data={
                "state_context": state_ctx,
                "goal_review_status": _build_goal_review_status("diagnosis", state_ctx)
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
            user_input=user_message
        )
        state_ctx["phase"] = "closure"
        print(f"✅ Phase transition: adjustment → closure")
        return OrchestrationResult(
            response=text,
            state=States.GOAL_REVIEW,
            data={
                "state_context": state_ctx,
                "goal_review_status": _build_goal_review_status("adjustment", state_ctx)
            }
        )

    # --------------------------------------------------------------
    # Phase 5 — Closure (DECISIVE)
    # --------------------------------------------------------------
    print(f"📍 PHASE 5: CLOSURE - Creating tasks and saving session")

    closure_text = _run_goal_review_prompt(
        f"{prompt_base}/closure.yaml",
        journey_context=journey_context,
        goal_tree=goal_tree,
        recent_history=history,
        user_input=user_message
    )

    # Finalize session using shared function
    tasks_created = _finalize_goal_review_session(
        db=db,
        user_number=user_number,
        state_ctx=state_ctx,
        force_end=False
    )

    print(f"🎉 GOAL REVIEW SESSION COMPLETE - Returning to IDLE state")

    # Add completion message to the closure text
    completion_msg = f"\n\n✅ **Session complete!** I've created {tasks_created} task{'s' if tasks_created != 1 else ''} and saved our review. You can find your new tasks in your todo list."

    return OrchestrationResult(
        response=closure_text + completion_msg,
        state=States.IDLE,
        data={"state_context": None}
    )