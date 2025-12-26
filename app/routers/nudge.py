"""
Nudge Router - Proactive Check-ins and Reflections

This module handles scheduled nudges (morning, evening, weekly, Sunday review)
sent to users via WhatsApp. All nudges use FULL context for personalization:
- Journey context (strengths, goals, projects, etc.)
- Conversation history (last 8 messages for continuity)
- Task context (today's tasks and priorities)
- Habit context (active habits and streaks)

Key Features:
- Defensive error handling with detailed logging
- Multi-user support (query parameter OR batch endpoint)
- Consistent retry logic for external API calls
- Graceful degradation when context unavailable
- Structured logging for debugging and monitoring
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from twilio.rest import Client
from twilio.base.exceptions import TwilioRestException
from openai import OpenAI, OpenAIError
import logging
from typing import Optional, List, Dict
from datetime import datetime, date, timedelta
from zoneinfo import ZoneInfo

from app.db import get_db
from app.services.journey_context import build_journey_context
from app.services.message_service import load_conversation_history, save_message
from app.models import Task, Habit, HabitCompletion, Message
from app.config import (
    TWILIO_SID,
    TWILIO_AUTH_TOKEN,
    TWILIO_WHATSAPP_NUMBER,
    OPENAI_API_KEY,
    OPENAI_MODEL,
    DEFAULT_USER_NUMBER,
)

# -------------------------------------------------
# Setup
# -------------------------------------------------
router = APIRouter()
logger = logging.getLogger(__name__)

# Configure structured logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - [%(funcName)s] %(message)s'
)

EASTERN_TZ = ZoneInfo("America/New_York")

# Initialize clients with validation
try:
    if not TWILIO_SID or not TWILIO_AUTH_TOKEN:
        raise ValueError("Twilio credentials not configured")
    twilio_client = Client(TWILIO_SID, TWILIO_AUTH_TOKEN)
    logger.info("✅ Twilio client initialized successfully")
except Exception as e:
    logger.error(f"❌ Failed to initialize Twilio client: {e}")
    twilio_client = None

try:
    if not OPENAI_API_KEY:
        raise ValueError("OpenAI API key not configured")
    openai_client = OpenAI(api_key=OPENAI_API_KEY)
    logger.info("✅ OpenAI client initialized successfully")
except Exception as e:
    logger.error(f"❌ Failed to initialize OpenAI client: {e}")
    openai_client = None


# -------------------------------------------------
# Context Building Functions
# -------------------------------------------------

def get_today_eastern() -> date:
    """Get current date in Eastern Time"""
    return datetime.now(EASTERN_TZ).date()


def compute_streak(habit: Habit) -> int:
    """Computes consecutive daily streak up to yesterday or today."""
    dates = sorted([c.date for c in habit.completions], reverse=True)
    if not dates:
        return 0

    streak = 0
    current_day = get_today_eastern()

    for d in dates:
        if d == current_day or d == current_day - timedelta(days=1):
            streak += 1
            current_day = d - timedelta(days=1)
        else:
            break

    return streak


def build_task_context(db: Session, user_number: str) -> str:
    """
    Build task context for AI with priorities and due dates.

    Args:
        db: Database session
        user_number: User's WhatsApp number

    Returns:
        Formatted task context string
    """
    try:
        today = datetime.now(EASTERN_TZ).date()

        # Get all open tasks
        tasks = db.query(Task).filter(
            Task.user_number == user_number,
            Task.status == "open"
        ).all()

        if not tasks:
            return "No active tasks."

        # Categorize tasks
        overdue = []
        today_tasks = []
        upcoming = []
        no_date = []

        for task in tasks:
            if task.due_date:
                task_date = task.due_date.date() if isinstance(task.due_date, datetime) else task.due_date
                if task_date < today:
                    overdue.append(task)
                elif task_date == today:
                    today_tasks.append(task)
                else:
                    upcoming.append(task)
            else:
                no_date.append(task)

        # Build formatted context
        lines = []

        if overdue:
            lines.append("OVERDUE:")
            for task in overdue:
                priority = f"[{task.priority}]" if task.priority else ""
                project = f"({task.project})" if task.project else ""
                lines.append(f"  ❗ {task.title} {priority} {project}")

        if today_tasks:
            lines.append("\nDUE TODAY:")
            for task in today_tasks:
                priority = f"[{task.priority}]" if task.priority else ""
                project = f"({task.project})" if task.project else ""
                lines.append(f"  □ {task.title} {priority} {project}")

        if upcoming:
            lines.append("\nUPCOMING:")
            for task in upcoming[:3]:  # Limit to 3 upcoming
                priority = f"[{task.priority}]" if task.priority else ""
                project = f"({task.project})" if task.project else ""
                due = task.due_date.strftime('%m/%d') if task.due_date else ""
                lines.append(f"  □ {task.title} {priority} {project} - {due}")

        if no_date and len(lines) < 10:  # Add a few tasks without dates
            lines.append("\nNO DUE DATE:")
            for task in no_date[:2]:
                priority = f"[{task.priority}]" if task.priority else ""
                lines.append(f"  □ {task.title} {priority}")

        context = "\n".join(lines)
        logger.debug(f"Built task context for {user_number}: {len(tasks)} tasks")
        return context

    except Exception as e:
        logger.warning(f"Failed to build task context for {user_number}: {e}")
        return "Unable to load tasks."


def build_habit_context(db: Session, user_number: str) -> str:
    """
    Build habit context for AI with streaks and completion status.

    Args:
        db: Database session
        user_number: User's WhatsApp number

    Returns:
        Formatted habit context string
    """
    try:
        habits = db.query(Habit).filter(
            Habit.user_number == user_number,
            Habit.is_active == True
        ).all()

        if not habits:
            return "No active habits."

        today = get_today_eastern()
        lines = []

        for habit in habits:
            completed_today = any(c.date == today for c in habit.completions)
            streak = compute_streak(habit)

            status = "✓" if completed_today else "○"
            streak_text = f"({streak} day streak)" if streak > 0 else ""
            lines.append(f"{status} {habit.title} {streak_text}")

        context = "\n".join(lines)
        logger.debug(f"Built habit context for {user_number}: {len(habits)} habits")
        return context

    except Exception as e:
        logger.warning(f"Failed to build habit context for {user_number}: {e}")
        return "Unable to load habits."


def build_full_context(db: Session, user_number: str, include_history: bool = True) -> tuple:
    """
    Build complete context for AI including journey, tasks, habits, and conversation.

    Args:
        db: Database session
        user_number: User's WhatsApp number
        include_history: Whether to include conversation history

    Returns:
        Tuple of (context_text, conversation_history)
    """
    # Journey context (structured user data)
    try:
        journey_context = build_journey_context(db, user_number)
        if not journey_context:
            journey_context = "No journey data captured yet."
    except Exception as e:
        logger.warning(f"Failed to build journey context: {e}")
        journey_context = "Journey context unavailable."

    # Task context
    task_context = build_task_context(db, user_number)

    # Habit context
    habit_context = build_habit_context(db, user_number)

    # Conversation history
    conversation_history = []
    if include_history:
        try:
            full_history = load_conversation_history(db, user_number)
            # Last 8 messages for context without overwhelming the prompt
            conversation_history = full_history[-8:] if full_history else []
            logger.debug(f"Loaded {len(conversation_history)} recent messages for context")
        except Exception as e:
            logger.warning(f"Failed to load conversation history: {e}")

    # Build combined context text
    context_text = f"""
USER'S JOURNEY MEMORY:
{journey_context}

CURRENT TASKS:
{task_context}

ACTIVE HABITS:
{habit_context}
"""

    return context_text.strip(), conversation_history


# -------------------------------------------------
# Helper Functions
# -------------------------------------------------

def validate_user_number(user_number: Optional[str]) -> str:
    """
    Validate and normalize user number.

    Args:
        user_number: WhatsApp number in format 'whatsapp:+1234567890' or None

    Returns:
        Validated user number

    Raises:
        HTTPException: If user number is invalid or missing
    """
    if not user_number:
        if not DEFAULT_USER_NUMBER:
            logger.error("No user_number provided and DEFAULT_USER_NUMBER not configured")
            raise HTTPException(
                status_code=400,
                detail="user_number parameter is required when DEFAULT_USER_NUMBER is not set"
            )
        user_number = DEFAULT_USER_NUMBER
        logger.info(f"Using DEFAULT_USER_NUMBER: {user_number}")

    # Validate format
    if not user_number.startswith('whatsapp:+'):
        logger.warning(f"User number missing 'whatsapp:+' prefix: {user_number}")
        if user_number.startswith('+'):
            user_number = f"whatsapp:{user_number}"
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid user_number format: {user_number}. Expected 'whatsapp:+1234567890'"
            )

    logger.debug(f"Validated user_number: {user_number}")
    return user_number


def generate_ai_message(
        system_prompt: str,
        conversation_history: List[Dict],
        nudge_type: str,
        user_number: str
) -> str:
    """
    Generate AI message using OpenAI with retry logic.

    Args:
        system_prompt: System prompt for GPT
        conversation_history: Recent conversation for context
        nudge_type: Type of nudge for logging
        user_number: User identifier for logging

    Returns:
        Generated message text

    Raises:
        HTTPException: If OpenAI call fails after retries
    """
    if not openai_client:
        logger.error("OpenAI client not initialized")
        raise HTTPException(
            status_code=503,
            detail="AI service unavailable - OpenAI client not configured"
        )

    max_retries = 3
    for attempt in range(max_retries):
        try:
            logger.debug(f"OpenAI API call attempt {attempt + 1}/{max_retries} for {nudge_type}")

            # Build messages: system prompt + conversation history
            messages = [{"role": "system", "content": system_prompt}]
            if conversation_history:
                messages.extend(conversation_history)

            response = openai_client.chat.completions.create(
                model=OPENAI_MODEL,
                messages=messages,
                temperature=0.7,
                max_tokens=300,
            )

            text = response.choices[0].message.content.strip()
            logger.info(f"✅ OpenAI generated {nudge_type} message ({len(text)} chars) for {user_number}")
            return text

        except OpenAIError as e:
            logger.warning(f"OpenAI API error on attempt {attempt + 1}: {e}")
            if attempt == max_retries - 1:
                logger.error(f"❌ All OpenAI retry attempts failed for {nudge_type}")
                raise HTTPException(
                    status_code=503,
                    detail=f"AI service error after {max_retries} attempts: {str(e)}"
                )
        except Exception as e:
            logger.exception(f"Unexpected error in OpenAI call: {e}")
            raise HTTPException(status_code=500, detail=f"Unexpected AI error: {str(e)}")


def send_whatsapp_message(text: str, user_number: str, nudge_type: str) -> bool:
    """
    Send WhatsApp message with retry logic.

    Args:
        text: Message content
        user_number: Recipient WhatsApp number
        nudge_type: Type of nudge for logging

    Returns:
        True if successful

    Raises:
        HTTPException: If sending fails after retries
    """
    if not twilio_client:
        logger.error("Twilio client not initialized")
        raise HTTPException(
            status_code=503,
            detail="WhatsApp service unavailable - Twilio client not configured"
        )

    if not TWILIO_WHATSAPP_NUMBER:
        logger.error("TWILIO_WHATSAPP_NUMBER not configured")
        raise HTTPException(
            status_code=503,
            detail="WhatsApp service unavailable - sender number not configured"
        )

    max_retries = 3
    for attempt in range(max_retries):
        try:
            logger.debug(f"WhatsApp send attempt {attempt + 1}/{max_retries} to {user_number}")

            message = twilio_client.messages.create(
                body=text,
                from_=TWILIO_WHATSAPP_NUMBER,
                to=user_number,
            )

            logger.info(f"✅ WhatsApp {nudge_type} sent successfully to {user_number} (SID: {message.sid})")
            return True

        except TwilioRestException as e:
            logger.warning(f"Twilio API error on attempt {attempt + 1}: {e.code} - {e.msg}")
            if attempt == max_retries - 1:
                logger.error(f"❌ All Twilio retry attempts failed for {nudge_type}")
                raise HTTPException(
                    status_code=503,
                    detail=f"WhatsApp service error after {max_retries} attempts: {e.msg}"
                )
        except Exception as e:
            logger.exception(f"Unexpected error sending WhatsApp: {e}")
            raise HTTPException(status_code=500, detail=f"Unexpected WhatsApp error: {str(e)}")

    return False


def save_message_safe(db: Session, user_number: str, text: str) -> None:
    """
    Save message to database with error handling (non-blocking).

    Args:
        db: Database session
        user_number: User's WhatsApp number
        text: Message content
    """
    try:
        save_message(db, sender="assistant", user_number=user_number, content=text)
        logger.debug(f"Message saved to database for {user_number}")
    except Exception as e:
        logger.warning(f"Failed to save message to database (non-critical): {e}")


def get_all_active_users(db: Session) -> List[str]:
    """
    Get list of all unique user numbers who have messages in the system.

    Args:
        db: Database session

    Returns:
        List of unique user phone numbers
    """
    try:
        users = db.query(Message.user_number).distinct().all()
        user_numbers = [user[0] for user in users if user[0]]
        logger.info(f"Found {len(user_numbers)} active users")
        return user_numbers
    except Exception as e:
        logger.error(f"Failed to get active users: {e}")
        return []


# -------------------------------------------------
# Core Nudge Function (used by all endpoints)
# -------------------------------------------------

def send_nudge_for_user(
        user_number: str,
        nudge_type: str,
        system_prompt_template: str,
        db: Session,
        max_length: int = 450
) -> Dict:
    """
    Core function to send a nudge to a specific user.

    Args:
        user_number: User's WhatsApp number
        nudge_type: Type of nudge (morning/evening/weekly/sunday_review)
        system_prompt_template: Template for system prompt with {context} placeholder
        db: Database session
        max_length: Maximum character length for message

    Returns:
        Dict with status and metadata
    """
    start_time = datetime.utcnow()

    try:
        # Build full context
        context_text, conversation_history = build_full_context(db, user_number)

        # Create system prompt
        system_prompt = system_prompt_template.format(context=context_text, max_length=max_length)

        # Generate AI message
        message_text = generate_ai_message(system_prompt, conversation_history, nudge_type, user_number)

        # Send via WhatsApp
        send_whatsapp_message(message_text, user_number, nudge_type)

        # Save to database (non-blocking)
        save_message_safe(db, user_number, message_text)

        # Calculate execution time
        duration = (datetime.utcnow() - start_time).total_seconds()

        return {
            "status": "success",
            "user_number": user_number,
            "message_length": len(message_text),
            "duration_seconds": duration,
        }

    except Exception as e:
        logger.exception(f"Failed to send {nudge_type} to {user_number}: {e}")
        return {
            "status": "failed",
            "user_number": user_number,
            "error": str(e),
        }


# -------------------------------------------------
# Single User Nudge Endpoints
# -------------------------------------------------

@router.get("/nudge/morning")
def morning_nudge(
        user_number: Optional[str] = Query(None, description="WhatsApp number (e.g., 'whatsapp:+1234567890')"),
        db: Session = Depends(get_db)
):
    """
    Send morning motivational message (typically scheduled for 7am).

    Uses FULL context: journey + tasks + habits + conversation history
    """
    nudge_type = "morning_nudge"
    logger.info(f"🌅 {nudge_type.upper()} endpoint invoked")

    user_number = validate_user_number(user_number)

    system_prompt_template = """You are Alfred, an AI Chief of Staff.
It's the start of the user's day.

{context}

Your task:
- Send ONE uplifting morning message
- Reference their specific tasks, habits, or recent conversation naturally
- Be warm, concise, empowering
- No questions (save for evening)
- Max {max_length} characters

Be conversational and acknowledge their context."""

    result = send_nudge_for_user(user_number, nudge_type, system_prompt_template, db, max_length=350)

    logger.info(f"✅ {nudge_type} completed: {result['status']}")
    return {
        "nudge_type": nudge_type,
        "timestamp": datetime.utcnow().isoformat(),
        **result
    }


@router.get("/nudge/evening")
def evening_nudge(
        user_number: Optional[str] = Query(None, description="WhatsApp number"),
        db: Session = Depends(get_db)
):
    """
    Send evening reflection prompt (typically scheduled for 6pm).

    Uses FULL context: journey + tasks + habits + conversation history
    """
    nudge_type = "evening_nudge"
    logger.info(f"🌙 {nudge_type.upper()} endpoint invoked")

    user_number = validate_user_number(user_number)

    system_prompt_template = """You are Alfred, an AI Chief of Staff and executive coach.
It's the end of the user's day.

{context}

Your task:
- Ask 1-3 thoughtful reflection questions about their day
- Reference specific tasks, habits, goals, or recent conversation
- Be warm, personal, and genuinely curious
- Max {max_length} characters

Be conversational and build on recent context."""

    result = send_nudge_for_user(user_number, nudge_type, system_prompt_template, db, max_length=450)

    logger.info(f"✅ {nudge_type} completed: {result['status']}")
    return {
        "nudge_type": nudge_type,
        "timestamp": datetime.utcnow().isoformat(),
        **result
    }


@router.get("/nudge/sunday_review")
def sunday_review_nudge(
        user_number: Optional[str] = Query(None, description="WhatsApp number"),
        db: Session = Depends(get_db)
):
    """
    Send Sunday evening strategic review and planning prompt.

    Uses FULL context: journey + tasks + habits + conversation history
    """
    nudge_type = "sunday_review_nudge"
    logger.info(f"📋 {nudge_type.upper()} endpoint invoked")

    user_number = validate_user_number(user_number)

    system_prompt_template = """You are Alfred, an AI Chief of Staff and executive coach.

It is Sunday evening. The user is transitioning from execution to reflection and planning.

{context}

Your task:
- Ask 3-5 thoughtful strategic questions
- Focus on weekly progress, what worked vs didn't, and priorities for next week
- Reference their specific context naturally
- Be structured, calm, and strategic
- Max {max_length} characters

Help them plan their week ahead based on their current state."""

    result = send_nudge_for_user(user_number, nudge_type, system_prompt_template, db, max_length=550)

    logger.info(f"✅ {nudge_type} completed: {result['status']}")
    return {
        "nudge_type": nudge_type,
        "timestamp": datetime.utcnow().isoformat(),
        **result
    }


@router.get("/nudge/weekly")
def weekly_nudge(
        user_number: Optional[str] = Query(None, description="WhatsApp number"),
        db: Session = Depends(get_db)
):
    """
    Send weekly structured reflection prompt.
    Fixed template (no AI generation for consistency).
    """
    nudge_type = "weekly_nudge"
    start_time = datetime.utcnow()
    logger.info(f"🗓️ {nudge_type.upper()} endpoint invoked")

    try:
        user_number = validate_user_number(user_number)

        message_text = (
            "🧭 *Your Weekly Reflection*\n"
            "Here are a few questions for your journey:\n\n"
            "• What strengths did you use this week?\n"
            "• Any failures or learnings to capture?\n"
            "• Any new projects or progress worth noting?\n"
            "• Anyone who mattered this week?\n"
            "• What do you want to improve next week?\n\n"
            "Reply naturally — I'll structure everything automatically."
        )

        send_whatsapp_message(message_text, user_number, nudge_type)
        save_message_safe(db, user_number, message_text)

        duration = (datetime.utcnow() - start_time).total_seconds()
        logger.info(f"✅ {nudge_type} completed successfully in {duration:.2f}s")

        return {
            "status": "success",
            "nudge_type": nudge_type,
            "user_number": user_number,
            "message_length": len(message_text),
            "duration_seconds": duration,
            "timestamp": datetime.utcnow().isoformat(),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"❌ Unexpected error in {nudge_type}: {e}")
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


# -------------------------------------------------
# Batch Endpoints (Multi-User)
# -------------------------------------------------

@router.get("/nudge/morning/batch")
def morning_nudge_batch(db: Session = Depends(get_db)):
    """
    Send morning nudge to ALL active users.

    Returns summary of successes and failures.
    """
    nudge_type = "morning_nudge_batch"
    start_time = datetime.utcnow()
    logger.info(f"🌅📦 {nudge_type.upper()} endpoint invoked")

    system_prompt_template = """You are Alfred, an AI Chief of Staff.
It's the start of the user's day.

{context}

Your task:
- Send ONE uplifting morning message
- Reference their specific tasks, habits, or recent conversation naturally
- Be warm, concise, empowering
- No questions (save for evening)
- Max {max_length} characters

Be conversational and acknowledge their context."""

    users = get_all_active_users(db)
    results = []

    for user_number in users:
        logger.info(f"Sending morning nudge to {user_number}")
        result = send_nudge_for_user(user_number, "morning_nudge", system_prompt_template, db, max_length=350)
        results.append(result)

    duration = (datetime.utcnow() - start_time).total_seconds()
    successful = len([r for r in results if r["status"] == "success"])
    failed = len([r for r in results if r["status"] == "failed"])

    logger.info(f"✅ {nudge_type} completed: {successful} successful, {failed} failed in {duration:.2f}s")

    return {
        "status": "batch_complete",
        "nudge_type": nudge_type,
        "total_users": len(users),
        "successful": successful,
        "failed": failed,
        "duration_seconds": duration,
        "timestamp": datetime.utcnow().isoformat(),
        "results": results
    }


@router.get("/nudge/evening/batch")
def evening_nudge_batch(db: Session = Depends(get_db)):
    """
    Send evening nudge to ALL active users.
    """
    nudge_type = "evening_nudge_batch"
    start_time = datetime.utcnow()
    logger.info(f"🌙📦 {nudge_type.upper()} endpoint invoked")

    system_prompt_template = """You are Alfred, an AI Chief of Staff and executive coach.
It's the end of the user's day.

{context}

Your task:
- Ask 1-3 thoughtful reflection questions about their day
- Reference specific tasks, habits, goals, or recent conversation
- Be warm, personal, and genuinely curious
- Max {max_length} characters

Be conversational and build on recent context."""

    users = get_all_active_users(db)
    results = []

    for user_number in users:
        logger.info(f"Sending evening nudge to {user_number}")
        result = send_nudge_for_user(user_number, "evening_nudge", system_prompt_template, db, max_length=450)
        results.append(result)

    duration = (datetime.utcnow() - start_time).total_seconds()
    successful = len([r for r in results if r["status"] == "success"])
    failed = len([r for r in results if r["status"] == "failed"])

    logger.info(f"✅ {nudge_type} completed: {successful} successful, {failed} failed in {duration:.2f}s")

    return {
        "status": "batch_complete",
        "nudge_type": nudge_type,
        "total_users": len(users),
        "successful": successful,
        "failed": failed,
        "duration_seconds": duration,
        "timestamp": datetime.utcnow().isoformat(),
        "results": results
    }


# -------------------------------------------------
# Health Check Endpoint
# -------------------------------------------------

@router.get("/nudge/health")
def health_check(db: Session = Depends(get_db)):
    """
    Health check endpoint for monitoring service status.
    """
    logger.info("Health check requested")

    # Check how many users in system
    user_count = 0
    try:
        users = get_all_active_users(db)
        user_count = len(users)
    except:
        pass

    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "services": {
            "twilio": "configured" if twilio_client else "not_configured",
            "openai": "configured" if openai_client else "not_configured",
            "default_user": "configured" if DEFAULT_USER_NUMBER else "not_configured",
        },
        "users": {
            "active_count": user_count,
        },
        "endpoints": {
            "single_user": [
                "/nudge/morning?user_number=...",
                "/nudge/evening?user_number=...",
                "/nudge/weekly?user_number=...",
                "/nudge/sunday_review?user_number=...",
            ],
            "batch": [
                "/nudge/morning/batch",
                "/nudge/evening/batch",
            ],
            "utility": [
                "/nudge/health",
            ]
        }
    }