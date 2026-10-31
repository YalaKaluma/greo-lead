"""Commit stage outputs before advancing; retries skip completed stages."""
import hashlib
from datetime import datetime, timezone

from app.models import Meeting
from app.services.meeting_pipeline_state import pipeline, save_pipeline, complete_stage


def prepare(meeting, transcript, context):
    state = pipeline(meeting)
    signature = hashlib.sha256((transcript + "\n" + context).encode()).hexdigest()
    if state.get("input_signature") != signature:
        receipt = dict(meeting.context_receipt or {})
        receipt.pop("partial_resolution", None)
        meeting.context_receipt = receipt
        state["stages"] = {}
        state["input_signature"] = signature
        save_pipeline(meeting, state)


def run_stage(transaction, meeting_id, attempt_id, name, operation, persist=None):
    def load(db):
        meeting = db.get(Meeting, meeting_id)
        if not meeting:
            raise ValueError("Meeting was deleted")
        state = pipeline(meeting)
        saved = state["stages"].get(name)
        if saved and saved.get("status") == "complete":
            return True, saved.get("output")
        state["current_stage"] = name
        state["stages"][name] = {"status": "running", "started_at": datetime.now(timezone.utc).isoformat()}
        save_pipeline(meeting, state)
        return False, None
    done, result = transaction(load, "load_stage_" + name, meeting_id=meeting_id, attempt_id=attempt_id)
    if done:
        return result
    try:
        result = operation()
        def save(db):
            meeting = db.get(Meeting, meeting_id)
            if not meeting:
                raise ValueError("Meeting was deleted")
            if persist:
                persist(db, result)
            complete_stage(meeting, name, result)
            meeting.processing_status = "analyzing"
        transaction(save, "save_stage_" + name, meeting_id=meeting_id, attempt_id=attempt_id)
    except Exception:
        def fail(db):
            meeting = db.get(Meeting, meeting_id)
            if meeting:
                state = pipeline(meeting)
                state["stages"][name] = {"status": "failed"}
                state["current_stage"] = name
                save_pipeline(meeting, state)
        transaction(fail, "fail_stage_" + name, meeting_id=meeting_id, attempt_id=attempt_id)
        raise
    return result
