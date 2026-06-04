from sqlalchemy.orm import Session
#from app.models.message import Message
from app.models import Message
from app.services.journal_reflection_depth_service import apply_reflection_depth
from app.services.message_signal_classifier import classify_message_signals

def save_message(
    db: Session,
    sender: str,
    user_number: str,
    content: str,
    message_type: str = "chat",
    is_read: bool = True
):
    msg = Message(
        sender=sender,
        user_number=user_number,
        content=content,
        message_type=message_type,
        is_read=is_read
    )

    db.add(msg)
    db.commit()
    db.refresh(msg)

    if sender == "user":
        try:
            apply_reflection_depth(msg, content)
            db.commit()
            db.refresh(msg)
        except Exception as error:
            db.rollback()
            print(f"Reflection depth scoring failed for message {msg.id}: {error}")

        try:
            classify_message_signals(db, msg.id)
        except Exception as error:
            db.rollback()
            print(f"Message signal classification failed for message {msg.id}: {error}")

    return msg

def load_conversation_history(db: Session, user_number: str):
    msgs = (
        db.query(Message)
        .filter(Message.user_number == user_number)
        .order_by(Message.timestamp.asc())
        .all()
    )

    history = []
    for m in msgs:
        role = "user" if m.sender == "user" else "assistant"
        history.append({"role": role, "content": m.content})

    return history
