# app/utils/task_context.py
from app.models import Task
from app.db import SessionLocal
from datetime import datetime


def get_today_tasks(user_number):
    db = SessionLocal()
    try:
        today = datetime.now().date()
        tasks = db.query(Task).filter(Task.user_number == user_number).all()
        return tasks
    finally:
        db.close()


def format_tasks_for_context(tasks):
    if not tasks:
        return "No active tasks."

    lines = []
    for task in tasks:
        status = "✓" if task.status == "completed" else "❑"
        lines.append(f"{status} {task.title} (Priority: {task.priority or 'N/A'}")

    return "\n".join(lines)
