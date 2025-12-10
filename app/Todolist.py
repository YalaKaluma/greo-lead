import streamlit as st
from sqlalchemy.orm import Session
from app.db import SessionLocal
from app.models import Task
from datetime import datetime, timedelta, date
from app.db import engine, Base

Base.metadata.create_all(bind=engine)
USER = "whatsapp:+17707789240"


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


PRIORITY_ORDER = {"High": 1, "Medium": 2, "Low": 3}


def load_tasks(filter_type="all"):
    db = next(get_db())
    query = db.query(Task).filter(Task.user_number == USER)
    today = date.today()

    if filter_type == "due_today":
        query = query.filter(Task.due_date <= today)
    elif filter_type == "next_7_days":
        query = query.filter(Task.due_date > today, Task.due_date <= today + timedelta(days=7))

    tasks = query.all()
    # Sort: completed tasks at bottom, then by priority, then by due date
    return sorted(tasks, key=lambda t: (
        1 if t.status == "completed" else 0,  # Completed tasks go to bottom
        PRIORITY_ORDER.get(t.priority or "Medium", 2),  # Then by priority
        t.due_date or date.max  # Then by due date
    ))


def add_task(title, notes, due_date, priority):
    db = next(get_db())
    new_task = Task(
        title=title,
        notes=notes,
        due_date=due_date,
        priority=priority,
        user_number=USER,
        status="open",
        created_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(new_task)
    db.commit()


def update_task(task_id, title, notes, due_date, priority, status):
    db = next(get_db())
    task = db.query(Task).get(task_id)
    if task:
        task.title = title
        task.notes = notes
        task.due_date = due_date
        task.priority = priority
        task.status = status
        task.updated_at = datetime.now()
        db.commit()


def delete_task(task_id):
    db = next(get_db())
    task = db.query(Task).get(task_id)
    if task:
        db.delete(task)
        db.commit()


def move_task(task_id, direction):
    """Move task up or down in the list by swapping display_order"""
    db = next(get_db())
    task = db.query(Task).get(task_id)
    if not task:
        return

    # Get all tasks sorted by current display order
    all_tasks = db.query(Task).filter(Task.user_number == USER).order_by(Task.id).all()

    # Find current position
    current_idx = next((i for i, t in enumerate(all_tasks) if t.id == task_id), None)
    if current_idx is None:
        return

    # Calculate new position
    new_idx = current_idx + direction
    if new_idx < 0 or new_idx >= len(all_tasks):
        return

    # Swap the two tasks' IDs would be complex, so we'll use a simpler approach:
    # We'll update the created_at timestamp to reorder (hacky but works for now)
    if direction == -1:  # Move up
        task.created_at = all_tasks[new_idx].created_at - timedelta(seconds=1)
    else:  # Move down
        task.created_at = all_tasks[new_idx].created_at + timedelta(seconds=1)

    db.commit()


def get_date_badge_color(due_date):
    """Get color for date badge based on urgency"""
    if not due_date:
        return "#gray"

    today = date.today()

    # Convert datetime to date if necessary
    if isinstance(due_date, datetime):
        due_date = due_date.date()

    days_until = (due_date - today).days

    if days_until < 0:
        return "#dc2626"  # Red - overdue
    elif days_until == 0:
        return "#ea580c"  # Orange - due today
    elif days_until <= 3:
        return "#f59e0b"  # Amber - due soon
    else:
        return "#10b981"  # Green - future


def format_date_badge(due_date):
    """Format date in Todoist style"""
    if not due_date:
        return ""

    today = date.today()

    # Convert datetime to date if necessary
    if isinstance(due_date, datetime):
        due_date = due_date.date()

    days_until = (due_date - today).days

    if days_until < 0:
        return f"Overdue {abs(days_until)}d"
    elif days_until == 0:
        return "Today"
    elif days_until == 1:
        return "Tomorrow"
    elif days_until <= 7:
        return due_date.strftime("%A")  # Day name
    else:
        return due_date.strftime("%b %d")  # "Dec 15"


# Improved CSS for tighter, cleaner layout with date badges
st.markdown("""
    <style>
        .stTextInput input, .stDateInput input, .stSelectbox div div {
            padding: 5px 6px;
            font-size: 14px;
            height: 38px;
        }
        .stDateInput > div > div > input {
            height: 38px !important;
        }
        .stSelectbox > div > div {
            height: 38px !important;
        }
        .element-container {
            margin-bottom: 0px !important;
        }
        .block-container {
            padding-top: 1rem;
        }
        .row-widget.stHorizontal {
            gap: 0.5rem;
        }
        hr {
            margin: 0.2rem 0 !important;
        }
        .stButton button {
            padding: 4px 10px;
            font-size: 16px;
            height: 32px;
        }
        .stTextInput label, .stDateInput label, .stSelectbox label {
            font-size: 12px;
            margin-bottom: 2px;
        }
        .stCheckbox {
            margin-top: 20px;
        }
        .task-completed {
            text-decoration: line-through;
            opacity: 0.5;
        }
        .date-badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 500;
            margin-left: 8px;
        }
        .task-number {
            color: #6b7280;
            font-size: 13px;
            font-weight: 500;
        }
        /* Style date picker to look like a badge */
        div[data-testid="stDateInput"] > div > div > input {
            font-size: 11px !important;
            font-weight: 500 !important;
            padding: 2px 8px !important;
            height: 24px !important;
            border-radius: 4px !important;
        }
    </style>
""", unsafe_allow_html=True)

# UI
st.set_page_config(layout="wide")
st.title("Executive To-Do List")

filter_option = st.radio("Filter", ["All", "Due Today", "Next 7 Days"], horizontal=True)
filter_map = {"All": "all", "Due Today": "due_today", "Next 7 Days": "next_7_days"}
tasks = load_tasks(filter_map[filter_option])

# Add task - aligned with task display
st.subheader("Add New Task")

# Use session state to control clearing inputs
if 'clear_inputs' not in st.session_state:
    st.session_state.clear_inputs = False

col_num, col_check, col_priority, col_title, col_project, col_due, col_actions = st.columns(
    [0.3, 0.3, 0.8, 3.5, 1.5, 1.2, 2.2])

with col_num:
    st.write("")  # Empty for alignment
with col_check:
    st.write("")  # Empty for alignment with checkboxes
with col_priority:
    st.write("")  # Spacing for alignment
    priority = st.selectbox("Priority", ["High", "Medium", "Low"], key="new_priority")
with col_title:
    title = st.text_input("Title", key="new_title",
                          value="" if st.session_state.clear_inputs else st.session_state.get("new_title", ""))
with col_project:
    project = st.text_input("Project", key="new_project",
                            value="" if st.session_state.clear_inputs else st.session_state.get("new_project", ""))
with col_due:
    due_date = st.date_input("Due Date", value=date.today(), key="new_due_date")
with col_actions:
    # Add context field in the add section
    col_context, col_add = st.columns([3, 1])
    with col_context:
        notes = st.text_input("Context", key="new_notes",
                              value="" if st.session_state.clear_inputs else st.session_state.get("new_notes", ""))
    with col_add:
        st.write("")  # Spacing
        if st.button("➕ Add", key="add_btn"):
            if title:  # Only add if title is not empty
                add_task(title, notes, due_date, priority)
                st.session_state.clear_inputs = True
                st.rerun()

# Reset clear flag after rerun
if st.session_state.clear_inputs:
    st.session_state.clear_inputs = False

# Task display
st.subheader("Your Tasks")


# Helper function to get priority flag emoji
def get_priority_flag(priority):
    flags = {"High": "🔴", "Medium": "🟠", "Low": "🟢"}
    return flags.get(priority, "🟠")


for idx, task in enumerate(tasks, 1):
    st.markdown("---")

    # Determine if task is completed for styling
    is_completed = task.status == "completed"

    col_num, col_check, col_priority, col_title, col_project, col_due, col_actions = st.columns(
        [0.3, 0.3, 0.8, 3.5, 1.5, 1.2, 2.2])

    with col_num:
        st.markdown(f"<div class='task-number'>{idx}</div>", unsafe_allow_html=True)

    with col_check:
        new_checked = st.checkbox("✓", value=is_completed, key=f"chk_{task.id}", label_visibility="collapsed")
        # If checkbox state changed, update status immediately
        if new_checked != is_completed:
            new_status = "completed" if new_checked else "open"
            update_task(task.id, task.title, task.notes or "", task.due_date, task.priority or "Medium", new_status)
            st.rerun()

    with col_priority:
        priority_input = st.selectbox("Priority", ["High", "Medium", "Low"],
                                      index=["High", "Medium", "Low"].index(task.priority or "Medium"),
                                      key=f"prio_{task.id}", label_visibility="collapsed",
                                      format_func=lambda x: f"{get_priority_flag(x)}")

    with col_title:
        # Just the title input, clean and simple
        title_style = "text-decoration: line-through; opacity: 0.5;" if is_completed else ""
        title_input = st.text_input("Title", value=task.title, key=f"title_{task.id}",
                                    label_visibility="collapsed")

        # Show context in expandable section if magnifier is clicked
        if f"show_context_{task.id}" in st.session_state and st.session_state[f"show_context_{task.id}"]:
            notes_input = st.text_input("Context", value=task.notes or "", key=f"notes_{task.id}",
                                        label_visibility="collapsed", placeholder="Add context...")
        else:
            # Hidden context that maintains state
            notes_input = task.notes or ""

    with col_project:
        project_input = st.text_input("Project", value="", key=f"proj_{task.id}",
                                      label_visibility="collapsed", placeholder="Project")

    with col_due:
        # Date badge with color coding
        date_color = get_date_badge_color(task.due_date)
        date_text = format_date_badge(task.due_date)

        due_date_input = st.date_input("Due", value=task.due_date or date.today(),
                                       key=f"due_{task.id}", label_visibility="collapsed")

    with col_actions:
        action_cols = st.columns([1, 1, 1, 1, 1])

        with action_cols[0]:
            # Magnifier button to show/hide context
            if f"show_context_{task.id}" not in st.session_state:
                st.session_state[f"show_context_{task.id}"] = False

            context_icon = "🔍" if not st.session_state[f"show_context_{task.id}"] else "👁️"
            if st.button(context_icon, key=f"context_{task.id}", help="Show/hide context"):
                st.session_state[f"show_context_{task.id}"] = not st.session_state[f"show_context_{task.id}"]
                st.rerun()

        with action_cols[1]:
            if st.button("⬆️", key=f"up_{task.id}", help="Move up"):
                st.info("Drag-and-drop coming in React version!")

        with action_cols[2]:
            if st.button("⬇️", key=f"down_{task.id}", help="Move down"):
                st.info("Drag-and-drop coming in React version!")

        with action_cols[3]:
            if st.button("💾", key=f"save_{task.id}", help="Save changes"):
                new_status = "completed" if new_checked else "open"
                # Get the notes_input value if context is visible, otherwise use existing
                save_notes = st.session_state.get(f"notes_{task.id}", task.notes or "")
                update_task(task.id, title_input, save_notes, due_date_input, priority_input, new_status)
                st.rerun()

        with action_cols[4]:
            if st.button("❌", key=f"del_{task.id}", help="Delete task"):
                delete_task(task.id)
                st.rerun()