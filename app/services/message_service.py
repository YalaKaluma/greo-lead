from sqlalchemy.orm import Session
#from app.models.message import Message
from app.models import Message

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
