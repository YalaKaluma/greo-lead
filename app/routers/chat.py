from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app.models import Message

from app.db import get_db
from app.models import User, OnboardingStep
from app.services.orchestrator import orchestrate
from app.services.message_service import load_conversation_history, save_message

router = APIRouter()


class ChatMessage(BaseModel):
    user_number: str
    message: str


class ChatHistoryResponse(BaseModel):
    role: str
    content: str
    timestamp: str


class JumpToStageRequest(BaseModel):
    user_number: str
    stage: str


@router.post("/chat")
async def send_chat_message(
        chat_msg: ChatMessage,
        db: Session = Depends(get_db)
):
    """
    In-app chat endpoint. Uses the same brain as WhatsApp/Email.
    Supports onboarding guidance and contextual help.
    """

    print(f"\n🔵 WEB CHAT MESSAGE RECEIVED:")
    print(f"   User: {chat_msg.user_number}")
    print(f"   Message: {chat_msg.message}")

    # Get user to check onboarding status
    user = db.query(User).filter(User.phone_number == chat_msg.user_number).first()

    # Save user message to history
    save_message(
        db=db,
        sender="user",
        user_number=chat_msg.user_number,
        content=chat_msg.message
    )

    # Process message using brain orchestrator (same as WhatsApp/Email)
    result = orchestrate(
        db=db,
        user_number=chat_msg.user_number,
        user_message=chat_msg.message,
        channel="chat"
    )

    reply = result.response

    # Save assistant response to history
    save_message(
        db=db,
        sender="assistant",
        user_number=chat_msg.user_number,
        content=reply
    )

    print(f"   Alfred Response: {reply}")
    print(f"🔵 WEB CHAT MESSAGE COMPLETE\n")

    # Check if this triggers any tour actions (for onboarding)
    tour_action = None
    if user and user.onboarding_step != OnboardingStep.COMPLETED:
        tour_action = check_tour_trigger(chat_msg.message, user.onboarding_step)

    # Extract goal review status from result data
    goal_review_status = result.data.get('goal_review_status')

    return {
        "reply": reply,
        "tour_action": tour_action,
        "timestamp": datetime.utcnow().isoformat(),
        "state": result.state,
        "actions": result.actions,
        "goal_review_status": goal_review_status
    }


@router.post("/goal-review/jump-to-stage")
async def jump_to_stage(
        request: JumpToStageRequest,
        db: Session = Depends(get_db)
):
    """
    Manually jump to a specific stage in an active goal review session.
    Allows users to click on progress dots to navigate stages.
    """
    from app.services.state_machine import get_or_create_state, States
    
    print(f"🎯 Stage jump requested: {request.user_number} -> {request.stage}")
    
    # Get current state
    state = get_or_create_state(db, request.user_number)
    
    # Verify user is in goal review
    if state.current_state != States.GOAL_REVIEW:
        return {
            "success": False,
            "message": "No active goal review session. Start a session first."
        }
    
    # Valid stages
    valid_stages = ['framing', 'reflection', 'diagnosis', 'adjustment', 'closure']
    
    if request.stage not in valid_stages:
        raise HTTPException(status_code=400, detail=f"Invalid stage: {request.stage}")
    
    # Update state context
    state_ctx = state.state_context or {}
    old_stage = state_ctx.get('stage', 'framing')
    state_ctx['stage'] = request.stage
    state.state_context = state_ctx
    db.commit()
    
    print(f"✅ Stage jumped: {old_stage} -> {request.stage}")
    
    # Generate stage-specific prompt
    stage_messages = {
        'framing': "Let's start fresh. What goal would you like to review?",
        'reflection': "Tell me about your progress over the last two weeks. What went well? What didn't?",
        'diagnosis': "Based on what you've shared, let's identify what's really getting in the way.",
        'adjustment': "Now let's figure out what concrete adjustments would help most.",
        'closure': "Let's wrap this up and create your action plan for the week."
    }
    
    message = stage_messages.get(request.stage, f"Moved to {request.stage} stage.")
    
    # Save system message
    save_message(
        db=db,
        sender="assistant",
        user_number=request.user_number,
        content=message
    )
    
    return {
        "success": True,
        "message": message,
        "stage": request.stage,
        "timestamp": datetime.utcnow().isoformat()
    }


@router.post("/goal-review/end")
async def end_goal_review_session(
        user_number: str,
        db: Session = Depends(get_db)
):
    """
    Explicitly end an active goal review session.
    Saves tasks and summary from conversation so far.
    """
    from app.services.state_machine import get_or_create_state, States
    from app.services.orchestrator import _finalize_goal_review_session
    
    print(f"🛑 Explicit goal review end requested by user: {user_number}")
    
    # Get current state
    state = get_or_create_state(db, user_number)
    
    if state.current_state != States.GOAL_REVIEW:
        return {
            "success": False,
            "message": "No active goal review session"
        }
    
    state_ctx = state.state_context or {}
    
    # Finalize session - extract tasks and save summary
    try:
        tasks_created = _finalize_goal_review_session(
            db=db,
            user_number=user_number,
            state_ctx=state_ctx,
            force_end=True  # Skip closure prompts, just save what we have
        )
        
        print(f"✅ Session finalized: {len(tasks_created)} tasks created")
        
    except Exception as e:
        print(f"⚠️ Error finalizing session: {e}")
        tasks_created = 0
    
    # Clear state and return to IDLE
    state.current_state = States.IDLE
    state.state_context = None
    db.commit()
    
    # Save a system message
    message = f"Goal review session ended. I've saved {tasks_created} task{'s' if tasks_created != 1 else ''} from our conversation. What would you like to do next?"
    save_message(
        db=db,
        sender="assistant",
        user_number=user_number,
        content=message
    )
    
    print(f"✅ Goal review session ended for {user_number}")
    
    return {
        "success": True,
        "message": message,
        "tasks_created": tasks_created,
        "timestamp": datetime.utcnow().isoformat()
    }


@router.get("/chat/history")
async def get_chat_history(
        user_number: str,
        limit: int = 50,
        db: Session = Depends(get_db)
):
    """
    Retrieve recent chat history for the user.
    Returns last N messages from ALL channels (WhatsApp, Email, Web).
    """

    try:
        from app.models import Message

        # Load messages directly from database with actual timestamps
        messages = (
            db.query(Message)
            .filter(Message.user_number == user_number)
            .order_by(Message.timestamp.desc())
            .limit(limit)
            .all()
        )

        # Reverse to get chronological order
        messages = reversed(messages)

        # Format for frontend

        formatted_messages = [
            {
                "role": "user" if msg.sender == "user" else "assistant",
                "content": msg.content,
                "timestamp": msg.timestamp.isoformat(),
                "message_type": getattr(msg, "message_type", "chat"),
                "is_read": getattr(msg, "is_read", True)
            }
            for msg in messages
        ]

        return {"messages": formatted_messages}

    except Exception as e:
        print(f"Error loading chat history: {e}")
        return {"messages": []}

@router.get("/chat/unread-nudges")
def get_unread_nudges(
    user_number: str,
    db: Session = Depends(get_db)
):
    count = db.query(Message).filter(
        Message.user_number == user_number,
        Message.message_type == "nudge",
        Message.is_read == False
    ).count()

    return {"count": count}

@router.post("/chat/mark-nudges-read")
def mark_nudges_read(
    user_number: str,
    db: Session = Depends(get_db)
):
    db.query(Message).filter(
        Message.user_number == user_number,
        Message.message_type == "nudge",
        Message.is_read == False
    ).update({"is_read": True})

    db.commit()

    return {"status": "success"}



@router.post("/chat/welcome")
async def send_welcome_message(
        user_number: str,
        db: Session = Depends(get_db)
):
    """
    Triggered when user first opens the app.
    Alfred sends a proactive welcome message.
    """

    user = db.query(User).filter(User.phone_number == user_number).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Determine welcome message based on onboarding status
    if user.onboarding_step == OnboardingStep.COMPLETED:
        welcome = f"""Hey {user.name}! 👋

Welcome to your Leadership OS. I'm here in the app too - click on me anytime you need help or want to chat.

What would you like to work on today?"""
    else:
        welcome = f"""Welcome to Leadership OS, {user.name}! 🎉

I'm Alfred, your AI Chief of Staff. I'm here to guide you through your first steps.

Ready to explore? Let's start with your goals!"""

    return {
        "message": welcome,
        "timestamp": datetime.utcnow().isoformat()
    }


def check_tour_trigger(message: str, onboarding_step: OnboardingStep) -> Optional[str]:
    """
    Check if user's message should trigger a specific tour step.
    Returns tour action to take, or None.
    """

    message_lower = message.lower()

    # Tour navigation triggers
    if "goals" in message_lower or "goal" in message_lower:
        return "navigate_goals"

    if "tasks" in message_lower or "todo" in message_lower or "to-do" in message_lower:
        return "navigate_tasks"

    if "team" in message_lower:
        return "navigate_team"

    if "journey" in message_lower:
        return "navigate_journey"

    if "habits" in message_lower or "habit" in message_lower:
        return "navigate_habits"

    # Help triggers
    if any(word in message_lower for word in ["help", "how", "what", "explain"]):
        return "show_help"

    return None


@router.post("/chat/notify")
async def notify_user(
        user_number: str,
        message: str,
        db: Session = Depends(get_db)
):
    """
    Send a proactive notification from Alfred.
    Used for onboarding guidance, tips, or celebrations.
    """

    # This endpoint allows backend to push messages to the chat
    # The message is saved to the conversation history
    save_message(
        db=db,
        sender="assistant",
        user_number=user_number,
        content=message
    )

    return {
        "status": "sent",
        "message": message,
        "timestamp": datetime.utcnow().isoformat()
    }
