"""Adaptive first coaching conversation and Leadership OS generation."""

from __future__ import annotations

import json
import logging
from datetime import datetime, time
from typing import Any

from openai import OpenAI
from sqlalchemy.orm import Session

from app.config import OPENAI_API_KEY, OPENAI_MODEL
from app.models import Habit, JourneyDevelopmentArea, JourneyGoal, JourneyStrength, OnboardingStep, Task, User
from app.services.audit_log_service import write_audit_log
from app.services.leadership_coaching_service import LEADERSHIP_QUADRANTS
from app.services.timezone_service import get_user_timezone, today_for_timezone

logger = logging.getLogger(__name__)
FLOW_VERSION = 3
PROMPT_VERSION = "onboarding_coach_v4"
OPENING = (
    "Welcome. I’m Alfred. Let’s talk about what you want to achieve and where you stand "
    "so I can best help you. What is the most important goal you want to achieve?"
)


def _fresh_data() -> dict:
    return {
        "flow_version": FLOW_VERSION,
        "status": "in_progress",
        "history": [{"role": "assistant", "content": OPENING}],
        "facts": {},
        "message_count": 0,
        "prompt_version": PROMPT_VERSION,
    }


def _data(user: User) -> dict:
    data = dict(user.onboarding_data or {})
    if data.get("flow_version") != FLOW_VERSION:
        seeded = {key: value for key, value in data.items() if key.startswith("starter_")}
        data = _fresh_data() | seeded
    data.setdefault("history", [{"role": "assistant", "content": OPENING}])
    data.setdefault("facts", {})
    data.setdefault("message_count", 0)
    data.setdefault("status", "in_progress")
    return data


def get_session(user: User) -> dict:
    data = _data(user)
    return {
        "completed": bool(user.onboarding_completed),
        "status": data.get("status"),
        "messages": data.get("history", []),
        "conversation_progress": min(int(data.get("message_count", 0)) / 6, 1),
        "result": data.get("result"),
    }


def _json_completion(system: str, payload: dict) -> dict:
    if not OPENAI_API_KEY:
        raise RuntimeError("OpenAI is not configured")
    response = OpenAI(api_key=OPENAI_API_KEY).chat.completions.create(
        model=OPENAI_MODEL,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": json.dumps(payload)}],
        response_format={"type": "json_object"},
        temperature=0.25,
    )
    return json.loads(response.choices[0].message.content or "{}")


def _coach_turn(history: list[dict], facts: dict, message_count: int) -> dict:
    domain_names = [item["name"] for item in LEADERSHIP_QUADRANTS.values()]
    system = f"""You are Alfred, an experienced chief of staff having a first coaching conversation.
Your purpose is to understand the person, not configure a tool. Be warm, concise, perceptive, and practical.
Gather: ambition, why it matters, success/time horizon, obstacles, strengths, development needs, immediate work,
and consistent behaviors. Recognize information already shared. Reflect understanding occasionally, but do not
ask for approval of generated records. Ask exactly one focused question at a time.
When first asking about habits or consistent behaviors, ask the user to name one habit or routine they think would
help. After they respond, propose up to 2 additional concrete habits that fit their stated ambition and context,
then invite them to choose, edit, or ignore those additions. Keep the suggestions practical and non-prescriptive.

Normally transition after 4-7 user messages. Never transition before 4 unless the context is exceptionally rich.
After 7, proceed with a lighter draft unless essential goal information is absent.
Return JSON only with:
- reply: brief chief-of-staff response and next question, or transition statement
- ready: boolean
- facts: merged factual summary with keys ambition, why, success, horizon, obstacles, strengths (array),
  development_needs (array), tasks (array), habits (array), leadership_context
- missing: array of important missing areas
- readiness: object with goal, leadership, tasks, habits scores from 0 to 1
Do not expose scores. When ready, reply: "I think I understand enough to build a strong first draft."
Valid Dojo domains later are: {', '.join(domain_names)}."""
    return _json_completion(system, {"history": history[-16:], "known_facts": facts, "user_message_count": message_count})


def _generate_proposal(history: list[dict], facts: dict) -> dict:
    system = """Create the first draft of a Leadership Operating System from a coaching conversation.
Stay faithful to the user. Return JSON only. Required shape:
{
 "goal":{"title":"", "description":"", "why":"", "horizon":""},
 "pillars":[{"title":"", "description":"", "outcomes":[{"title":"","description":""}]}],
 "profile":{"strengths":[""],"development_needs":[""],"synthesis":"","focus":""},
 "tasks":[{"title":"","description":"","priority":"High|Medium","pillar_index":0}],
 "habits":[{"title":"","frequency":"daily|weekdays","why":""}],
 "dojo":{"domains":[""],"message":""}
}
Generate 2-3 distinct pillars, 2-3 result-oriented outcomes per pillar, 3-5 curated immediate tasks,
and only 2-3 observable sustainable habits. Pillars must be a comprehensive path to the user's vision, not a
diagnosis of weaknesses or a remedial development plan. Make each pillar feel like a constructive workstream
that could stand on its own as "not wrong" for the ambition: for example, a software vision might become
"Build the prototype", "Engage users", and "Build the team". Prefer concrete nouns and outcomes over
personality traits or gaps.

Use these archetypes as reference patterns, then customize to the user's actual goal:
- Build & Scale a Corporate Business: define a winning strategy and clear business priorities; build the
  organization needed to execute successfully; deliver sustainable business results and continuously adapt.
- Build a Startup: build a product that solves a real customer problem; find a repeatable and scalable growth
  engine; build the team, culture, and operations to scale sustainably.
- Career Advancement: define a compelling value proposition aligned with promotion criteria; build sponsorship
  with key decision makers and execute an influence plan; deliver measurable impact that demonstrates readiness
  for the next role.
- Athletic Achievement: develop and execute a structured training plan; optimize nutrition, recovery, and body
  composition; continuously improve through learning, measurement, and coaching.
- Financial Freedom: increase income and earning potential; build and grow long-term wealth through disciplined
  investing; manage spending, risk, and financial decisions intentionally.

Prefer user-mentioned actions. Dojo domains must be 1-2 of:
Vision & Goals, People, Prioritize & Execute, Learning & Development, Time & Energy.
Do not use clinical conclusions. Frame the profile as an initial coaching hypothesis."""
    return _json_completion(system, {"history": history, "facts": facts})


def _validate(proposal: dict) -> None:
    if not proposal.get("goal", {}).get("title"):
        raise ValueError("Generated goal is missing")
    pillars = proposal.get("pillars") or []
    if not 2 <= len(pillars) <= 3 or any(not 2 <= len(item.get("outcomes") or []) <= 3 for item in pillars):
        raise ValueError("Generated goal structure is incomplete")
    if not 1 <= len(proposal.get("tasks") or []) <= 5:
        raise ValueError("Generated tasks are invalid")
    if not 2 <= len(proposal.get("habits") or []) <= 3:
        raise ValueError("Generated habits are invalid")


def _persist(db: Session, user: User, proposal: dict, data: dict) -> dict:
    existing = data.get("result")
    if existing and existing.get("generation_key") == f"user-{user.id}-v{FLOW_VERSION}":
        return existing

    goal_spec = proposal["goal"]
    vision = JourneyGoal(user_number=user.phone_number, title=goal_spec["title"][:200],
                         goal_text=goal_spec.get("description") or goal_spec["title"], why=goal_spec.get("why"),
                         time_horizon="vision", sort_order=0)
    db.add(vision); db.flush()
    pillar_ids = []
    outcome_ids = []
    for p_index, pillar_spec in enumerate(proposal["pillars"]):
        pillar = JourneyGoal(user_number=user.phone_number, title=pillar_spec["title"][:200],
                             goal_text=pillar_spec.get("description") or pillar_spec["title"],
                             time_horizon="pillar", parent_goal_id=vision.id, sort_order=p_index)
        db.add(pillar); db.flush(); pillar_ids.append(pillar.id)
        row = []
        for o_index, outcome_spec in enumerate(pillar_spec["outcomes"]):
            outcome = JourneyGoal(user_number=user.phone_number, title=outcome_spec["title"][:200],
                                  goal_text=outcome_spec.get("description") or outcome_spec["title"],
                                  time_horizon="outcome", parent_goal_id=pillar.id, sort_order=o_index)
            db.add(outcome); db.flush(); row.append(outcome.id)
        outcome_ids.append(row)

    profile = proposal.get("profile") or {}
    for item in (profile.get("strengths") or [])[:3]:
        db.add(JourneyStrength(user_number=user.phone_number, title=str(item)[:200], strength=str(item), source="onboarding"))
    for item in (profile.get("development_needs") or [])[:3]:
        db.add(JourneyDevelopmentArea(user_number=user.phone_number, title=str(item)[:200], skill=str(item), source="onboarding"))

    due_today = datetime.combine(today_for_timezone(get_user_timezone(db, user.phone_number)), time.min)
    task_ids = []
    for index, item in enumerate(proposal["tasks"]):
        task = Task(user_number=user.phone_number, title=item["title"], notes=item.get("description") or "Added by Alfred during onboarding",
                    due_date=due_today, priority=item.get("priority") or "High", goal_id=vision.id,
                    current_bucket="today", sort_order=index, in_top10=index == 0, top10_position=1 if index == 0 else None)
        db.add(task); db.flush(); task_ids.append(task.id)
    habit_ids = []
    for item in proposal["habits"]:
        frequency = item.get("frequency") if item.get("frequency") in {"daily", "weekdays"} else "daily"
        habit = Habit(user_number=user.phone_number, title=item["title"], goal_id=vision.id, frequency=frequency)
        db.add(habit); db.flush(); habit_ids.append(habit.id)

    mtn_result = {"status": "not_run", "top_mtn_tasks": [], "all_scored_tasks": []}
    try:
        from app.services.priority_llm_service import PriorityLLMService
        from app.services.priority_service import PriorityService

        priority_service = PriorityService(db)
        context, recommendation, scores, tokens_used = priority_service.run_prioritization(
            user_number=user.phone_number,
            llm_service=PriorityLLMService(),
        )
        serialized = priority_service.serialize_recommendation(recommendation, context, scores) if recommendation else None
        mtn_result = {
            "status": "completed" if serialized else "no_open_tasks",
            "context_id": context.id if context else None,
            "recommendation_id": recommendation.id if recommendation else None,
            "tokens_used": tokens_used,
            "top_mtn_tasks": (serialized or {}).get("top_mtn_tasks", []),
            "all_scored_tasks": (serialized or {}).get("all_scored_tasks", []),
            "prioritized_at": (serialized or {}).get("prioritized_at"),
        }
    except Exception:
        logger.exception("Onboarding MTN prioritization failed")
        mtn_result = {"status": "failed", "top_mtn_tasks": [], "all_scored_tasks": []}

    result = {"generation_key": f"user-{user.id}-v{FLOW_VERSION}", "vision_id": vision.id,
              "pillar_ids": pillar_ids, "outcome_ids": outcome_ids, "task_ids": task_ids, "habit_ids": habit_ids,
              "goal": {
                  "title": goal_spec.get("title") or "",
                  "description": goal_spec.get("description") or "",
                  "why": goal_spec.get("why") or "",
                  "horizon": goal_spec.get("horizon") or "",
              },
              "pillars": [
                  {"title": item.get("title") or "", "description": item.get("description") or ""}
                  for item in proposal.get("pillars") or []
              ],
              "mtn": mtn_result,
              "profile": profile, "dojo": proposal.get("dojo") or {}, "reveal_steps": ["my-goals", "todo-list", "my-habits", "my-journey"]}
    data["result"] = result
    data["generated_payload"] = proposal
    return result


def respond(db: Session, user: User, answer: str) -> dict:
    if user.onboarding_completed:
        return get_session(user)
    answer = answer.strip()
    if not answer:
        raise ValueError("Please enter a response.")
    data = _data(user)
    history = list(data["history"])
    history.append({"role": "user", "content": answer})
    count = int(data.get("message_count", 0)) + 1
    try:
        turn = _coach_turn(history, data.get("facts") or {}, count)
    except Exception as exc:
        logger.exception("Onboarding coaching turn failed")
        raise RuntimeError("Alfred could not process that response. Please try again.") from exc
    data["facts"] = turn.get("facts") or data.get("facts") or {}
    data["readiness"] = turn.get("readiness") or {}
    data["message_count"] = count
    reply = turn.get("reply") or "Tell me a little more about what would make the biggest difference."
    if turn.get("ready") and count < 4:
        early_followups = {
            1: "Why does this matter to you, and what would success change?",
            2: "What strengths can you rely on—and where might you need to grow to make this happen?",
            3: "What should you act on now, and what would you need to do consistently?",
        }
        reply = early_followups.get(count, reply)
    history.append({"role": "assistant", "content": reply})
    data["history"] = history

    # Preserve a real coaching exchange even if the model believes a very rich
    # opening answer is technically sufficient.
    ready = bool(turn.get("ready")) and count >= 4
    if not ready:
        user.onboarding_data = data
        db.commit()
        return get_session(user)

    data["status"] = "generating"
    user.onboarding_data = data
    db.commit()
    try:
        proposal = _generate_proposal(history, data["facts"])
        _validate(proposal)
        result = _persist(db, user, proposal, data)
        data["status"] = "reveal_pending"
        data["completed_at"] = datetime.utcnow().isoformat()
        history.append({"role": "assistant", "content": "Based on what you shared, I’ve prepared a strong first draft. Let me show you what I built and where I think we should focus first."})
        data["history"] = history
        user.onboarding_data = data
        user.onboarding_completed = True
        user.onboarding_step = OnboardingStep.COMPLETED
        db.commit()
        write_audit_log(db, user_id=user.id, event_type="onboarding_completed", object_type="user", object_id=user.id,
                        metadata={"flow_version": FLOW_VERSION, "vision_id": result["vision_id"]})
    except Exception as exc:
        db.rollback()
        logger.exception("Leadership OS generation failed")
        data["status"] = "failed"
        history.append({"role": "assistant", "content": "I wasn’t able to complete your first draft just yet. Our conversation is saved, so we can try again without starting over."})
        data["history"] = history
        user.onboarding_data = data
        db.commit()
        raise RuntimeError("I saved our conversation, but could not build your first draft yet. Please try again.") from exc
    return get_session(user)
