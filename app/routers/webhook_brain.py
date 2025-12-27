# app/routers/webhook_brain.py
"""
Webhook router with Alfred's Brain integration.

This replaces the old rule-based NLP with intent-driven orchestration.
"""

from fastapi import APIRouter, Request, Depends
from sqlalchemy.orm import Session
from twilio.rest import Client
import requests

from app.db import get_db
from app.config import (
    TWILIO_SID,
    TWILIO_AUTH_TOKEN,
    TWILIO_WHATSAPP_NUMBER,
    MAILGUN_API_KEY,
    MAILGUN_DOMAIN,
    MAILGUN_FROM,
)

from app.services.message_service import save_message
from app.services.orchestrator import orchestrate
from app.utils.message_splitter import split_message

# Onboarding support
from app.models import User
from app.services.onboarding_service import (
    OnboardingConversation,
    EmailVerificationService
)

router = APIRouter()
twilio_client = Client(TWILIO_SID, TWILIO_AUTH_TOKEN)


# =========================================================
# BRAIN-POWERED MESSAGE PROCESSING
# =========================================================
def process_message_brain(
        *,
        channel: str,
        sender: str,
        incoming_msg: str,
        db: Session,
) -> str:
    """
    Process message using Alfred's Brain.

    This replaces the old rule-based NLP with:
    - Intent detection via GPT
    - State-driven orchestration
    - Context-aware responses

    Args:
        channel: 'whatsapp' or 'email'
        sender: User identifier
        incoming_msg: User's message
        db: Database session

    Returns:
        Alfred's response
    """

    # DEBUG LOGGING
    print(f"🔍 DEBUG: Message='{incoming_msg}', Sender={sender}")
    is_trigger = OnboardingConversation.is_onboarding_trigger(incoming_msg)
    print(f"🔍 DEBUG: is_onboarding_trigger returned: {is_trigger}")

    # -------- ONBOARDING FLOW CHECK (HIGHEST PRIORITY) --------
    # Get or create user first
    user = db.query(User).filter(User.phone_number == sender).first()
    print(f"🔍 DEBUG: User exists? {user is not None}")
    if user:
        print(f"🔍 DEBUG: onboarding_step={user.onboarding_step}, completed={user.onboarding_completed}")

    # Check if this is "Hey Alfred" trigger
    if OnboardingConversation.is_onboarding_trigger(incoming_msg):
        if not user:
            # Brand new user - create them
            user, is_new = OnboardingConversation.get_user_or_create(db, sender)
        else:
            # Existing user wants to restart onboarding
            user.onboarding_step = 'INITIAL'
            user.onboarding_completed = False
            db.commit()

        # Process the trigger message and RETURN EARLY
        response = OnboardingConversation.process_onboarding_message(db, user, incoming_msg)
        save_message(db, sender="user", user_number=sender, content=incoming_msg)
        save_message(db, sender="assistant", user_number=sender, content=response)
        return response

    # If user exists and is mid-onboarding (not completed), continue onboarding
    if user and user.onboarding_step != 'COMPLETED' and not user.onboarding_completed:
        response = OnboardingConversation.process_onboarding_message(db, user, incoming_msg)
        if response:  # Onboarding returned a response
            save_message(db, sender="user", user_number=sender, content=incoming_msg)
            save_message(db, sender="assistant", user_number=sender, content=response)
            return response

    # -------- EMAIL VERIFICATION CHECK --------
    # Check if user is sending a verification code
    if user and user.email is None:  # Email not yet verified
        # Check if message is a 6-digit code
        if incoming_msg.strip().isdigit() and len(incoming_msg.strip()) == 6:
            pending = EmailVerificationService.get_pending_verification(db, user.id)
            if pending:
                success, message = EmailVerificationService.verify_code(db, user.id, incoming_msg.strip())
                save_message(db, sender="user", user_number=sender, content=incoming_msg)
                save_message(db, sender="assistant", user_number=sender, content=message)
                return message

    # -------- NORMAL BRAIN PROCESSING --------
    # Save user message
    save_message(db, sender="user", user_number=sender, content=incoming_msg)

    # Orchestrate response using Brain
    result = orchestrate(
        db=db,
        user_number=sender,
        user_message=incoming_msg,
        channel=channel
    )

    # Save Alfred's response
    save_message(db, sender="assistant", user_number=sender, content=result.response)

    # Log actions taken (for debugging)
    if result.actions:
        print(f"🎬 Actions: {', '.join(result.actions)}")

    return result.response


# =========================================================
# WHATSAPP WEBHOOK
# =========================================================
@router.post("/webhook")
async def whatsapp_webhook(
        request: Request,
        db: Session = Depends(get_db),
):
    """
    WhatsApp webhook endpoint.

    Uses Brain-powered orchestration instead of rule-based NLP.
    """
    form = await request.form()
    incoming_msg = form.get("Body")
    sender = form.get("From")

    print(f"\n📱 WhatsApp message from {sender}")

    # Process with Brain
    bot_reply = process_message_brain(
        channel="whatsapp",
        sender=sender,
        incoming_msg=incoming_msg,
        db=db,
    )

    # Send response (split if needed)
    chunks = split_message(bot_reply)
    for i, chunk in enumerate(chunks, start=1):
        prefix = f"[{i}/{len(chunks)}]\n" if len(chunks) > 1 else ""
        twilio_client.messages.create(
            body=prefix + chunk,
            from_=TWILIO_WHATSAPP_NUMBER,
            to=sender,
        )

    return {"status": "ok"}


# =========================================================
# EMAIL WEBHOOK (Mailgun)
# =========================================================
@router.post("/email/webhook")
async def email_webhook(
        request: Request,
        db: Session = Depends(get_db),
):
    """
    Email webhook endpoint.

    Uses Brain-powered orchestration.
    """
    form = await request.form()

    sender = form.get("sender")
    subject = form.get("subject") or ""
    body = form.get("stripped-text") or ""

    incoming_msg = f"Subject: {subject}\n\n{body}"

    print(f"\n📧 Email from {sender}")

    # Process with Brain
    bot_reply = process_message_brain(
        channel="email",
        sender=sender,
        incoming_msg=incoming_msg,
        db=db,
    )

    # Send email reply
    send_email(
        to=sender,
        subject=f"Re: {subject}" if subject else "Re:",
        text=bot_reply,
    )

    return {"status": "ok"}


def send_email(to: str, subject: str, text: str):
    """Send email via Mailgun."""
    return requests.post(
        f"https://api.mailgun.net/v3/{MAILGUN_DOMAIN}/messages",
        auth=("api", MAILGUN_API_KEY),
        data={
            "from": MAILGUN_FROM,
            "to": [to],
            "subject": subject,
            "text": text,
        },
    )