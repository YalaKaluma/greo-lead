"""Natural, five-question onboarding for the in-app Alfred conversation."""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, time

from openai import OpenAI
from sqlalchemy.orm import Session

from app.config import OPENAI_API_KEY, OPENAI_MODEL
from app.models import (
    Habit,
    JourneyDevelopmentArea,
    JourneyGoal,
    JourneyStrength,
    OnboardingStep,
    Task,
    User,
)
from app.services.timezone_service import get_user_timezone, today_for_timezone

logger = logging.getLogger(__name__)

FLOW_VERSION = 2
STEPS = [
    OnboardingStep.INITIAL,
    OnboardingStep.GOAL,
    OnboardingStep.GOAL_WHY,
    OnboardingStep.TASKS,
    OnboardingStep.QUICK_WIN,
]
QUESTIONS = {
    OnboardingStep.INITIAL: "Welcome — I’m Alfred. Let’s set up your workspace together. What is your name and what is your profession?",
    OnboardingStep.GOAL: "Great to meet you, {name}. Tell me one big goal you want to achieve.",
    OnboardingStep.GOAL_WHY: "What are your key strengths and opportunities for development to achieve this goal?",
    OnboardingStep.TASKS: "What are the key things you should execute in the next 3 days to move toward this goal?",
    OnboardingStep.QUICK_WIN: "What key habits would help you on a daily basis to achieve your goal?",
}


def _data(user: User) -> dict:
    data = dict(user.onboarding_data or {})
    if data.get("flow_version") != FLOW_VERSION:
        data = {"flow_version": FLOW_VERSION, "history": [], "created": {}}
    data.setdefault("history", [])
    data.setdefault("created", {})
    return data


def _question(user: User) -> str:
    template = QUESTIONS.get(user.onboarding_step, QUESTIONS[OnboardingStep.INITIAL])
    return template.format(name=user.name or "there")


def get_session(user: User) -> dict:
    if user.onboarding_completed:
        return {"completed": True, "step": "COMPLETED", "messages": [], "progress": len(STEPS), "total": len(STEPS)}

    data = _data(user)
    history = list(data["history"])
    if not history:
        history.append({"role": "assistant", "content": _question(user)})
    return {
        "completed": False,
        "step": user.onboarding_step.value if hasattr(user.onboarding_step, "value") else str(user.onboarding_step),
        "messages": history,
        "progress": STEPS.index(user.onboarding_step) + 1 if user.onboarding_step in STEPS else 1,
        "total": len(STEPS),
    }


def _extract(step: OnboardingStep, answer: str) -> dict:
    """Extract structured content and decide whether a short follow-up is needed."""
    if OPENAI_API_KEY:
        schema = {
            "INITIAL": "name (string), profession (string)",
            "GOAL": "title (short string), goal_text (string)",
            "GOAL_WHY": "strengths (array of strings), development_areas (array of strings)",
            "TASKS": "items (array of concise action strings)",
            "QUICK_WIN": "items (array of concise daily habit strings)",
        }[step.value]
        prompt = f"""You extract onboarding answers for a leadership app.
Current question step: {step.value}
Required fields: {schema}
User answer: {answer}

Return JSON with: sufficient (boolean), follow_up (one brief natural question or empty string), and the required fields.
Be generous: natural conversational answers are sufficient when the requested meaning is reasonably clear.
For GOAL_WHY, require at least one strength and one development opportunity.
Do not invent facts. Convert task and habit prose into concise individual items."""
        try:
            response = OpenAI(api_key=OPENAI_API_KEY).chat.completions.create(
                model=OPENAI_MODEL,
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                temperature=0,
            )
            return json.loads(response.choices[0].message.content or "{}")
        except Exception:
            logger.exception("AI onboarding extraction failed; using conservative fallback")

    text = answer.strip()
    parts = [part.strip(" -\t") for part in re.split(r"[,;\n]+", text) if part.strip(" -\t")]
    if step == OnboardingStep.INITIAL:
        match = re.match(r"(?:my name is\s+)?(.+?)(?:\s+and\s+|,\s*)(?:i(?:'m| am)\s+|a\s+)?(.+)$", text, re.I)
        if not match:
            return {"sufficient": False, "follow_up": "I caught part of that. What name and profession should I use?"}
        return {"sufficient": True, "name": match.group(1).strip(), "profession": match.group(2).strip()}
    if len(text) < 3:
        return {"sufficient": False, "follow_up": "Could you tell me a little more?"}
    if step == OnboardingStep.GOAL:
        return {"sufficient": True, "title": text[:200], "goal_text": text}
    if step == OnboardingStep.GOAL_WHY:
        if len(parts) < 2:
            return {"sufficient": False, "follow_up": "And what is one development opportunity that would help you reach the goal?"}
        return {"sufficient": True, "strengths": [parts[0]], "development_areas": parts[1:]}
    return {"sufficient": True, "items": parts or [text]}


def _append(history: list, role: str, content: str) -> None:
    history.append({"role": role, "content": content})


def _has_required_content(step: OnboardingStep, extracted: dict) -> bool:
    if not extracted.get("sufficient"):
        return False
    if step == OnboardingStep.INITIAL:
        return bool(str(extracted.get("name") or "").strip() and str(extracted.get("profession") or "").strip())
    if step == OnboardingStep.GOAL:
        return bool(str(extracted.get("goal_text") or "").strip())
    if step == OnboardingStep.GOAL_WHY:
        return bool(extracted.get("strengths") and extracted.get("development_areas"))
    return bool(extracted.get("items"))


def respond(db: Session, user: User, answer: str) -> dict:
    if user.onboarding_completed:
        return get_session(user)
    answer = answer.strip()
    if not answer:
        raise ValueError("Please enter a response.")

    step = user.onboarding_step if user.onboarding_step in STEPS else OnboardingStep.INITIAL
    data = _data(user)
    history = data["history"]
    if not history:
        _append(history, "assistant", _question(user))
    _append(history, "user", answer)

    attempts = dict(data.get("step_answers") or {})
    step_key = step.value
    step_attempts = list(attempts.get(step_key) or [])
    step_attempts.append(answer)
    attempts[step_key] = step_attempts
    data["step_answers"] = attempts
    extracted = _extract(step, "\n".join(step_attempts))
    if not _has_required_content(step, extracted):
        follow_up = extracted.get("follow_up") or "Could you tell me a little more?"
        _append(history, "assistant", follow_up)
        data["history"] = history
        user.onboarding_data = data
        db.commit()
        return get_session(user)

    created = data["created"]
    attempts.pop(step_key, None)
    data["step_answers"] = attempts
    if step == OnboardingStep.INITIAL:
        user.name = str(extracted.get("name") or user.name or "").strip()
        user.profession = str(extracted.get("profession") or "").strip()
        data["identity"] = {"name": user.name, "profession": user.profession}
        user.onboarding_step = OnboardingStep.GOAL
    elif step == OnboardingStep.GOAL:
        goal = JourneyGoal(
            user_number=user.phone_number,
            title=str(extracted.get("title") or answer)[:200],
            goal_text=str(extracted.get("goal_text") or answer),
            time_horizon="vision",
            sort_order=0,
        )
        db.add(goal)
        db.flush()
        created["goal_id"] = goal.id
        user.onboarding_step = OnboardingStep.GOAL_WHY
    elif step == OnboardingStep.GOAL_WHY:
        strengths = [str(item).strip() for item in extracted.get("strengths", []) if str(item).strip()]
        areas = [str(item).strip() for item in extracted.get("development_areas", []) if str(item).strip()]
        for item in strengths:
            db.add(JourneyStrength(user_number=user.phone_number, title=item[:200], strength=item, source="onboarding"))
        for item in areas:
            db.add(JourneyDevelopmentArea(user_number=user.phone_number, title=item[:200], skill=item, source="onboarding"))
        data["strengths"] = strengths
        data["development_areas"] = areas
        user.onboarding_step = OnboardingStep.TASKS
    elif step == OnboardingStep.TASKS:
        items = [str(item).strip() for item in extracted.get("items", []) if str(item).strip()]
        task_ids = []
        user_today = today_for_timezone(get_user_timezone(db, user.phone_number))
        due_today = datetime.combine(user_today, time.min)
        for index, item in enumerate(items):
            task = Task(
                user_number=user.phone_number,
                title=item,
                notes="Added during Alfred onboarding",
                due_date=due_today,
                priority="High",
                goal_id=created.get("goal_id"),
                sort_order=index,
            )
            db.add(task)
            db.flush()
            task_ids.append(task.id)
        created["task_ids"] = task_ids
        user.onboarding_step = OnboardingStep.QUICK_WIN
    elif step == OnboardingStep.QUICK_WIN:
        items = [str(item).strip() for item in extracted.get("items", []) if str(item).strip()]
        habit_ids = []
        for item in items:
            habit = Habit(user_number=user.phone_number, title=item, goal_id=created.get("goal_id"), frequency="daily")
            db.add(habit)
            db.flush()
            habit_ids.append(habit.id)
        created["habit_ids"] = habit_ids
        user.onboarding_step = OnboardingStep.COMPLETED
        user.onboarding_completed = True

    data["created"] = created
    if user.onboarding_completed:
        _append(history, "assistant", "You’re all set. I’ve added your goal, strengths, development opportunities, next three-day actions, and daily habits to Alfred. Let’s get to work.")
    else:
        _append(history, "assistant", _question(user))
    data["history"] = history
    data["completed_at"] = datetime.utcnow().isoformat() if user.onboarding_completed else None
    user.onboarding_data = data
    db.commit()
    return get_session(user) | {"messages": history}
