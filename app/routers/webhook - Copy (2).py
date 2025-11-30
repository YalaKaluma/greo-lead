from fastapi import APIRouter, Request
from twilio.rest import Client
import os

router = APIRouter()

# Load Twilio credentials from env
TWILIO_SID = os.getenv("TWILIO_SID")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_WHATSAPP_NUMBER = os.getenv("TWILIO_WHATSAPP_NUMBER")

client = Client(TWILIO_SID, TWILIO_AUTH_TOKEN)

@router.post("/webhook/")
async def receive_whatsapp(request: Request):
    form = await request.form()
    incoming_msg = form.get("Body", "")
    sender = form.get("From", "")

    print("📩 Incoming message:", incoming_msg)
    print("👤 From:", sender)

    # Send reply message
    client.messages.create(
        from_=TWILIO_WHATSAPP_NUMBER,
        to=sender,  # sender already contains 'whatsapp:+17707789240'
        body=f"Hello! Your message was received: {incoming_msg}"
    )

    return {"status": "ok"}
