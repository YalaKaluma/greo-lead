from fastapi import APIRouter, Request, Depends
from openai import OpenAI
from twilio.rest import Client
from sqlalchemy.orm import Session
from app.db import get_db
from utils.message_splitter import split_message
from app.config import (
    TWILIO_SID,
    TWILIO_AUTH_TOKEN,
    OPENAI_API_KEY,
    TWILIO_WHATSAPP_NUMBER
)
from app.services.message_service import save_message, load_conversation_history
from app.services.openai_service import generate_reply

router = APIRouter()

twilio_client = Client(TWILIO_SID, TWILIO_AUTH_TOKEN)
@router.post("/webhook")
async def receive_whatsapp(request: Request, db: Session = Depends(get_db)):
    form = await request.form()
    incoming_msg = form.get("Body")
    sender = form.get("From")

    print("📩 Incoming message:", incoming_msg)
    print("👤 From:", sender)

    # Save user message
    save_message(db, sender="user", user_number=sender, content=incoming_msg)

    # Load full history (for OpenAI)
    history = load_conversation_history(db, user_number=sender)

    # Generate assistant reply using ALL history
    client = OpenAI(api_key=OPENAI_API_KEY)
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are an AI coach on WhatsApp. "
                    "Your tone is warm, concise, and supportive. "
                    "Always keep replies below 1400 characters. "
                    "Use the full conversation history to understand context. "
                    "Your role: help the user reflect, think clearly, and move forward."
                )
            },
            *history
        ]
    )


    bot_reply = response.choices[0].message.content

    # Save assistant reply
    save_message(db, sender="assistant", user_number=sender, content=bot_reply)

    # Now split the message
    chunks = split_message(bot_reply)

    total = len(chunks)

    for i, chunk in enumerate(chunks, start=1):
        prefix = f"[{i}/{total}]\n" if total > 1 else ""

        twilio_client.messages.create(
            body=prefix + chunk,
            from_=settings.TWILIO_WHATSAPP_NUMBER,
            to=user_number
        )

# Previous version without split
    # Send reply via Twilio
#    twilio_client.messages.create(
#        body=bot_reply,
#        from_=TWILIO_WHATSAPP_NUMBER,
#        to=sender
#    )

    return {"status": "ok"}

@router.get("/send_nudge")
async def send_daily_nudge(db: Session = Depends(get_db)):
    users = db.query(Message.user_number).distinct().all()

    for (user,) in users:
        twilio_client.messages.create(
            body="👋 Good morning! What’s one insight, feeling, or goal you want to reflect on today?",
            from_=TWILIO_WHATSAPP_NUMBER,
            to=user
        )
    return {"status": "nudges sent"}