from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

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

    return {
        "reply": reply,
        "tour_action": tour_action,
        "timestamp": datetime.utcnow().isoformat(),
        "state": result.state,  # Include state for debugging
        "actions": result.actions  # Include actions taken
    }


@router.get("/chat/history")
async def get_chat_history(
        user_number: str,
        limit: int = 50,  # Increased from 10 to 50 for better context
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
                "timestamp": msg.timestamp.isoformat()
            }
            for msg in messages
        ]

        return {"messages": formatted_messages}

    except Exception as e:
        print(f"Error loading chat history: {e}")
        return {"messages": []}


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