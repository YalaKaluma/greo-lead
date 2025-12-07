import streamlit as st
from app.db import SessionLocal
from app.models import Task, Base
from app.db import engine
from datetime import datetime

# Create tables if not exist
Base.metadata.create_all(bind=engine)
USER = "whatsapp:+1111"  # Replace with your user_number if needed

st.title("Executive Accelerator To-Do List")

# ---------------------------------------
# Load tasks from DB
# ---------------------------------------
def load_tasks():
    db = SessionLocal()
    tasks = db.query(Task).filter(Task.user_number == USER).all()
    db.close()
    return tasks

# ---------------------------------------
# Update task status
# ---------------------------------------
def update_status(task_id, new_status):
    db = SessionLocal()
    task = db.query(Task).get(task_id)
    if task:
        task.status = new_status
        db.commit()
    db.close()

# ---------------------------------------
# Add new task (with all fields)
# ---------------------------------------
def add_task(title, notes, due_date, deadline, priority):
    db = SessionLocal()
    new = Task(
        user_number=USER,
        title=title,
        notes=notes,
        due_date=due_date,
        deadline=deadline,
        priority=priority,
        status="open",
    )
    db.add(new)
    db.commit()
    db.close()

# ---------------------------------------
# UI - Add new task
# ---------------------------------------
with st.form("add_task_form"):
    st.subheader("➕ Add a New Task")
    title = st.text_input("Task Title")
    notes = st.text_area("Notes")
    due_date = st.date_input("Due Date", value=datetime.today())
    deadline = st.date_input("Deadline (optional)", value=datetime.today())
    priority = st.selectbox("Priority", ["Low", "Medium", "High"])
    submitted = st.form_submit_button("Add Task")

    if submitted:
        if title.strip():
            add_task(title, notes, due_date, deadline, priority)
            st.success("✅ Task added!")
            st.rerun()
        else:
            st.warning("⚠️ Title is required.")

# ---------------------------------------
# UI - Display tasks
# ---------------------------------------
st.subheader("🗂️ Your Tasks")
tasks = load_tasks()

for task in tasks:
    col1, col2 = st.columns([0.1, 0.9])
    checked = task.status == "completed"
    new_checked = col1.checkbox("", value=checked, key=f"chk_{task.id}")

    if new_checked != checked:
        new_status = "completed" if new_checked else "open"
        update_status(task.id, new_status)
        st.rerun()

    col2.markdown(f"**{task.title}**  \n"
                  f"*Priority:* {task.priority}  \n"
                  f"*Due:* {task.due_date}  \n"
                  f"*Deadline:* {task.deadline}  \n"
                  f"*Notes:* {task.notes or '-'}")
