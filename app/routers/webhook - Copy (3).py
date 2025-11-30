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

    # 1. Save user message
    save_message(db, sender="user", user_number=sender, content=incoming_msg)

    # 2. Load full conversation history
    history = load_conversation_history(db, sender)

    # 3. Generate AI reply
    ai_reply = await generate_reply(history)

    # 4. Save assistant message
    save_message(db, sender="assistant", user_number=sender, content=ai_reply)

    # 5. Send WhatsApp reply
    twilio_client.messages.create(
        from_=TWILIO_WHATSAPP_NUMBER,
        to=sender,
        body=ai_reply
    )

    return {"status": "ok"}
