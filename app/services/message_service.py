from sqlalchemy.orm import Session
#from app.models.message import Message
from app.models import Message
from app.services.journal_reflection_depth_service import apply_reflection_depth, apply_reflection_depth_result
from app.services.message_signal_classifier import classify_message_signals
from app.utils.safe_errors import log_failure

def save_message(
    db: Session,
    sender: str,
    user_number: str,
    content: str,
    message_type: str = "chat",
    conversation_type: str | None = None,
    is_read: bool = True,
    reflection_depth_result: dict | None = None
):
    resolved_conversation_type = conversation_type or infer_conversation_type(message_type)
    msg = Message(
        sender=sender,
        user_number=user_number,
        content=content,
        message_type=message_type,
        conversation_type=resolved_conversation_type,
        is_read=is_read
    )

    db.add(msg)
    db.commit()
    db.refresh(msg)

    if sender == "user":
        try:
            if reflection_depth_result:
                apply_reflection_depth_result(msg, reflection_depth_result)
            else:
                apply_reflection_depth(msg, content)
            db.commit()
            db.refresh(msg)
        except Exception as error:
            db.rollback()
            log_failure("message_reflection_scoring", error)

        try:
            classify_message_signals(db, msg.id)
        except Exception as error:
            db.rollback()
            log_failure("message_signal_classification", error)

    return msg

def infer_conversation_type(message_type: str | None) -> str:
    normalized = (message_type or "messages").strip().lower()
    if normalized == "journal":
        return "journal"
    if normalized in {"goal_coaching", "goal_review"}:
        return "goal_coaching"
    if normalized == "leadership_coaching":
        return "leadership_coaching"
    if normalized in {"team_coaching", "people_review"}:
        return "team_coaching"
    return "messages"


def normalize_conversation_type(conversation_type: str | None) -> str | None:
    if not conversation_type:
        return None

    normalized = conversation_type.strip().lower()
    aliases = {
        "goal_review": "goal_coaching",
        "goal": "goal_coaching",
        "people_review": "team_coaching",
        "team": "team_coaching",
        "leadership": "leadership_coaching",
        "message": "messages",
        "notifications": "messages",
        "nudges": "messages",
    }
    return aliases.get(normalized, normalized)


def message_types_for_conversation(conversation_type: str | None) -> list[str] | None:
    normalized = normalize_conversation_type(conversation_type)
    if normalized == "journal":
        return ["journal", "chat"]
    if normalized == "goal_coaching":
        return ["goal_coaching", "goal_review"]
    if normalized == "leadership_coaching":
        return ["leadership_coaching"]
    if normalized == "team_coaching":
        return ["team_coaching", "people_review"]
    if normalized == "messages":
        return ["nudge", "notification"]
    return None


def load_conversation_history(
    db: Session,
    user_number: str,
    conversation_type: str | None = None,
    limit: int | None = None,
):
    query = db.query(Message).filter(Message.user_number == user_number)
    normalized_conversation_type = normalize_conversation_type(conversation_type)
    allowed_message_types = message_types_for_conversation(normalized_conversation_type)

    if normalized_conversation_type:
        query = query.filter(
            (Message.conversation_type == normalized_conversation_type)
            | (Message.message_type.in_(allowed_message_types or []))
        )

    query = query.order_by(Message.timestamp.desc() if limit else Message.timestamp.asc())
    if limit:
        msgs = list(reversed(query.limit(limit).all()))
    else:
        msgs = query.all()

    history = []
    for m in msgs:
        role = "user" if m.sender == "user" else "assistant"
        history.append({"role": role, "content": m.content})

    return history
