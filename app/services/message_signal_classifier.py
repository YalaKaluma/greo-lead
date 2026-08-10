from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any, Optional

from openai import OpenAI
from sqlalchemy.orm import Session

from app.config import OPENAI_API_KEY, OPENAI_MODEL
from app.models import Message, MessageSignalFlag, User
from app.utils.safe_errors import log_failure

logger = logging.getLogger(__name__)

PROMPT_VERSION = "message-signals-v1"
MODEL_VERSION = OPENAI_MODEL
CLASSIFICATION_SIGNAL_TYPES = [
    "vision_depth",
    "values_strengths_energy_reflection",
    "fulfillment_reflection",
    "people_reflection",
    "execution_reflection",
    "energy_awareness",
    "learning_reflection",
    "behavior_change_reflection",
    "self_awareness_reflection",
    "scars_failures_behavior_reflection",
]


def _client() -> OpenAI:
    return OpenAI(api_key=OPENAI_API_KEY)


def _user_for_message(db: Session, message: Message) -> Optional[User]:
    return db.query(User).filter(User.phone_number == message.user_number).first()


def _source_type_for_message(message: Message) -> str:
    message_type = (message.message_type or "").strip().lower()
    if message_type == "journal":
        return "journal"
    if message_type in {
        "coaching",
        "coaching_session",
        "goal_coaching",
        "goal_review",
        "team_coaching",
        "people_review",
        "leadership_coaching",
    }:
        return "coaching_session"
    return "journal" if message.sender == "user" else "chat"


def _parse_json_response(raw_text: str) -> dict[str, Any]:
    cleaned = (raw_text or "").strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    if cleaned.startswith("```"):
        cleaned = cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    return json.loads(cleaned.strip())


def _classifier_prompt(content: str, source_type: str) -> list[dict[str, str]]:
    signal_list = "\n".join(f"- {signal}" for signal in CLASSIFICATION_SIGNAL_TYPES)
    system = f"""You classify Alfred user messages into reusable behavioral evidence signals.

Return structured JSON only. Do not include markdown. Do not include hidden chain-of-thought.

Evaluate whether the user's message contains meaningful reflective evidence for each signal:
{signal_list}

Definitions:
- vision_depth: concrete reflection about vision, direction, purpose, values, strengths, or aligned motivation.
- values_strengths_energy_reflection: connects values, strengths, or vision to energy, fulfillment, motivation, or a real day.
- fulfillment_reflection: reflects on fulfillment, meaning, purpose, or what feels deeply worthwhile.
- people_reflection: reflects on communication, leadership impact, trust, empathy, delegation, feedback, or how behavior affects others.
- execution_reflection: reflects on prioritization, procrastination, discipline, focus, reactive work, or execution patterns.
- energy_awareness: identifies energy level, energy drivers, energy drains, stress, recovery, or sustainable capacity with some specificity.
- learning_reflection: reflects on growth, development, failure, resilience, limiting beliefs, or lessons learned.
- behavior_change_reflection: connects patterns, reactions, beliefs, or growth experiments to behavior change.
- self_awareness_reflection: shows honest self-observation about motives, triggers, patterns, reactions, or beliefs.
- scars_failures_behavior_reflection: connects scars, failures, setbacks, or past pain to current behavior, beliefs, or reactions.

Be conservative:
- is_met=true only when the signal has enough depth to be useful as Journey evidence.
- Shallow mentions are not enough.
- Do not require polished writing.
- Do not judge whether the user is a good leader.
- evidence_excerpt must be a short relevant quote from the user's message.
- reasoning_summary must be short, user-safe, and auditable."""
    user = f"""Source type: {source_type}

Message:
{content}

Return exactly:
{{
  "signals": [
    {{
      "signal_type": "vision_depth",
      "is_met": false,
      "confidence_score": 0.0,
      "evidence_excerpt": "",
      "reasoning_summary": "Short explanation."
    }}
  ]
}}

Include one object for every signal type."""
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def _current_flags_exist(db: Session, message_id: int) -> bool:
    count = (
        db.query(MessageSignalFlag)
        .filter(
            MessageSignalFlag.message_id == message_id,
            MessageSignalFlag.prompt_version == PROMPT_VERSION,
            MessageSignalFlag.model_version == MODEL_VERSION,
        )
        .count()
    )
    return count >= len(CLASSIFICATION_SIGNAL_TYPES)


def classify_message_signals(
    db: Session,
    message_id: int,
    user_id: Optional[int] = None,
    source_type: Optional[str] = None,
    content: Optional[str] = None,
    force: bool = False,
) -> list[MessageSignalFlag]:
    message = db.query(Message).filter(Message.id == message_id).first()
    if not message:
        raise ValueError(f"Message {message_id} not found")
    if message.sender != "user":
        logger.info("Skipping message signal classification for non-user message %s", message_id)
        return []

    user = _user_for_message(db, message)
    resolved_user_id = user_id if user_id is not None else (user.id if user else None)
    resolved_source_type = source_type or _source_type_for_message(message)
    resolved_content = content if content is not None else (message.content or "")

    if not force and _current_flags_exist(db, message_id):
        logger.info("Skipping message %s; current signal flags already exist", message_id)
        return (
            db.query(MessageSignalFlag)
            .filter(
                MessageSignalFlag.message_id == message_id,
                MessageSignalFlag.prompt_version == PROMPT_VERSION,
                MessageSignalFlag.model_version == MODEL_VERSION,
            )
            .all()
        )

    logger.info("Classifying message %s for behavioral signal flags", message_id)
    response = _client().chat.completions.create(
        model=MODEL_VERSION,
        messages=_classifier_prompt(resolved_content, resolved_source_type),
        temperature=0,
        max_tokens=1800,
        response_format={"type": "json_object"},
    )
    result = _parse_json_response(response.choices[0].message.content or "{}")
    raw_signals = result.get("signals") or []
    signals_by_type = {
        item.get("signal_type"): item
        for item in raw_signals
        if item.get("signal_type") in CLASSIFICATION_SIGNAL_TYPES
    }

    saved_flags = []
    now = datetime.utcnow()
    for signal_type in CLASSIFICATION_SIGNAL_TYPES:
        item = signals_by_type.get(signal_type) or {}
        existing = (
            db.query(MessageSignalFlag)
            .filter(
                MessageSignalFlag.message_id == message_id,
                MessageSignalFlag.signal_type == signal_type,
                MessageSignalFlag.prompt_version == PROMPT_VERSION,
                MessageSignalFlag.model_version == MODEL_VERSION,
            )
            .first()
        )
        flag = existing or MessageSignalFlag(
            message_id=message_id,
            signal_type=signal_type,
            prompt_version=PROMPT_VERSION,
            model_version=MODEL_VERSION,
            created_at=now,
        )
        flag.user_id = resolved_user_id
        flag.source_type = resolved_source_type
        flag.is_met = bool(item.get("is_met"))
        try:
            flag.confidence_score = max(0.0, min(1.0, float(item.get("confidence_score") or 0.0)))
        except (TypeError, ValueError):
            flag.confidence_score = 0.0
        flag.evidence_excerpt = (item.get("evidence_excerpt") or "")[:500]
        flag.reasoning_summary = (item.get("reasoning_summary") or "")[:500]
        flag.updated_at = now
        if not existing:
            db.add(flag)
        saved_flags.append(flag)

    db.commit()
    for flag in saved_flags:
        db.refresh(flag)
    logger.info("Stored %s signal flags for message %s", len(saved_flags), message_id)
    return saved_flags


def classify_unprocessed_messages(
    db: Session,
    user_id: Optional[int] = None,
    user_number: Optional[str] = None,
    limit: int = 50,
) -> dict[str, Any]:
    query = db.query(Message).filter(Message.sender == "user")
    if user_number:
        query = query.filter(Message.user_number == user_number)
    elif user_id:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return {"processed": 0, "skipped": 0, "failed": 0, "errors": [f"User {user_id} not found"]}
        query = query.filter(Message.user_number == user.phone_number)

    messages = query.order_by(Message.timestamp.desc()).limit(limit).all()
    processed = 0
    skipped = 0
    failed = 0
    errors = []
    for message in messages:
        try:
            if _current_flags_exist(db, message.id):
                skipped += 1
                continue
            classify_message_signals(db, message.id)
            processed += 1
        except Exception as error:
            db.rollback()
            failed += 1
            errors.append({"message_id": message.id, "error": "classification_failed"})
            log_failure("message_signal_backfill", error)

    return {"processed": processed, "skipped": skipped, "failed": failed, "errors": errors}


def get_message_signal_flags(
    db: Session,
    user_number: Optional[str] = None,
    user_id: Optional[int] = None,
    signal_type: Optional[str] = None,
    source_type: Optional[str] = None,
) -> list[MessageSignalFlag]:
    query = db.query(MessageSignalFlag).join(Message, Message.id == MessageSignalFlag.message_id)
    if user_number:
        query = query.filter(Message.user_number == user_number)
    if user_id:
        query = query.filter(MessageSignalFlag.user_id == user_id)
    if signal_type:
        query = query.filter(MessageSignalFlag.signal_type == signal_type)
    if source_type:
        query = query.filter(MessageSignalFlag.source_type == source_type)
    return query.order_by(MessageSignalFlag.updated_at.desc()).all()


def mark_message_for_reclassification(db: Session, message_id: int) -> int:
    deleted = (
        db.query(MessageSignalFlag)
        .filter(
            MessageSignalFlag.message_id == message_id,
            MessageSignalFlag.prompt_version == PROMPT_VERSION,
            MessageSignalFlag.model_version == MODEL_VERSION,
        )
        .delete(synchronize_session=False)
    )
    db.commit()
    logger.info("Marked message %s for reclassification by deleting %s current flags", message_id, deleted)
    return deleted
