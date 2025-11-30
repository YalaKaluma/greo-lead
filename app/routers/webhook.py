from fastapi import APIRouter, Request, Depends
from app.db import get_db
from app.models import JournalEntry
from datetime import datetime
import os
import httpx

router = APIRouter(prefix="/webhook")

@router.post("/")
async def receive_whatsapp(request: Request, db=Depends(get_db)):

    body = await request.form()

    from_number = body.get("From")
    message = body.get("Body")

    # Save the journal entry
    new_entry = JournalEntry(
        user_id=1,  # ← Later this will map phone → user
        text=message,
        created_at=datetime.utcnow()
    )
    db.add(new_entry)
    db.commit()

    # Temporary echo response
    reply = f"Thanks for your message: {message}"

    # Respond through Twilio
    TWILIO_URL = "https://api.twilio.com/2010-04-01/Accounts/" + os.getenv("TWILIO_SID") + "/Messages.json"

    async with httpx.AsyncClient() as client:
        await client.post(
            TWILIO_URL,
            data={
                "To": from_number,
                "From": os.getenv("TWILIO_WHATSAPP_NUMBER"),
                "Body": reply
            },
            auth=(os.getenv("TWILIO_SID"), os.getenv("TWILIO_AUTH_TOKEN"))
        )

    return {"status": "ok"}
