from fastapi import APIRouter, Request, Depends
from twilio.rest import Client
from sqlalchemy.orm import Session
from app.db import get_db
from app.config import (
    TWILIO_SID,
    TWILIO_AUTH_TOKEN,
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
        messages=history
    )

    bot_reply = response.choices[0].message["content"]

    # Save assistant reply
    save_message(db, sender="assistant", user_number=sender, content=bot_reply)

    # Send reply via Twilio
    twilio_client.messages.create(
        body=bot_reply,
        from_=TWILIO_WHATSAPP_NUMBER,
        to=sender
    )

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