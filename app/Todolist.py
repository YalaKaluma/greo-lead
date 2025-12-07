import streamlit as st
from app.db import SessionLocal
from app.models import Todo

USER = "whatsapp:+1111"  # Replace with your user_number if needed

st.title("Executive Accelerator To-Do List")

# ---------------------------------------
# Load tasks from DB
# ---------------------------------------
def load_tasks():
    db = SessionLocal()
    tasks = db.query(Todo).filter(Todo.user_number == USER).all()
    db.close()
    return tasks

# ---------------------------------------
# Update task status
# ---------------------------------------
def update_status(task_id, new_status):
    db = SessionLocal()
    task = db.query(Todo).get(task_id)
    if task:
        task.status = new_status
        db.commit()
    db.close()

# ---------------------------------------
# Add new task
# ---------------------------------------
def add_task(title):
    db = SessionLocal()
    new = Todo(user_number=USER, title=title, status="open")
    db.add(new)
    db.commit()
    db.close()

# ---------------------------------------
# Main UI
# ---------------------------------------
tasks = load_tasks()

new_task = st.text_input("Add a new task")
if st.button("➕ Add"):
    if new_task.strip():
        add_task(new_task)
        st.rerun()

st.subheader("Your Tasks")

for task in tasks:
    col1, col2 = st.columns([0.1, 0.9])

    checked = task.status == "completed"
    new_checked = col1.checkbox("", value=checked, key=f"chk_{task.id}")

    if new_checked != checked:
        new_status = "completed" if new_checked else "open"
        update_status(task.id, new_status)
        st.rerun()

    col2.write(f"**{task.title}**")
