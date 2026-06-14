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
- Prompts loaded from external YAML config (easy to edit!)
- Excel logging for systematic prompt tuning
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from twilio.rest import Client
from twilio.base.exceptions import TwilioRestException
from openai import OpenAI, OpenAIError
import logging
import os
import yaml
import pandas as pd
from pathlib import Path
from typing import Optional, List, Dict, NamedTuple
from datetime import datetime, date, timedelta

from app.db import get_db
from app.services.journey_context import build_journey_context
from app.services.message_service import load_conversation_history, save_message
from app.services.timezone_service import get_user_timezone, today_for_timezone
from app.models import Task, Habit, HabitCompletion, JourneyGoal, Message, User
from app.services.habit_coaching_service import refresh_habit_coaching_review
from app.services.vision_progress_review_service import VisionProgressReviewService
from app.services.operations_director.health_events import (
    record_external_service_failure_with_new_session,
    record_job_failure,
)
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
# Load Nudge Configuration from YAML
# Prompts live in nudge_prompts.yaml for easy editing
# -------------------------------------------------

def load_nudge_configs() -> Dict:
    """
    Load nudge prompts from YAML config file.
    Falls back to hardcoded defaults if file not found.

    Returns:
        Dict of nudge configurations
    """
    config_path = Path(__file__).parent.parent / "nudge_prompts.yaml"

    try:
        with open(config_path, 'r') as f:
            configs = yaml.safe_load(f)
            logger.info(f"✅ Loaded nudge prompts from {config_path}")
            return configs
    except FileNotFoundError:
        logger.warning(f"⚠️ Config file not found at {config_path}, using defaults")
        # Fallback to hardcoded defaults
        return {
            "morning": {
                "max_length": 280,
                "system_prompt": "You are Alfred. Send a brief morning compliment. {context}"
            },
            "evening": {
                "max_length": 320,
                "system_prompt": "You are Alfred. Ask reflective evening questions. {context}"
            },
            "weekly": {
                "max_length": 450,
                "system_prompt": "You are Alfred. Friday coaching - go deeper. {context}"
            },
            "sunday_review": {
                "max_length": 400,
                "system_prompt": "You are Alfred. Sunday goal review and planning. {context}"
            }
        }
    except Exception as e:
        logger.error(f"❌ Error loading config file: {e}")
        raise


# Load configs at startup
NUDGE_CONFIGS = load_nudge_configs()

# -------------------------------------------------
# Nudge Logging - Excel Export for Feedback
# -------------------------------------------------

NUDGE_LOG_PATH = Path("/app/nudge_feedback_log.xlsx")


def log_nudge_to_excel(
        nudge_type: str,
        user_number: str,
        message_text: str,
        context_summary: str,
        character_count: int,
        status: str = "success",
        error: Optional[str] = None
) -> None:
    """
    Log a nudge to Excel file for feedback and prompt tuning.
    Non-blocking - errors are logged but don't fail the nudge.
    """
    try:
        log_entry = {
            "Timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S EST"),
            "Nudge Type": nudge_type,
            "User": user_number,
            "Status": status,
            "Message": message_text,
            "Character Count": character_count,
            "Context Summary": context_summary,
            "Error": error if error else "",
            # Empty columns for user feedback
            "Your Rating (1-5)": "",
            "Your Feedback": "",
            "Suggested Improvement": "",
            "Prompt Version": "v1.0"
        }

        # Load existing or create new
        if NUDGE_LOG_PATH.exists():
            df = pd.read_excel(NUDGE_LOG_PATH)
            df = pd.concat([df, pd.DataFrame([log_entry])], ignore_index=True)
        else:
            df = pd.DataFrame([log_entry])

        # Save with formatting
        with pd.ExcelWriter(NUDGE_LOG_PATH, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Nudge Log')
            worksheet = writer.sheets['Nudge Log']

            # Set column widths
            worksheet.column_dimensions['A'].width = 20  # Timestamp
            worksheet.column_dimensions['B'].width = 15  # Nudge Type
            worksheet.column_dimensions['C'].width = 20  # User
            worksheet.column_dimensions['D'].width = 10  # Status
            worksheet.column_dimensions['E'].width = 60  # Message
            worksheet.column_dimensions['F'].width = 12  # Char Count
            worksheet.column_dimensions['G'].width = 40  # Context
            worksheet.column_dimensions['H'].width = 30  # Error
            worksheet.column_dimensions['I'].width = 15  # Rating
            worksheet.column_dimensions['J'].width = 50  # Feedback
            worksheet.column_dimensions['K'].width = 50  # Suggestion
            worksheet.column_dimensions['L'].width = 12  # Version

            # Bold headers
            for cell in worksheet[1]:
                cell.font = cell.font.copy(bold=True)

        logger.info(f"📊 Logged {nudge_type} to Excel (total: {len(df)} nudges)")

    except Exception as e:
        logger.warning(f"⚠️ Failed to log nudge to Excel: {e}")


def build_context_summary_for_log(task_context: str, habit_context: str) -> str:
    """Build brief context summary for log."""
    tasks_count = task_context.count("□") if task_context else 0
    habits_count = (habit_context.count("○") + habit_context.count("✓")) if habit_context else 0
    return f"{tasks_count} tasks, {habits_count} habits"


def refresh_sunday_review_data(db: Session, user_number: str) -> Dict:
    """
    Refresh persisted review data that the Sunday nudge sends the user to inspect.

    Failures are captured per surface so one stale review does not prevent the
    Sunday nudge from being created.
    """
    result = {
        "vision_reviews": {
            "attempted": 0,
            "refreshed": 0,
            "failed": 0,
            "errors": [],
        },
        "habit_trends": {
            "attempted": True,
            "refreshed": False,
            "error": None,
        },
    }

    visions = (
        db.query(JourneyGoal)
        .filter(
            JourneyGoal.user_number == user_number,
            JourneyGoal.time_horizon.in_(["long", "vision"]),
        )
        .order_by(JourneyGoal.created_at)
        .all()
    )
    result["vision_reviews"]["attempted"] = len(visions)

    for vision in visions:
        try:
            VisionProgressReviewService.refresh_vision_progress_review(db, user_number, vision.id)
            result["vision_reviews"]["refreshed"] += 1
        except Exception as exc:
            db.rollback()
            result["vision_reviews"]["failed"] += 1
            result["vision_reviews"]["errors"].append({
                "vision_id": vision.id,
                "title": vision.title or vision.goal_text,
                "error": str(exc),
            })
            logger.warning(
                "Failed to refresh Sunday vision progress review for %s vision_id=%s: %s",
                user_number,
                vision.id,
                exc,
            )

    try:
        refresh_habit_coaching_review(db, user_number)
        result["habit_trends"]["refreshed"] = True
    except Exception as exc:
        db.rollback()
        result["habit_trends"]["error"] = str(exc)
        logger.warning("Failed to refresh Sunday habit trends review for %s: %s", user_number, exc)

    return result


def build_sunday_refresh_context(refresh_result: Optional[Dict]) -> str:
    if not refresh_result:
        return ""

    vision_reviews = refresh_result.get("vision_reviews", {})
    habit_trends = refresh_result.get("habit_trends", {})
    attempted = vision_reviews.get("attempted", 0)
    refreshed = vision_reviews.get("refreshed", 0)
    failed = vision_reviews.get("failed", 0)
    habit_refreshed = habit_trends.get("refreshed", False)

    if failed or not habit_refreshed:
        return (
            "SUNDAY REFRESH STATUS:\n"
            f"- Refreshed {refreshed} of {attempted} Goals Progress Review page(s).\n"
            f"- Habit Trends refresh {'completed' if habit_refreshed else 'did not complete'}.\n"
            "- Tell the user Alfred refreshed the available review data and invite them to take a look."
        )

    return (
        "SUNDAY REFRESH STATUS:\n"
        f"- Refreshed {refreshed} Goals Progress Review page(s).\n"
        "- Refreshed the Habit Trends page data.\n"
        "- Tell the user Alfred refreshed both areas and invite them to take a look."
    )


def add_sunday_refresh_notice(message_text: str, refresh_result: Optional[Dict]) -> str:
    if not refresh_result:
        return message_text

    lower_message = (message_text or "").lower()
    if "refreshed" in lower_message and ("habit" in lower_message or "trend" in lower_message):
        return message_text

    vision_reviews = refresh_result.get("vision_reviews", {})
    habit_trends = refresh_result.get("habit_trends", {})
    attempted = vision_reviews.get("attempted", 0)
    refreshed = vision_reviews.get("refreshed", 0)
    habit_refreshed = habit_trends.get("refreshed", False)

    if refreshed == attempted and habit_refreshed:
        notice = "I also refreshed your Goals Progress Reviews and Habit Trends data, so take a look there as you plan the week."
    else:
        notice = "I also refreshed the available Goals Progress Reviews and Habit Trends data, so take a look there as you plan the week."

    return f"{message_text.rstrip()}\n\n{notice}"


# -------------------------------------------------
# Context Building Functions
# -------------------------------------------------

def compute_streak(habit: Habit, today: date) -> int:
    """Computes consecutive daily streak up to yesterday or today."""
    dates = sorted([c.date for c in habit.completions], reverse=True)
    if not dates:
        return 0

    streak = 0
    current_day = today

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
        today = today_for_timezone(get_user_timezone(db, user_number))

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

        today = today_for_timezone(get_user_timezone(db, user_number))
        lines = []

        for habit in habits:
            completed_today = any(c.date == today for c in habit.completions)
            streak = compute_streak(habit, today)

            status = "✓" if completed_today else "○"
            streak_text = f"({streak} day streak)" if streak > 0 else ""
            lines.append(f"{status} {habit.title} {streak_text}")

        context = "\n".join(lines)
        logger.debug(f"Built habit context for {user_number}: {len(habits)} habits")
        return context

    except Exception as e:
        logger.warning(f"Failed to build habit context for {user_number}: {e}")
        return "Unable to load habits."


def build_full_context(db: Session, user_number: str, include_history: bool = False) -> tuple:
    """
    Build complete context for AI including journey, tasks, habits, and conversation.

    Args:
        db: Database session
        user_number: User's WhatsApp number
        include_history: Whether to include conversation history (default: False for nudges)

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

    # Conversation history - DISABLED BY DEFAULT FOR NUDGES
    # Nudges work better with just journey/tasks/habits context
    # Too much history overwhelms the directive prompt instructions
    conversation_history = []
    if include_history:
        try:
            full_history = load_conversation_history(db, user_number)
            # Reduced from 8 to 2 - only most recent exchange for continuity
            conversation_history = full_history[-2:] if full_history else []
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

class NudgeTarget(NamedTuple):
    user_number: str
    environment: str
    source: str


def get_runtime_environment() -> str:
    """Return the configured runtime environment, defaulting to development."""
    environment = (
        os.getenv("APP_ENV")
        or os.getenv("ENVIRONMENT")
        or os.getenv("RAILWAY_ENVIRONMENT_NAME")
        or "development"
    )
    return environment.strip().lower() or "development"


def _missing_user_number_error(environment: str) -> HTTPException:
    return HTTPException(
        status_code=400,
        detail={
            "status": "error",
            "error": "missing_user_number",
            "environment": environment,
            "message": "user_number is required for single-user nudge sends.",
        },
    )


def normalize_nudge_user_number(user_number: str) -> str:
    """
    Normalize supported nudge targets.

    WhatsApp users use `whatsapp:+123...`; synthetic/dev users use `synthetic:name`.
    """
    user_number = user_number.strip()

    if user_number.startswith("synthetic:"):
        return user_number

    if user_number.startswith("+"):
        return f"whatsapp:{user_number}"

    if user_number.startswith("whatsapp:+"):
        return user_number

    raise HTTPException(
        status_code=400,
        detail=f"Invalid user_number format: {user_number}. Expected 'whatsapp:+1234567890' or 'synthetic:user_name'"
    )


def resolve_nudge_user_number(
        requested_user_number: Optional[str],
        nudge_type: str,
        environment: Optional[str] = None,
) -> NudgeTarget:
    """
    Resolve the target user for a scheduled nudge.

    Single-user nudge sends require an explicit target outside production.
    """
    environment = (environment or get_runtime_environment()).strip().lower() or "development"

    if requested_user_number:
        target = NudgeTarget(
            user_number=normalize_nudge_user_number(requested_user_number),
            environment=environment,
            source="query_param",
        )
    elif environment == "production":
        if not DEFAULT_USER_NUMBER:
            logger.error("No user_number provided and DEFAULT_USER_NUMBER not configured")
            raise HTTPException(
                status_code=400,
                detail="user_number parameter is required when DEFAULT_USER_NUMBER is not set"
            )
        target = NudgeTarget(
            user_number=normalize_nudge_user_number(DEFAULT_USER_NUMBER),
            environment=environment,
            source="default",
        )
    else:
        logger.warning(
            "[nudge_targeting] nudge_type=%s environment=%s source=missing user_number=missing",
            nudge_type,
            environment,
        )
        raise _missing_user_number_error(environment)

    logger.info(
        "[nudge_targeting] nudge_type=%s environment=%s source=%s user_number=%s",
        nudge_type,
        target.environment,
        target.source,
        target.user_number,
    )
    return target


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

    normalized = normalize_nudge_user_number(user_number)
    logger.debug(f"Validated user_number: {normalized}")
    return normalized


def generate_ai_message(
        system_prompt: str,
        conversation_history: List[Dict],
        nudge_type: str,
        user_number: str,
        max_tokens: int = 300
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
                max_tokens=max_tokens,
            )

            text = response.choices[0].message.content.strip()
            finish_reason = response.choices[0].finish_reason
            if finish_reason == "length":
                logger.warning(
                    f"OpenAI stopped {nudge_type} generation at max_tokens={max_tokens}; "
                    f"message may be truncated for {user_number}"
                )
            logger.info(f"✅ OpenAI generated {nudge_type} message ({len(text)} chars) for {user_number}")
            return text

        except OpenAIError as e:
            logger.warning(f"OpenAI API error on attempt {attempt + 1}: {e}")
            record_external_service_failure_with_new_session(
                service_name="OpenAI",
                operation=f"{nudge_type}_generation",
                error=e,
                retry_status=f"attempt {attempt + 1}/{max_retries}",
            )
            if attempt == max_retries - 1:
                logger.error(f"❌ All OpenAI retry attempts failed for {nudge_type}")
                raise HTTPException(
                    status_code=503,
                    detail=f"AI service error after {max_retries} attempts: {str(e)}"
                )
        except Exception as e:
            logger.exception(f"Unexpected error in OpenAI call: {e}")
            record_external_service_failure_with_new_session(
                service_name="OpenAI",
                operation=f"{nudge_type}_generation",
                error=e,
                retry_status="unexpected_error",
            )
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
            record_external_service_failure_with_new_session(
                service_name="Twilio",
                operation=f"{nudge_type}_whatsapp_send",
                error=e,
                retry_status=f"attempt {attempt + 1}/{max_retries}",
            )
            if attempt == max_retries - 1:
                logger.error(f"❌ All Twilio retry attempts failed for {nudge_type}")
                raise HTTPException(
                    status_code=503,
                    detail=f"WhatsApp service error after {max_retries} attempts: {e.msg}"
                )
        except Exception as e:
            logger.exception(f"Unexpected error sending WhatsApp: {e}")
            record_external_service_failure_with_new_session(
                service_name="Twilio",
                operation=f"{nudge_type}_whatsapp_send",
                error=e,
                retry_status="unexpected_error",
            )
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
        save_message(
            db,
            sender="assistant",
            user_number=user_number,
            content=text,
            message_type="nudge",
            conversation_type="messages",
            is_read=False,
        )
        logger.debug(f"Message saved to database for {user_number}")
    except Exception as e:
        logger.warning(f"Failed to save message to database (non-critical): {e}")


def get_all_active_users(db: Session) -> List[str]:
    """
    Get list of all active users who should receive scheduled nudges.

    Args:
        db: Database session

    Returns:
        List of unique user phone numbers
    """
    try:
        user_rows = (
            db.query(User.phone_number)
            .filter(
                User.is_active == True,
                User.phone_number.isnot(None),
                User.phone_number != "",
            )
            .order_by(User.id)
            .all()
        )
        user_numbers = [row[0] for row in user_rows if row[0]]

        if not user_numbers:
            message_rows = db.query(Message.user_number).distinct().all()
            user_numbers = [row[0] for row in message_rows if row[0]]

        user_numbers = list(dict.fromkeys(user_numbers))
        logger.info(f"Found {len(user_numbers)} active nudge users")
        return user_numbers
    except Exception as e:
        logger.error(f"Failed to get active users: {e}")
        return []


def reload_nudge_configs() -> None:
    """
    Reload nudge configurations from YAML file.
    Call this endpoint to apply prompt changes without restarting.
    """
    global NUDGE_CONFIGS
    NUDGE_CONFIGS = load_nudge_configs()
    logger.info("🔄 Reloaded nudge configurations")


# -------------------------------------------------
# Core Nudge Function (used by all endpoints)
# -------------------------------------------------

def send_nudge_for_user(
        user_number: str,
        nudge_type: str,
        db: Session,
) -> Dict:
    """
    Core function to send a nudge to a specific user.
    Uses NUDGE_CONFIGS loaded from YAML file.
    Logs every nudge to Excel for feedback and prompt tuning.

    Args:
        user_number: User's WhatsApp number
        nudge_type: Type of nudge (morning/evening/weekly/sunday_review)
        db: Database session

    Returns:
        Dict with status and metadata
    """
    start_time = datetime.utcnow()

    try:
        # Get config for this nudge type
        config = NUDGE_CONFIGS.get(nudge_type)
        if not config:
            raise ValueError(f"Unknown nudge type: {nudge_type}")

        sunday_refresh_result = None
        if nudge_type == "sunday_review":
            sunday_refresh_result = refresh_sunday_review_data(db, user_number)

        # Build full context
        context_text, conversation_history = build_full_context(db, user_number)

        from app.services.morning_briefing_service import MorningBriefingService

        move_the_needle_context = ""

        if nudge_type == "morning":
            briefing_service = MorningBriefingService(db)
            move_the_needle_context = briefing_service.generate_move_the_needle_context(user_number)
            try:
                from app.services.home_dashboard_service import HomeDashboardService
                HomeDashboardService(db).refresh(user_number, source="morning_nudge")
            except Exception as exc:
                db.rollback()
                logger.warning("Failed to refresh Home dashboard snapshot for %s during morning nudge: %s", user_number, exc)
            

        # Build context summary for logging
        task_ctx = build_task_context(db, user_number)
        habit_ctx = build_habit_context(db, user_number)
        context_summary = build_context_summary_for_log(task_ctx, habit_ctx)

        # Create system prompt from template
        sunday_refresh_context = build_sunday_refresh_context(sunday_refresh_result)

        system_prompt = config["system_prompt"].format(
            context=context_text,
            move_the_needle=move_the_needle_context,
            sunday_refresh=sunday_refresh_context,
            max_length=config["max_length"]
        )

        # DEBUG: Log the actual prompt being sent
        logger.info(f"🔍 System prompt for {nudge_type} (first 500 chars):")
        logger.info(f"   {system_prompt[:500]}...")
        logger.info(f"🔍 Conversation history: {len(conversation_history)} messages")

        # Give the model enough room to finish the configured nudge while still
        # keeping runaway responses bounded.
        max_tokens = max(300, min(700, int(config["max_length"] / 2) + 150))

        # Generate AI message
        message_text = generate_ai_message(
            system_prompt,
            conversation_history,
            nudge_type,
            user_number,
            max_tokens=max_tokens
        )
        if nudge_type == "evening":
            message_text = (
                f"{message_text.rstrip()}\n\n"
                "Energy check: tap your level below from 1 (depleted) to 5 (fully charged)."
            )
        if nudge_type == "sunday_review":
            message_text = add_sunday_refresh_notice(message_text, sunday_refresh_result)

        # Send via WhatsApp
        #Temporarly disabled
#        send_whatsapp_message(message_text, user_number, nudge_type)

        # Save in Journal


        # Save to database (non-blocking)
        #save_message_safe(db, user_number, message_text)
        save_message(
            db,
            sender="assistant",
            user_number=user_number,
            content=message_text,
            message_type="nudge",
            conversation_type="messages",
            is_read=False
        )

        # LOG TO EXCEL (non-blocking) ✨
        log_nudge_to_excel(
            nudge_type=nudge_type,
            user_number=user_number,
            message_text=message_text,
            context_summary=context_summary,
            character_count=len(message_text),
            status="success"
        )

        # Calculate execution time
        duration = (datetime.utcnow() - start_time).total_seconds()

        return {
            "status": "success",
            "user_number": user_number,
            "message_length": len(message_text),
            "duration_seconds": duration,
            "sunday_refresh": sunday_refresh_result,
        }

    except Exception as e:
        logger.exception(f"Failed to send {nudge_type} to {user_number}: {e}")
        try:
            record_job_failure(
                db,
                job_name=nudge_type,
                error=e,
                source="cron",
                details={"operation": "send_nudge_for_user"},
                user_number=user_number,
                commit=False,
            )
            db.commit()
        except Exception as health_exc:
            db.rollback()
            logger.warning("Failed to record %s nudge health event: %s", nudge_type, health_exc)

        # LOG FAILURE TO EXCEL (non-blocking) ✨
        log_nudge_to_excel(
            nudge_type=nudge_type,
            user_number=user_number,
            message_text="",
            context_summary="",
            character_count=0,
            status="failed",
            error=str(e)
        )

        return {
            "status": "failed",
            "user_number": user_number,
            "error": str(e),
            "duration_seconds": (datetime.utcnow() - start_time).total_seconds(),
        }


def run_single_nudge(
        requested_user_number: Optional[str],
        nudge_type: str,
        db: Session,
) -> Dict:
    """Resolve targeting, send one nudge, and return cron-friendly metadata."""
    target = resolve_nudge_user_number(requested_user_number, nudge_type)
    result = send_nudge_for_user(target.user_number, nudge_type, db)
    status = result.get("status", "error")
    duration = result.get("duration_seconds", 0)

    logger.info(
        "[nudge_result] nudge_type=%s environment=%s user_number=%s status=%s duration_seconds=%.2f",
        nudge_type,
        target.environment,
        target.user_number,
        status,
        duration,
    )

    return {
        "nudge_type": nudge_type,
        "status": status,
        "environment": target.environment,
        "user_number": target.user_number,
        "target_source": target.source,
        "duration_seconds": duration,
        "timestamp": datetime.utcnow().isoformat(),
        **{key: value for key, value in result.items() if key not in {"status", "user_number", "duration_seconds"}},
    }


def run_batch_nudge(
        nudge_type: str,
        db: Session,
) -> Dict:
    """Send one scheduled nudge to every active user in this environment."""
    start_time = datetime.utcnow()
    environment = get_runtime_environment()
    users = get_all_active_users(db)

    logger.info(
        "[nudge_targeting] nudge_type=%s environment=%s source=all_active_users total_users=%s",
        nudge_type,
        environment,
        len(users),
    )

    results = [send_nudge_for_user(user_number, nudge_type, db) for user_number in users]

    duration = (datetime.utcnow() - start_time).total_seconds()
    successful = len([r for r in results if r["status"] == "success"])
    failed = len([r for r in results if r["status"] == "failed"])

    logger.info(
        "[nudge_result] nudge_type=%s environment=%s status=batch_complete total_users=%s successful=%s failed=%s duration_seconds=%.2f",
        nudge_type,
        environment,
        len(users),
        successful,
        failed,
        duration,
    )

    return {
        "status": "batch_complete",
        "nudge_type": nudge_type,
        "environment": environment,
        "target_source": "all_active_users",
        "total_users": len(users),
        "successful": successful,
        "failed": failed,
        "duration_seconds": duration,
        "timestamp": datetime.utcnow().isoformat(),
        "results": results,
    }


NUDGE_USER_QUERY_ALIASES = (
    "user_number",
    "userNumber",
    "target_user",
    "target",
    "user",
    "to",
)


def get_requested_nudge_user_number(
        user_number: Optional[str],
        request: Request,
        nudge_type: str,
) -> Optional[str]:
    """Resolve the nudge target from supported query parameter names."""
    query_params = dict(request.query_params)
    logger.info(
        "[nudge_request] nudge_type=%s path=%s query_params=%s",
        nudge_type,
        request.url.path,
        query_params,
    )

    if user_number:
        return user_number.strip()

    for alias in NUDGE_USER_QUERY_ALIASES:
        value = request.query_params.get(alias)
        if value:
            logger.info(
                "[nudge_request] nudge_type=%s target_alias=%s",
                nudge_type,
                alias,
            )
            return value.strip()

    return None


# -------------------------------------------------
# Single User Nudge Endpoints
# -------------------------------------------------

@router.get("/nudge/morning")
def morning_nudge(
        request: Request,
        user_number: Optional[str] = Query(None, description="WhatsApp number (e.g., 'whatsapp:+1234567890')"),
        db: Session = Depends(get_db)
):
    """
    Send morning motivational message (typically scheduled for 7am).

    Uses FULL context: journey + tasks + habits + conversation history
    Prompt loaded from nudge_prompts.yaml
    """
    nudge_type = "morning"
    logger.info(f"🌅 {nudge_type.upper()} nudge endpoint invoked")

    requested_user_number = get_requested_nudge_user_number(user_number, request, nudge_type)
    result = (
        run_single_nudge(requested_user_number, nudge_type, db)
        if requested_user_number
        else run_batch_nudge(nudge_type, db)
    )

    logger.info(f"✅ {nudge_type} nudge completed: {result['status']}")
    return {
        "nudge_type": nudge_type,
        "timestamp": datetime.utcnow().isoformat(),
        **result
    }


@router.get("/nudge/evening")
def evening_nudge(
        request: Request,
        user_number: Optional[str] = Query(None, description="WhatsApp number"),
        db: Session = Depends(get_db)
):
    """
    Send evening reflection prompt (typically scheduled for 6pm).

    Uses FULL context: journey + tasks + habits + conversation history
    Prompt loaded from nudge_prompts.yaml
    """
    nudge_type = "evening"
    logger.info(f"🌙 {nudge_type.upper()} nudge endpoint invoked")

    requested_user_number = get_requested_nudge_user_number(user_number, request, nudge_type)
    result = (
        run_single_nudge(requested_user_number, nudge_type, db)
        if requested_user_number
        else run_batch_nudge(nudge_type, db)
    )

    logger.info(f"✅ {nudge_type} nudge completed: {result['status']}")
    return {
        "nudge_type": nudge_type,
        "timestamp": datetime.utcnow().isoformat(),
        **result
    }


@router.get("/nudge/weekly")
def weekly_nudge(
        request: Request,
        user_number: Optional[str] = Query(None, description="WhatsApp number"),
        db: Session = Depends(get_db)
):
    """
    Send Friday weekly coaching nudge - go deeper on the week.

    Uses FULL context: journey + tasks + habits + conversation history
    Prompt loaded from nudge_prompts.yaml
    """
    nudge_type = "weekly"
    logger.info(f"🎯 {nudge_type.upper()} coaching nudge endpoint invoked")

    requested_user_number = get_requested_nudge_user_number(user_number, request, nudge_type)
    result = (
        run_single_nudge(requested_user_number, nudge_type, db)
        if requested_user_number
        else run_batch_nudge(nudge_type, db)
    )

    logger.info(f"✅ {nudge_type} nudge completed: {result['status']}")
    return {
        "nudge_type": nudge_type,
        "timestamp": datetime.utcnow().isoformat(),
        **result
    }


@router.get("/nudge/sunday_review")
def sunday_review_nudge(
        request: Request,
        user_number: Optional[str] = Query(None, description="WhatsApp number"),
        db: Session = Depends(get_db)
):
    """
    Send Sunday evening goal review and weekly planning prompt.

    Uses FULL context: journey + tasks + habits + conversation history
    Prompt loaded from nudge_prompts.yaml
    """
    nudge_type = "sunday_review"
    logger.info(f"📋 {nudge_type.upper()} goal setting endpoint invoked")

    requested_user_number = get_requested_nudge_user_number(user_number, request, nudge_type)
    result = (
        run_single_nudge(requested_user_number, nudge_type, db)
        if requested_user_number
        else run_batch_nudge(nudge_type, db)
    )

    logger.info(f"✅ {nudge_type} nudge completed: {result['status']}")
    return {
        "nudge_type": nudge_type,
        "timestamp": datetime.utcnow().isoformat(),
        **result
    }


# -------------------------------------------------
# Batch Endpoints (Multi-User)
# -------------------------------------------------

@router.get("/nudge/morning/batch")
def morning_nudge_batch(db: Session = Depends(get_db)):
    """Send morning nudge to ALL active users."""
    nudge_type = "morning"
    start_time = datetime.utcnow()
    logger.info(f"🌅📦 {nudge_type.upper()} batch endpoint invoked")

    users = get_all_active_users(db)
    results = [send_nudge_for_user(user_number, nudge_type, db) for user_number in users]

    duration = (datetime.utcnow() - start_time).total_seconds()
    successful = len([r for r in results if r["status"] == "success"])
    failed = len([r for r in results if r["status"] == "failed"])

    logger.info(f"✅ {nudge_type} batch: {successful} successful, {failed} failed in {duration:.2f}s")

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
    """Send evening nudge to ALL active users."""
    nudge_type = "evening"
    start_time = datetime.utcnow()
    logger.info(f"🌙📦 {nudge_type.upper()} batch endpoint invoked")

    users = get_all_active_users(db)
    results = [send_nudge_for_user(user_number, nudge_type, db) for user_number in users]

    duration = (datetime.utcnow() - start_time).total_seconds()
    successful = len([r for r in results if r["status"] == "success"])
    failed = len([r for r in results if r["status"] == "failed"])

    logger.info(f"✅ {nudge_type} batch: {successful} successful, {failed} failed in {duration:.2f}s")

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


@router.get("/nudge/weekly/batch")
def weekly_batch(db: Session = Depends(get_db)):
    """Send Friday coaching nudge to ALL active users."""
    nudge_type = "weekly"
    start_time = datetime.utcnow()
    logger.info(f"🎯📦 {nudge_type.upper()} batch endpoint invoked")

    users = get_all_active_users(db)
    results = [send_nudge_for_user(user_number, nudge_type, db) for user_number in users]

    duration = (datetime.utcnow() - start_time).total_seconds()
    successful = len([r for r in results if r["status"] == "success"])
    failed = len([r for r in results if r["status"] == "failed"])

    logger.info(f"✅ {nudge_type} batch: {successful} successful, {failed} failed")

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


@router.get("/nudge/sunday_review/batch")
def sunday_review_batch(db: Session = Depends(get_db)):
    """Send Sunday goal review nudge to ALL active users."""
    nudge_type = "sunday_review"
    start_time = datetime.utcnow()
    logger.info(f"📋📦 {nudge_type.upper()} batch endpoint invoked")

    users = get_all_active_users(db)
    results = [send_nudge_for_user(user_number, nudge_type, db) for user_number in users]

    duration = (datetime.utcnow() - start_time).total_seconds()
    successful = len([r for r in results if r["status"] == "success"])
    failed = len([r for r in results if r["status"] == "failed"])

    logger.info(f"✅ {nudge_type} batch: {successful} successful, {failed} failed")

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
# Utility Endpoints
# -------------------------------------------------

@router.get("/nudge/reload_config")
def reload_config():
    """
    Reload nudge prompts from YAML file.
    Use this to apply prompt changes without restarting the app.
    """
    try:
        reload_nudge_configs()
        return {
            "status": "success",
            "message": "Nudge configurations reloaded successfully",
            "nudge_types": list(NUDGE_CONFIGS.keys()),
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.exception("Failed to reload configs")
        raise HTTPException(status_code=500, detail=f"Failed to reload configs: {str(e)}")


@router.get("/nudge/download_log")
def download_nudge_log():
    """
    Download the nudge feedback log Excel file.

    Use this to download all logged nudges, add your feedback,
    and share back for prompt tuning.
    """
    if not NUDGE_LOG_PATH.exists():
        raise HTTPException(
            status_code=404,
            detail="No nudge log found yet. Send some nudges first!"
        )

    return FileResponse(
        path=NUDGE_LOG_PATH,
        filename=f"nudge_feedback_log_{datetime.now().strftime('%Y%m%d')}.xlsx",
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )


@router.get("/nudge/log_summary")
def get_log_summary():
    """
    Get a text summary of logged nudges.
    Shows stats and ratings if available.
    """
    if not NUDGE_LOG_PATH.exists():
        return {"summary": "No nudges logged yet."}

    try:
        df = pd.read_excel(NUDGE_LOG_PATH)

        # Calculate stats
        total = len(df)
        by_type = df['Nudge Type'].value_counts().to_dict()
        by_status = df['Status'].value_counts().to_dict()
        avg_chars = df['Character Count'].mean()

        # Ratings
        rated = df[df['Your Rating (1-5)'].notna()]
        if len(rated) > 0:
            avg_rating = rated['Your Rating (1-5)'].mean()
            rating_text = f"Average Rating: {avg_rating:.1f}/5 ({len(rated)} rated)"
        else:
            rating_text = "No ratings yet"

        summary = f"""📊 NUDGE LOG SUMMARY
Total: {total} nudges
By Type: {by_type}
By Status: {by_status}
Avg Characters: {avg_chars:.0f}
{rating_text}

Download: /api/nudge/download_log"""

        return {"summary": summary}
    except Exception as e:
        return {"summary": f"Error: {e}"}


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
    except Exception as exc:
        logger.debug("Could not count active users during nudge health check: %s", exc)

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
        "nudge_types": list(NUDGE_CONFIGS.keys()),
        "config_source": "nudge_prompts.yaml",
        "log": {
            "filepath": str(NUDGE_LOG_PATH),
            "exists": NUDGE_LOG_PATH.exists(),
            "download_url": "/api/nudge/download_log",
            "summary_url": "/api/nudge/log_summary"
        },
        "endpoints": {
            "single_user": [
                "/nudge/morning?user_number=...",
                "/nudge/evening?user_number=...",
                "/nudge/weekly?user_number=... (Friday coaching)",
                "/nudge/sunday_review?user_number=... (Sunday goals)",
            ],
            "batch": [
                "/nudge/morning/batch",
                "/nudge/evening/batch",
                "/nudge/weekly/batch (Friday coaching)",
                "/nudge/sunday_review/batch (Sunday goals)",
            ],
            "utility": [
                "/nudge/health",
                "/nudge/reload_config (reload prompts without restart)",
                "/nudge/download_log (download Excel log for feedback)",
                "/nudge/log_summary (view stats)",
            ]
        }
    }
