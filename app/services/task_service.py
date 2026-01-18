from sqlalchemy.orm import Session
from datetime import datetime
from app.models import Task


def create_task(
    db: Session,
    user_number: str,
    title: str,
    notes: str | None = None,
    goal_id: int | None = None,
    priority: str | None = None,
    due_date=None,
):
    task = Task(
        user_number=user_number,
        title=title,
        notes=notes,
        goal_id=goal_id,
        priority=priority,
        due_date=due_date,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )

    db.add(task)
    db.commit()
    db.refresh(task)

    return task
