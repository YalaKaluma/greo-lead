import streamlit as st
from sqlalchemy.orm import Session
from app.db import SessionLocal
from app.models import Task
from datetime import datetime
from app.db import engine, Base
from datetime import date


# Make sure tables exist
Base.metadata.create_all(bind=engine)

USER = "whatsapp:+17707789240"

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def add_task(title, notes, due_date, deadline, priority):
    db = next(get_db())
    new_task = Task(
        title=title,
        notes=notes,
        due_date=due_date,
        deadline=deadline,
        priority=priority,
        user_number=USER,
        status="open",
        created_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(new_task)
    db.commit()

def load_tasks():
    db = next(get_db())
    tasks = db.query(Task).filter(Task.user_number == USER).order_by(Task.created_at.desc()).all()
    return tasks

def update_status(task_id, status):
    db = next(get_db())
    task = db.query(Task).get(task_id)
    if task:
        task.status = status
        task.updated_at = datetime.now()
        db.commit()

# ----------------- UI -----------------
st.title("Executive Accelerator To-Do List")

# --- Input fields
st.subheader("Add New Task")

col1, col2, col3, col4, col5, col6 = st.columns([2, 2, 2, 2, 2, 1])
with col1:
    title = st.text_input("Title", key="title_input")
with col2:
    notes = st.text_input("Notes", key="notes_input")
with col3:
    due_date = st.date_input("Due Date", key="due_input")
with col4:
    deadline = st.date_input("Deadline", key="deadline_input")
with col5:
    priority = st.selectbox("Priority", ["High", "Medium", "Low"], key="prio_input")
with col6:
    if st.button("Add"):
        add_task(title, notes, due_date, deadline, priority)
        st.success("Task added!")
        st.rerun()

# --- Display tasks
st.subheader("Your Tasks")
header_cols = st.columns([0.7, 2, 2, 2, 2, 1])
header_cols[0].markdown("**✓**")
header_cols[1].markdown("**Title**")
header_cols[2].markdown("**Due Date**")
header_cols[3].markdown("**Deadline**")
header_cols[4].markdown("**Priority**")
header_cols[5].markdown("**Status**")

tasks = load_tasks()

def fmt_date(date): return date.strftime('%Y-%m-%d') if date else "-"
def strike(text): return f"~~{text}~~" if checked else text

for task in tasks:
    task_cols = st.columns([0.7, 2, 2, 2, 2, 1])
    checked = task.status == "completed"
    new_checked = task_cols[0].checkbox("", value=checked, key=f"chk_{task.id}")

    def strike(text): return f"~~{text}~~" if checked else text

    task_cols[1].markdown(strike(task.title or ""))
    task_cols[2].markdown(strike(fmt_date(task.due_date)))
    task_cols[3].markdown(strike(fmt_date(task.deadline)))
    task_cols[4].markdown(strike(task.priority or "-"))
    task_cols[5].markdown("Completed" if checked else "Open")

    if new_checked != checked:
        new_status = "completed" if new_checked else "open"
        update_status(task.id, new_status)
        st.rerun()

