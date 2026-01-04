from fastapi import APIRouter, Request, Depends
from sqlalchemy.orm import Session
from openai import OpenAI
from twilio.rest import Client
import requests
from app.config import MAILGUN_API_KEY, MAILGUN_DOMAIN, MAILGUN_FROM

from app.db import get_db
from app.config import (
    TWILIO_SID,
    TWILIO_AUTH_TOKEN,
    TWILIO_WHATSAPP_NUMBER,
    OPENAI_API_KEY,
    OPENAI_MODEL,
)

from app.services.message_service import save_message, load_conversation_history
from app.services.journey_context import build_journey_context
from app.services import journey_service
from app.services.journey_nlp import (
    detect_strengths,
    detect_project,
    detect_person,
    detect_goal,
    detect_goal_why,
    detect_failure,
    detect_learning,
    detect_scar,
    detect_development_area,
)

from app.utils.task_context import get_today_tasks, format_tasks_for_context
from app.utils.message_splitter import split_message

router = APIRouter()
twilio_client = Client(TWILIO_SID, TWILIO_AUTH_TOKEN)
openai_client = OpenAI(api_key=OPENAI_API_KEY)

# =========================================================
# CORE SHARED BRAIN (used by WhatsApp + Email)
# =========================================================
def process_message(
    *,
    channel: str,
    sender: str,
    incoming_msg: str,
    db: Session,
) -> str:
    # Save user message
    save_message(db, sender="user", user_number=sender, content=incoming_msg)

    # -------- NLP SHORT-CIRCUITS --------
    strengths = detect_strengths(incoming_msg)
    if strengths:
        for s in strengths:
            journey_service.add_strength(db, sender, s)
        return "Got it — I've added these strengths to your Journey."

    project = detect_project(incoming_msg)
    if project:
        journey_service.add_project(db, sender, name=project)
        return f"Great — I'm tracking your new project: {project}."

    person = detect_person(incoming_msg)
    if person:
        journey_service.add_person(
            db,
            sender,
            name=person["name"],
            email=person["email"],
            phone=person["phone"],
        )
        return f"Added {person['name']} to your important people."

    goal = detect_goal(incoming_msg)
    if goal:
        journey_service.add_goal(db, sender, goal)
        return f"Noted — your goal is now: {goal}."

    goal_why = detect_goal_why(incoming_msg)
    if goal_why:
        goals = journey_service.list_goals(db, sender)
        if goals:
            goals[-1].why = goal_why
            db.commit()
            return "Got your 'why' — this adds powerful clarity."

    failure = detect_failure(incoming_msg)
    if failure:
        journey_service.add_failure(db, sender, failure, learning="", scar="")
        return "Thanks for sharing that. What was the learning?"

    learning = detect_learning(incoming_msg)
    if learning:
        failures = journey_service.list_failures(db, sender)
        if failures:
            failures[-1].learning = learning
            db.commit()
            return "And what scar did this leave emotionally?"

    scar = detect_scar(incoming_msg)
    if scar:
        failures = journey_service.list_failures(db, sender)
        if failures:
            failures[-1].scar = scar
            db.commit()
            return "Noted. Thank you for your honesty."

    dev = detect_development_area(incoming_msg)
    if dev:
        journey_service.add_development_area(db, sender, dev)
        return f"Added to your development areas: {dev}."

    # -------- GPT REPLY --------
    history = load_conversation_history(db, sender)
    journey_context = build_journey_context(db, sender)

    tasks = get_today_tasks(sender)
    tasks_context = format_tasks_for_context(tasks) or "No tasks scheduled for today."

    system_prompt = f"""
You are Alfred, an AI Chief of Staff and personal coach to a senior executive.
Your tone is warm, concise, and deeply supportive.

You have access to the user's Journey Memory:
{journey_context}

You also see today's tasks:
{tasks_context}

Reply to the last user message.
Keep responses concise.
Never break character.
"""

    messages = [{"role": "system", "content": system_prompt}, *history]

    response = openai_client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=messages,
    )

    bot_reply = response.choices[0].message.content

    save_message(db, sender="assistant", user_number=sender, content=bot_reply)
    return bot_reply


# =========================================================
# WHATSAPP WEBHOOK
# =========================================================
@router.post("/webhook")
async def whatsapp_webhook(
    request: Request,
    db: Session = Depends(get_db),
):
    form = await request.form()
    incoming_msg = form.get("Body")
    sender = form.get("From")

    bot_reply = process_message(
        channel="whatsapp",
        sender=sender,
        incoming_msg=incoming_msg,
        db=db,
    )

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
    form = await request.form()

    sender = form.get("sender")
    subject = form.get("subject") or ""
    body = form.get("stripped-text") or ""

    incoming_msg = f"Subject: {subject}\n\n{body}"

    bot_reply = process_message(
        channel="email",
        sender=sender,
        incoming_msg=incoming_msg,
        db=db,
    )

    # For now: just log (sending email reply is next step)
#    print("📧 Alfred email reply:\n", bot_reply)

    send_email(
        to=sender,
        subject=f"Re: {subject}" if subject else "Re:",
        text=bot_reply,
    )

    return {"status": "ok"}




def send_email(to: str, subject: str, text: str):
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

