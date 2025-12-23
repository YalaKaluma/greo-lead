from fastapi import APIRouter, Depends
from app.db import get_db
from twilio.rest import Client
from openai import OpenAI
import logging

from app.services.journey_context import build_journey_context
from app.services.message_service import load_conversation_history, save_message
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

twilio_client = Client(TWILIO_SID, TWILIO_AUTH_TOKEN)
client = OpenAI(api_key=OPENAI_API_KEY)


# -------------------------------------------------
# Weekly Nudge
# -------------------------------------------------
@router.get("/nudge/weekly")
def weekly_nudge(db=Depends(get_db)):
    """
    Sends a weekly coaching nudge to the user.
    """

    if not DEFAULT_USER_NUMBER:
        logger.error("DEFAULT_USER_NUMBER is not set")
        return {"status": "error", "reason": "DEFAULT_USER_NUMBER missing"}

    message = (
        "🧭 *Your Weekly Reflection*\n"
        "Here are a few questions for your journey:\n\n"
        "• What strengths did you use this week?\n"
        "• Any failures or learnings to capture?\n"
        "• Any new projects or progress worth noting?\n"
        "• Anyone who mattered this week?\n"
        "• What do you want to improve next week?\n\n"
        "Reply naturally — I’ll structure everything automatically."
    )

    twilio_client.messages.create(
        body=message,
        from_=TWILIO_WHATSAPP_NUMBER,
        to=DEFAULT_USER_NUMBER,
    )

    return {"status": "weekly_nudge_sent"}


# -------------------------------------------------
# Morning Nudge (CRON SAFE)
# -------------------------------------------------
@router.get("/nudge/morning")
def morning_nudge(db=Depends(get_db)):
    """
    7am compliment + motivational message.
    Conversation history intentionally disabled for cron robustness.
    """

    logger.info("⏰ MORNING NUDGE ENDPOINT HIT")

    user_number = DEFAULT_USER_NUMBER
    if not user_number:
        logger.error("DEFAULT_USER_NUMBER is not set")
        return {"status": "error", "reason": "DEFAULT_USER_NUMBER missing"}

    # -------------------------------------------------
    # Journey context (safe, deterministic)
    # -------------------------------------------------
    try:
        journey_context = build_journey_context(db, user_number)
    except Exception as e:
        logger.exception("Failed to build journey context")
        return {"status": "error", "step": "journey_context", "detail": str(e)}

    # -------------------------------------------------
    # Conversation history (INTENTIONALLY DISABLED)
    # Cron jobs should be stateless and robust.
    # Uncomment later if/when needed with safeguards.
    # -------------------------------------------------
    # history = load_conversation_history(db, user_number=user_number)
    # short_history = history[-8:]

    system_prompt = f"""
You are Alfred, an AI Chief of Staff.
It's the start of the user's day.

Use the user’s Journey Memory:

{journey_context}

Your task:
- Send ONE uplifting morning message.
- Begin with a genuine compliment.
- Be warm, concise, empowering.
- No questions.
- Max 350 characters.
"""

    # -------------------------------------------------
    # OpenAI call (system-only for cron safety)
    # -------------------------------------------------
    try:
        response = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": system_prompt}
                # Re-enable later:
                # *short_history
            ],
        )
        text = response.choices[0].message.content.strip()
    except Exception as e:
        logger.exception("OpenAI call failed")
        return {"status": "error", "step": "openai", "detail": str(e)}

    # -------------------------------------------------
    # Send WhatsApp message
    # -------------------------------------------------
    try:
        twilio_client.messages.create(
            body=text,
            from_=TWILIO_WHATSAPP_NUMBER,
            to=user_number,
        )
    except Exception as e:
        logger.exception("Twilio send failed")
        return {"status": "error", "step": "twilio", "detail": str(e)}

    # -------------------------------------------------
    # Save message (non-blocking)
    # -------------------------------------------------
    try:
        save_message(db, sender="assistant", user_number=user_number, content=text)
    except Exception:
        logger.warning("Failed to save message (non-blocking)")

    logger.info("✅ Morning nudge sent successfully")
    return {"status": "morning_nudge_sent"}


# -------------------------------------------------
# Evening Nudge (same pattern, history commented)
# -------------------------------------------------
@router.get("/nudge/evening")
def evening_nudge(db=Depends(get_db)):
    """
    6pm reflective check-in.
    Conversation history intentionally disabled for cron robustness.
    """

    logger.info("🌙 EVENING NUDGE ENDPOINT HIT")

    user_number = DEFAULT_USER_NUMBER
    if not user_number:
        logger.error("DEFAULT_USER_NUMBER is not set")
        return {"status": "error", "reason": "DEFAULT_USER_NUMBER missing"}

    journey_context = build_journey_context(db, user_number)

    # history = load_conversation_history(db, user_number=user_number)
    # short_history = history[-8:]

    system_prompt = f"""
You are Alfred, an AI Chief of Staff and coach.
It is the end of the user's day.

Use the user’s Journey Memory:

{journey_context}

Your task:
- Ask 1–3 reflection questions.
- Reference goals, projects, strengths, or development areas.
- Be warm and thoughtful.
- Max 450 characters.
"""

    response = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {"role": "system", "content": system_prompt}
            # *short_history
        ],
    )

    text = response.choices[0].message.content.strip()

    twilio_client.messages.create(
        body=text,
        from_=TWILIO_WHATSAPP_NUMBER,
        to=user_number,
    )

    save_message(db, sender="assistant", user_number=user_number, content=text)

    logger.info("✅ Evening nudge sent successfully")
    return {"status": "evening_nudge_sent"}
