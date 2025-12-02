import streamlit as st
import requests

API_URL = "greo-lead-production.up.railway.app"   # adjust if needed
USER = "whatsapp:+1111"             # replace with your number

st.title("📝 GREO To-Do List")

# ---------------------------------------
# Load tasks
# ---------------------------------------
def load_tasks():
    res = requests.get(f"{API_URL}/tasks", params={"user_number": USER})
    if res.status_code != 200:
        st.error("Could not load tasks.")
        return []
    return res.json()

tasks = load_tasks()

# ---------------------------------------
# Add Task
# ---------------------------------------
new_task = st.text_input("Add a new task")
if st.button("➕ Add"):
    if new_task.strip():
        requests.post(f"{API_URL}/tasks", json={
            "user_number": USER,
            "title": new_task
        })
        st.experimental_rerun()

# ---------------------------------------
# List tasks
# ---------------------------------------
st.subheader("Your Tasks")

for task in tasks:
    col1, col2 = st.columns([0.1, 0.9])

    # Task checkbox
    checked = task["status"] == "completed"
    new_status = col1.checkbox("", value=checked, key=f"chk_{task['id']}")

    # If toggled → update backend
    if new_status != checked:
        status = "completed" if new_status else "open"
        requests.patch(f"{API_URL}/tasks/{task['id']}", json={"status": status})
        st.experimental_rerun()

    # Task title
    col2.write(f"**{task['title']}**")

# ---------------------------------------
# Delete button (optional)
# ---------------------------------------
st.subheader("Delete a task")
delete_id = st.number_input("Task ID", min_value=1, step=1)
if st.button("🗑 Delete"):
    requests.delete(f"{API_URL}/tasks/{delete_id}")
    st.experimental_rerun()
