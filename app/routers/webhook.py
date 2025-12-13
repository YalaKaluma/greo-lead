from fastapi import APIRouter, Request, Depends
from openai import OpenAI
from twilio.rest import Client
from sqlalchemy.orm import Session
from app.config import settings
from app.db import get_db
from app.utils.message_splitter import split_message
from app.utils.task_context import get_today_tasks, format_tasks_for_context
from app.config import (
    TWILIO_SID,
    TWILIO_AUTH_TOKEN,
    TWILIO_WHATSAPP_NUMBER,
    OPENAI_API_KEY,
    OPENAI_MODEL,
)
from app.services.journey_context import build_journey_context
from app.services.message_service import save_message, load_conversation_history
from app.services.openai_service import generate_reply
from app.services import journey_service
from app.services.journey_nlp import (
    detect_strengths, detect_goal, detect_goal_why,
    detect_project, detect_person, detect_failure,
    detect_learning, detect_scar, detect_development_area
)


router = APIRouter()

twilio_client = Client(TWILIO_SID, TWILIO_AUTH_TOKEN)
@router.post("/webhook")
async def receive_whatsapp(request: Request, db: Session = Depends(get_db)):
    form = await request.form()
    incoming_msg = form.get("Body")
    sender = form.get("From")
    #user_number = message["From"]  # typically 'whatsapp:+123456789'
    user_number = form.get("From") # To be rationalized beause the same as sender

    print("📩 Incoming message:", incoming_msg)
    print("👤 From:", sender)

    # Save user message
    save_message(db, sender="user", user_number=sender, content=incoming_msg)

    # ---------------------------------------------------------
    # NLP: Strengths
    # ---------------------------------------------------------
    strengths = detect_strengths(incoming_msg)
    if strengths:
        for s in strengths:
            journey_service.add_strength(db, sender, s)
        twilio_client.messages.create(
            body="Got it — I've added these strengths to your Journey.",
            from_=TWILIO_WHATSAPP_NUMBER,
            to=sender
        )
        return {"status": "ok"}

    # ---------------------------------------------------------
    # NLP: Projects
    # ---------------------------------------------------------
    project = detect_project(incoming_msg)
    if project:
        journey_service.add_project(db, sender, name=project)
        twilio_client.messages.create(
            body=f"Great — I'm tracking your new project: {project}.",
            from_=TWILIO_WHATSAPP_NUMBER,
            to=sender
        )
        return {"status": "ok"}

    # ---------------------------------------------------------
    # NLP: People
    # ---------------------------------------------------------
    person = detect_person(incoming_msg)
    if person:
        journey_service.add_person(
            db,
            sender,
            name=person["name"],
            email=person["email"],
            phone=person["phone"]
        )
        twilio_client.messages.create(
            body=f"Added {person['name']} to your important people.",
            from_=TWILIO_WHATSAPP_NUMBER,
            to=sender
        )
        return {"status": "ok"}

    # ---------------------------------------------------------
    # NLP: Goals
    # ---------------------------------------------------------
    goal = detect_goal(incoming_msg)
    if goal:
        journey_service.add_goal(db, sender, goal)
        twilio_client.messages.create(
            body=f"Noted — your goal is now: {goal}.",
            from_=TWILIO_WHATSAPP_NUMBER,
            to=sender
        )
        return {"status": "ok"}

    goal_why = detect_goal_why(incoming_msg)
    if goal_why:
        # attach "why" to the latest goal for that user
        last_goal = journey_service.list_goals(db, sender)[-1]
        last_goal.why = goal_why
        db.commit()
        twilio_client.messages.create(
            body="Got your 'why' — this is powerful context.",
            from_=TWILIO_WHATSAPP_NUMBER,
            to=sender
        )
        return {"status": "ok"}

    # ---------------------------------------------------------
    # NLP: Failures
    # ---------------------------------------------------------
    failure_event = detect_failure(incoming_msg)
    if failure_event:
        journey_service.add_failure(db, sender, event=failure_event, learning="", scar="")
        twilio_client.messages.create(
            body="Thanks for sharing that. What was the learning?",
            from_=TWILIO_WHATSAPP_NUMBER,
            to=sender
        )
        return {"status": "ok"}

    learning = detect_learning(incoming_msg)
    if learning:
#        last_fail = journey_service.list_failures(db, sender)[-1]

        failures = journey_service.list_failures(db, sender)
        if not failures:
            twilio_client.messages.create(
                body="I couldn't find a recent failure to attach this learning to. "
                    "Can you restate the failure first?",
                from_=TWILIO_WHATSAPP_NUMBER,
                to=sender
            )
            return {"status": "ok"}
        last_fail = failures[-1]

        last_fail.learning = learning
        db.commit()
        twilio_client.messages.create(
            body="And what scar did this leave emotionally?",
            from_=TWILIO_WHATSAPP_NUMBER,
            to=sender
        )
        return {"status": "ok"}

    scar = detect_scar(incoming_msg)
    if scar:
#        last_fail = journey_service.list_failures(db, sender)[-1]
        failures = journey_service.list_failures(db, sender)
        if not failures:
            twilio_client.messages.create(
                body="I couldn't find a recent failure to attach this scar to. "
                     "Can you restate the failure first?",
                from_=TWILIO_WHATSAPP_NUMBER,
                to=sender
            )
            return {"status": "ok"}
        last_fail = failures[-1]

        last_fail.scar = scar
        db.commit()
        twilio_client.messages.create(
            body="Noted. Thank you for being honest — this helps me coach you better.",
            from_=TWILIO_WHATSAPP_NUMBER,
            to=sender
        )
        return {"status": "ok"}

    # ---------------------------------------------------------
    # NLP: Development areas
    # ---------------------------------------------------------
    dev = detect_development_area(incoming_msg)
    if dev:
        journey_service.add_development_area(db, sender, skill=dev)
        twilio_client.messages.create(
            body=f"Added to your development areas: {dev}.",
            from_=TWILIO_WHATSAPP_NUMBER,
            to=sender
        )
        return {"status": "ok"}

    # Load full history (for OpenAI)
    history = load_conversation_history(db, user_number=sender)


    # Load full history (for OpenAI)
    history = load_conversation_history(db, user_number=sender)

    # Build structured memory context
    journey_context = build_journey_context(db, sender)

    tasks = get_today_tasks(sender)
    tasks_context = format_tasks_for_context(tasks)



    #print("📝 Tasks Context:", tasks_context)
    if not tasks_context:
        tasks_context = "No tasks scheduled for today."

    SYSTEM_PROMPT_WITH_MEMORY = f"""
    You are Alfred, an AI Chief of Staff and personal coach of a Senior executive.
    You are named after Batman's Alfred, because he is to Bruce Wayne what you need to be for the user. You are a mentor, a coach, a friend, you know him deeply and help him with operational tasks in his very busy schedule 
    Your tone is warm, concise, and deeply supportive.
    Your goal: help the user - who is a a seniot business executive, think clearly, reflect with intention, and take action.

    To help you in your role, You have access to the user's long-term Journey Memory, You can see below a summary:

    {journey_context}  
    
    Use this memory to personalize your coaching.
    — Reference their strengths when motivating them.
    — Connect advice to their goals and underlying 'why'.
    — Tie emotional insights to past failures, learnings, and scars.
    — Integrate their active projects and important people when relevant.
    — Respect emotional context and psychological safety.    
    
    Now this for the long term perspective, you also have access to the  user's current Ongoing Tasks to best understand what he is up to now and what are his priorities.
    Use this to make yourself helpful and do not hesitate to refer to specific tasks and priorities in your interaction with them. This helps you understand his mondset.
    
    {tasks_context}
    
    You can also see below the detailed message you exchanged so far. The messages most likely includes deep introspective thoughts about his last days you can reuse as context of his internl mindset.
    you need to anszer to the last message in the list.
    
    Keep replies below 1400 characters.
    Never break character as Alfred.
    
    """

#    print(" Full Context:", SYSTEM_PROMPT_WITH_MEMORY)
    client = OpenAI(api_key=OPENAI_API_KEY)

    full_messages = [
        {"role": "system", "content": SYSTEM_PROMPT_WITH_MEMORY},
        *history
    ]

    print("🧾 FULL MESSAGES SENT TO GPT:")
    for msg in full_messages:
        print(f"[{msg['role'].upper()}]\n{msg['content']}\n")

    response = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=full_messages
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
            from_=TWILIO_WHATSAPP_NUMBER,
            to=sender
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

@router.post("/email/webhook")
async def email_webhook(request: Request):
    form = await request.form()

    sender = form.get("sender")
    subject = form.get("subject")
    body = form.get("stripped-text") or ""

    content = f"Subject: {subject}\n\n{body}"

    # Reuse your existing pipeline
    handle_message(
        channel="email",
        sender=sender,
        content=content
    )

    return {"status": "ok"}
