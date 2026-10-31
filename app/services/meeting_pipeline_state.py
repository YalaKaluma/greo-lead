"""Durable meeting checkpoints in the existing JSON receipt (no schema change)."""
from copy import deepcopy
from datetime import datetime, timezone

VERSION = 1


def pipeline(meeting):
    return deepcopy((meeting.context_receipt or {}).get("processing_pipeline") or {
        "version": VERSION, "stages": {}, "chunks": {},
    })


def save_pipeline(meeting, state):
    meeting.context_receipt = {**(meeting.context_receipt or {}), "processing_pipeline": state}
    meeting.updated_at = datetime.now(timezone.utc)


def complete_stage(meeting, name, output):
    state = pipeline(meeting)
    state["stages"][name] = {"status": "complete", "output": output,
                              "completed_at": datetime.now(timezone.utc).isoformat()}
    state["current_stage"] = name
    save_pipeline(meeting, state)


def public_progress(meeting):
    state = pipeline(meeting)
    # Never expose prompts, catalogs, or raw provider outputs in progress metadata.
    return {"current_stage": state.get("current_stage"),
            "stages": {key: {k: v for k, v in value.items() if k != "output"}
                       for key, value in state["stages"].items()},
            "completed_chunks": len(state.get("chunks", {})),
            "total_chunks": state.get("chunk_count"),
            "transcript_complete": state.get("transcript_complete", bool(meeting.transcript_text)),
            "speaker_attribution_degraded": state.get("speaker_attribution_degraded", False)}
