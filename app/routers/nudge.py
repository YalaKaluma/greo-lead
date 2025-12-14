from fastapi import APIRouter, Depends
from app.db import get_db
from twilio.rest import Client
from openai import OpenAI
from app.services.journey_context import build_journey_context
from app.services.message_service import load_conversation_history, save_message
from app.config import settings
from app.config import DATABASE_URL, OPENAI_API_KEY
from app.config import (
    TWILIO_SID,
    TWILIO_AUTH_TOKEN,
    TWILIO_WHATSAPP_NUMBER,
    OPENAI_API_KEY,
    OPENAI_MODEL,
    DEFAULT_USER_NUMBER,
)

router = APIRouter()

twilio_client = Client(TWILIO_SID, TWILIO_AUTH_TOKEN)

client = OpenAI(api_key=OPENAI_API_KEY)

@router.get("/weekly_nudge")
def weekly_nudge(db=Depends(get_db)):
    """
    Sends a weekly coaching nudge to the user.
    In the future this can loop over all users, but for now it targets one.
    """

    target = DEFAULT_USER_NUMBER  # e.g. "whatsapp:+1770xxxxxxx"

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
        to=target
    )

    return {"status": "nudge_sent"}


@router.get("/nudge/morning")
def morning_nudge(db=Depends(get_db)):
    """
    7am compliment + motivational message based on journey + history.
    """

    user_number = DEFAULT_USER_NUMBER

    # Load structured memory + recent chat
    journey_context = build_journey_context(db, user_number)
    history = load_conversation_history(db, user_number=user_number)
    short_history = history[-8:]  # keep it small for tone/vibe only

    system_prompt = f"""
You are Alfred, an AI Chief of Staff.
It's the start of the user's day.

Use the user’s Journey Memory:

{journey_context}

And their recent conversation to tune your tone.

Your task:
- Send ONE uplifting morning message.
- Begin with a genuine compliment based on their strengths, goals, projects, or progress.
- Be warm, concise, empowering.
- No questions in the morning message.
- Max 350 characters.
"""

    response = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            *short_history
        ],
    )

    text = response.choices[0].message.content.strip()

    twilio_client.messages.create(
        body=text,
        from_=TWILIO_WHATSAPP_NUMBER,
        to=user_number
    )

    save_message(db, sender="assistant", user_number=user_number, content=text)

    return {"status": "morning_nudge_sent"}

@router.get("/nudge/evening")
def evening_nudge(db=Depends(get_db)):
    """
    6pm check-in using journey memory + conversational context.
    """

    user_number = DEFAULT_USER_NUMBER

    journey_context = build_journey_context(db, user_number)
    history = load_conversation_history(db, user_number=user_number)
    short_history = history[-8:]

    system_prompt = f"""
You are Alfred, an AI Chief of Staff and coach.
It is the end of the user's day.

Use the user’s Journey Memory:

{journey_context}

Your task:
- Ask 1–3 questions about how the day went.
- Reference their goals, projects, strengths, or development areas.
- Make the check-in feel *personal and relevant*.
- Be warm, curious, and reflective.
- Max 450 characters.
"""

    response = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            *short_history
        ],
    )

    text = response.choices[0].message.content.strip()

    twilio_client.messages.create(
        body=text,
        from_=TWILIO_WHATSAPP_NUMBER,
        to=user_number
    )

    save_message(db, sender="assistant", user_number=user_number, content=text)

    return {"status": "evening_nudge_sent"}
