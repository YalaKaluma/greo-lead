from __future__ import annotations

import os
import re
import tempfile
import uuid
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload

from app.db import get_db
from app.models import JourneyGoal, JourneyPerson, JourneyProject, Meeting, MeetingActionItem, MeetingGoalLink, MeetingParticipant, MeetingProjectLink, Task
from app.services.meeting_intelligence_service import process_meeting

router = APIRouter()
ALLOWED_AUDIO_TYPES = {"audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/mp4", "audio/m4a", "audio/webm", "video/webm"}
MAX_AUDIO_BYTES = int(os.getenv("MEETING_MAX_AUDIO_BYTES", str(250 * 1024 * 1024)))
STORAGE_ROOT = Path(
    os.getenv("MEETING_STORAGE_DIR")
    or Path(tempfile.gettempdir()) / "alfred-meetings"
)


class NotesMeetingCreate(BaseModel):
    user_number: str
    notes: str = Field(min_length=1, max_length=120000)
    title: Optional[str] = Field(default=None, max_length=240)
    meeting_type: Optional[str] = Field(default=None, max_length=80)
    started_at: Optional[datetime] = None
    duration_seconds: Optional[int] = Field(default=None, ge=0)


class ActionConversion(BaseModel):
    user_number: str
    mode: str


class MeetingLinkCreate(BaseModel):
    user_number: str
    target_id: int


class ParticipantMatch(BaseModel):
    user_number: str
    person_id: Optional[int] = None


def _query(db: Session):
    return db.query(Meeting).options(
        selectinload(Meeting.participants),
        selectinload(Meeting.topics),
        selectinload(Meeting.decisions),
        selectinload(Meeting.action_items),
        selectinload(Meeting.leadership_observations),
        selectinload(Meeting.transcript_segments),
        selectinload(Meeting.goal_links).selectinload(MeetingGoalLink.goal),
        selectinload(Meeting.project_links).selectinload(MeetingProjectLink.project),
    )


def _meeting_payload(meeting: Meeting, detail: bool = False):
    payload = {
        "id": meeting.id,
        "title": meeting.title,
        "source_type": meeting.source_type,
        "processing_status": meeting.processing_status,
        "processing_error": meeting.processing_error,
        "meeting_type": meeting.meeting_type,
        "started_at": meeting.started_at,
        "duration_seconds": meeting.duration_seconds,
        "one_line_summary": meeting.one_line_summary,
        "executive_summary": meeting.executive_summary,
        "participant_count": len(meeting.participants),
        "participants": [{"id": p.id, "display_name": p.display_name, "speaker_label": p.speaker_label, "person_id": p.person_id, "match_status": p.match_status} for p in meeting.participants],
        "action_item_count": len(meeting.action_items),
        "decision_count": len(meeting.decisions),
        "has_recording": bool(meeting.recording_storage_key),
        "created_at": meeting.created_at,
        "updated_at": meeting.updated_at,
    }
    if detail:
        payload.update({
            "user_notes": meeting.user_notes,
            "transcript_text": meeting.transcript_text,
            "topics": [{"id": t.id, "title": t.title, "summary": t.summary} for t in sorted(meeting.topics, key=lambda item: item.sequence_number)],
            "decisions": [{"id": d.id, "description": d.description, "confidence": d.confidence, "evidence_excerpt": d.evidence_excerpt} for d in meeting.decisions],
            "action_items": [{"id": a.id, "description": a.description, "owner_name": a.owner_name, "due_date": a.due_date, "confidence": a.confidence, "evidence_excerpt": a.evidence_excerpt, "created_task_id": a.created_task_id, "tracking_mode": a.tracking_mode} for a in meeting.action_items],
            "leadership_observations": [{"id": o.id, "category": o.category, "observation": o.observation, "confidence": o.confidence, "evidence_excerpt": o.evidence_excerpt} for o in meeting.leadership_observations],
            "transcript_segments": [{"id": s.id, "sequence_number": s.sequence_number, "speaker_label": s.speaker_label, "start_seconds": s.start_seconds, "end_seconds": s.end_seconds, "text": s.text} for s in sorted(meeting.transcript_segments, key=lambda item: item.sequence_number)],
            "related_goals": [{"id": link.goal.id, "title": link.goal.title or link.goal.goal_text} for link in meeting.goal_links],
            "related_projects": [{"id": link.project.id, "title": link.project.project_name} for link in meeting.project_links],
        })
    return payload


@router.get("")
def list_meetings(
    user_number: str,
    search: Optional[str] = None,
    status: Optional[str] = None,
    meeting_type: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    participant_id: Optional[int] = None,
    goal_id: Optional[int] = None,
    project_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    query = _query(db).filter(Meeting.user_number == user_number)
    if search:
        pattern = f"%{search.strip()}%"
        query = query.filter(or_(Meeting.title.ilike(pattern), Meeting.one_line_summary.ilike(pattern), Meeting.transcript_text.ilike(pattern)))
    if status:
        query = query.filter(Meeting.processing_status == status)
    if meeting_type:
        query = query.filter(Meeting.meeting_type == meeting_type)
    if date_from:
        query = query.filter(Meeting.started_at >= datetime.combine(date_from, datetime.min.time()).replace(tzinfo=timezone.utc))
    if date_to:
        query = query.filter(Meeting.started_at <= datetime.combine(date_to, datetime.max.time()).replace(tzinfo=timezone.utc))
    if participant_id:
        query = query.join(MeetingParticipant).filter(MeetingParticipant.person_id == participant_id)
    if goal_id:
        query = query.join(MeetingGoalLink).filter(MeetingGoalLink.goal_id == goal_id)
    if project_id:
        query = query.join(MeetingProjectLink).filter(MeetingProjectLink.project_id == project_id)
    query = query.distinct()
    meetings = query.order_by(Meeting.started_at.desc().nullslast(), Meeting.created_at.desc()).limit(250).all()
    return [_meeting_payload(meeting) for meeting in meetings]


@router.get("/{meeting_id:int}")
def get_meeting(meeting_id: int, user_number: str, db: Session = Depends(get_db)):
    meeting = _query(db).filter(Meeting.id == meeting_id, Meeting.user_number == user_number).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found.")
    return _meeting_payload(meeting, detail=True)


@router.get("/context/options")
def meeting_context_options(user_number: str, db: Session = Depends(get_db)):
    people = db.query(JourneyPerson).filter(JourneyPerson.user_number == user_number).order_by(JourneyPerson.name).all()
    goals = db.query(JourneyGoal).filter(JourneyGoal.user_number == user_number).order_by(JourneyGoal.updated_at.desc()).all()
    projects = db.query(JourneyProject).filter(JourneyProject.user_number == user_number, JourneyProject.status == "active").order_by(JourneyProject.project_name).all()
    return {
        "people": [{"id": item.id, "title": item.name} for item in people],
        "goals": [{"id": item.id, "title": item.title or item.goal_text} for item in goals],
        "projects": [{"id": item.id, "title": item.project_name} for item in projects],
    }


@router.patch("/participants/{participant_id}")
def match_participant(participant_id: int, payload: ParticipantMatch, db: Session = Depends(get_db)):
    participant = db.query(MeetingParticipant).join(Meeting).filter(
        MeetingParticipant.id == participant_id,
        Meeting.user_number == payload.user_number,
    ).first()
    if not participant:
        raise HTTPException(status_code=404, detail="Meeting participant not found.")
    if payload.person_id is None:
        participant.person_id = None
        participant.match_status = "unmatched"
    else:
        person = db.query(JourneyPerson).filter(JourneyPerson.id == payload.person_id, JourneyPerson.user_number == payload.user_number).first()
        if not person:
            raise HTTPException(status_code=404, detail="Team member not found.")
        participant.person_id = person.id
        participant.display_name = person.name
        participant.match_status = "confirmed"
    db.commit()
    return {"matched": payload.person_id is not None}


@router.post("/{meeting_id}/goals", status_code=201)
def link_goal(meeting_id: int, payload: MeetingLinkCreate, db: Session = Depends(get_db)):
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id, Meeting.user_number == payload.user_number).first()
    goal = db.query(JourneyGoal).filter(JourneyGoal.id == payload.target_id, JourneyGoal.user_number == payload.user_number).first()
    if not meeting or not goal:
        raise HTTPException(status_code=404, detail="Meeting or goal not found.")
    existing = db.query(MeetingGoalLink).filter(MeetingGoalLink.meeting_id == meeting_id, MeetingGoalLink.goal_id == goal.id).first()
    if not existing:
        db.add(MeetingGoalLink(meeting_id=meeting_id, goal_id=goal.id))
        db.commit()
    return {"linked": True}


@router.post("/{meeting_id}/projects", status_code=201)
def link_project(meeting_id: int, payload: MeetingLinkCreate, db: Session = Depends(get_db)):
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id, Meeting.user_number == payload.user_number).first()
    project = db.query(JourneyProject).filter(JourneyProject.id == payload.target_id, JourneyProject.user_number == payload.user_number).first()
    if not meeting or not project:
        raise HTTPException(status_code=404, detail="Meeting or project not found.")
    existing = db.query(MeetingProjectLink).filter(MeetingProjectLink.meeting_id == meeting_id, MeetingProjectLink.project_id == project.id).first()
    if not existing:
        db.add(MeetingProjectLink(meeting_id=meeting_id, project_id=project.id))
        db.commit()
    return {"linked": True}


@router.post("/notes", status_code=202)
def create_notes_meeting(payload: NotesMeetingCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    meeting = Meeting(
        user_number=payload.user_number,
        title=(payload.title or "Meeting notes").strip(),
        source_type="notes",
        processing_status="queued",
        meeting_type=payload.meeting_type,
        started_at=payload.started_at or datetime.now(timezone.utc),
        duration_seconds=payload.duration_seconds,
        user_notes=payload.notes.strip(),
        transcript_text=payload.notes.strip(),
    )
    db.add(meeting)
    db.commit()
    db.refresh(meeting)
    background_tasks.add_task(process_meeting, meeting.id)
    return {"id": meeting.id, "processing_status": meeting.processing_status}


@router.post("/{meeting_id}/retry", status_code=202)
def retry_meeting(meeting_id: int, user_number: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id, Meeting.user_number == user_number).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found.")
    if meeting.processing_status not in {"failed", "queued"}:
        raise HTTPException(status_code=409, detail="Only queued or failed meetings can be retried.")
    meeting.processing_status = "queued"
    meeting.processing_error = None
    db.commit()
    background_tasks.add_task(process_meeting, meeting.id)
    return {"id": meeting.id, "processing_status": "queued"}


@router.post("/upload", status_code=202)
async def upload_meeting(
    background_tasks: BackgroundTasks,
    user_number: str = Form(...),
    consent_acknowledged: bool = Form(...),
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    started_at: Optional[datetime] = Form(None),
    duration_seconds: Optional[int] = Form(None),
    source_type: str = Form("upload"),
    db: Session = Depends(get_db),
):
    if not consent_acknowledged:
        raise HTTPException(status_code=400, detail="Recording consent acknowledgement is required.")
    if file.content_type not in ALLOWED_AUDIO_TYPES:
        raise HTTPException(status_code=415, detail="Unsupported audio format. Upload MP3, WAV, M4A, MP4, or WebM audio.")

    safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", file.filename or "meeting-audio")
    user_dir = STORAGE_ROOT / re.sub(r"[^A-Za-z0-9_-]", "_", user_number)[:100]
    user_dir.mkdir(parents=True, exist_ok=True)
    storage_path = user_dir / f"{uuid.uuid4().hex}-{safe_name}"
    size = 0
    try:
        with storage_path.open("wb") as output:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_AUDIO_BYTES:
                    raise HTTPException(status_code=413, detail="Recording exceeds the upload limit.")
                output.write(chunk)
    except Exception:
        storage_path.unlink(missing_ok=True)
        raise

    meeting = Meeting(
        user_number=user_number,
        title=(title or Path(safe_name).stem or "Recorded meeting")[:240],
        source_type=source_type if source_type in {"recording", "upload"} else "upload",
        processing_status="queued",
        started_at=started_at or datetime.now(timezone.utc),
        duration_seconds=duration_seconds,
        recording_filename=safe_name,
        recording_content_type=file.content_type,
        recording_storage_key=str(storage_path),
        consent_acknowledged_at=datetime.now(timezone.utc),
    )
    db.add(meeting)
    db.commit()
    db.refresh(meeting)
    background_tasks.add_task(process_meeting, meeting.id)
    return {"id": meeting.id, "processing_status": meeting.processing_status}


@router.get("/{meeting_id}/recording")
def get_recording(meeting_id: int, user_number: str, db: Session = Depends(get_db)):
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id, Meeting.user_number == user_number).first()
    if not meeting or not meeting.recording_storage_key or not Path(meeting.recording_storage_key).is_file():
        raise HTTPException(status_code=404, detail="Recording not found.")
    return FileResponse(meeting.recording_storage_key, media_type=meeting.recording_content_type, filename=meeting.recording_filename)


@router.delete("/{meeting_id}/recording", status_code=204)
def delete_recording(meeting_id: int, user_number: str, db: Session = Depends(get_db)):
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id, Meeting.user_number == user_number).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found.")
    if meeting.recording_storage_key:
        Path(meeting.recording_storage_key).unlink(missing_ok=True)
    meeting.recording_storage_key = None
    meeting.recording_filename = None
    meeting.recording_content_type = None
    db.commit()


@router.post("/action-items/{action_item_id}/task", status_code=201)
def convert_action_item(action_item_id: int, payload: ActionConversion, db: Session = Depends(get_db)):
    action = db.query(MeetingActionItem).join(Meeting).filter(
        MeetingActionItem.id == action_item_id,
        Meeting.user_number == payload.user_number,
    ).first()
    if not action:
        raise HTTPException(status_code=404, detail="Action item not found.")
    if action.created_task_id:
        return {"task_id": action.created_task_id, "already_created": True}
    if payload.mode not in {"my_todo", "follow_up"}:
        raise HTTPException(status_code=400, detail="Mode must be my_todo or follow_up.")
    title = action.description
    delegated_to = None
    if payload.mode == "follow_up":
        owner = action.owner_name or "the owner"
        title = f"Follow up with {owner} regarding {action.description}"
        delegated_to = owner
    task = Task(
        user_number=payload.user_number,
        title=title,
        notes=f"Created from meeting: {action.meeting.title}",
        delegated_to=delegated_to,
        due_date=datetime.combine(action.due_date, datetime.min.time()) if action.due_date else None,
        priority="Medium",
        status="open",
    )
    db.add(task)
    db.flush()
    action.created_task_id = task.id
    action.tracking_mode = payload.mode
    db.commit()
    return {"task_id": task.id, "already_created": False}


@router.delete("/{meeting_id:int}", status_code=204)
def delete_meeting(meeting_id: int, user_number: str, db: Session = Depends(get_db)):
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id, Meeting.user_number == user_number).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found.")
    if meeting.recording_storage_key:
        Path(meeting.recording_storage_key).unlink(missing_ok=True)
    db.delete(meeting)
    db.commit()
