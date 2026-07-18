from __future__ import annotations

import os
import re
import tempfile
import uuid
import base64
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload

from app.db import get_db
from app.models import JourneyGoal, JourneyPerson, JourneyProject, Meeting, MeetingActionItem, MeetingAttendee, MeetingContextNote, MeetingGoalLink, MeetingParticipant, MeetingProjectLink, Task, User
from app.services.meeting_intelligence_service import process_meeting
from app.services.journey_support import goal_level_variants, normalize_goal_level
from app.services.timezone_service import get_user_timezone, today_for_timezone

router = APIRouter()
ALLOWED_AUDIO_TYPES = {"audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/mp4", "audio/m4a", "audio/x-m4a", "audio/webm", "video/webm"}
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
    project_id: Optional[int] = None


class MeetingUpdate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=240)
    one_line_summary: Optional[str] = Field(default=None, max_length=1000)
    executive_summary: Optional[str] = Field(default=None, max_length=30000)
    meeting_type: Optional[str] = Field(default=None, max_length=80)
    started_at: Optional[datetime] = None
    user_notes: Optional[str] = Field(default=None, max_length=120000)


class ActionConversion(BaseModel):
    user_number: str
    mode: str


class MeetingLinkCreate(BaseModel):
    user_number: str
    target_id: int


class ParticipantMatch(BaseModel):
    user_number: str
    person_id: Optional[int] = None
    is_current_user: bool = False


class DraftMeetingCreate(BaseModel):
    user_number: str
    consent_acknowledged: bool
    project_id: Optional[int] = None
    started_at: Optional[datetime] = None


class LiveAttendeesUpdate(BaseModel):
    user_number: str
    person_ids: list[int] = Field(default_factory=list, max_length=100)


class ContextNoteCreate(BaseModel):
    user_number: str
    note_text: str = Field(min_length=1, max_length=4000)
    elapsed_seconds: int = Field(default=0, ge=0)


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
        selectinload(Meeting.attendees).selectinload(MeetingAttendee.person),
        selectinload(Meeting.context_notes),
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
        "participants": [{"id": p.id, "display_name": p.display_name, "speaker_label": p.speaker_label, "person_id": p.person_id, "match_status": p.match_status, "is_current_user": p.is_current_user} for p in meeting.participants],
        "action_item_count": len(meeting.action_items),
        "decision_count": len(meeting.decisions),
        "has_recording": bool(meeting.recording_storage_key),
        "created_at": meeting.created_at,
        "updated_at": meeting.updated_at,
        "selected_attendees": [{"id": item.person.id, "title": item.person.name} for item in meeting.attendees if item.person],
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
            "context_notes": [{"id": note.id, "note_text": note.note_text, "elapsed_seconds": note.elapsed_seconds, "created_at": note.created_at} for note in sorted(meeting.context_notes, key=lambda item: (item.elapsed_seconds, item.id))],
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


@router.patch("/{meeting_id:int}")
def update_meeting(meeting_id: int, user_number: str, payload: MeetingUpdate, db: Session = Depends(get_db)):
    meeting = _query(db).filter(Meeting.id == meeting_id, Meeting.user_number == user_number).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found.")
    changes = payload.model_dump(exclude_unset=True)
    if "title" in changes:
        changes["title"] = (changes["title"] or "").strip()
        if not changes["title"]:
            raise HTTPException(status_code=400, detail="Meeting title cannot be empty.")
    for field, value in changes.items():
        setattr(meeting, field, value.strip() if isinstance(value, str) else value)
    meeting.updated_at = datetime.now(timezone.utc)
    db.commit()
    return _meeting_payload(meeting, detail=True)


@router.get("/context/options")
def meeting_context_options(user_number: str, db: Session = Depends(get_db)):
    people = db.query(JourneyPerson).filter(JourneyPerson.user_number == user_number).order_by(JourneyPerson.name).all()
    goals = db.query(JourneyGoal).filter(
        JourneyGoal.user_number == user_number,
        JourneyGoal.time_horizon.in_(goal_level_variants("vision")),
        JourneyGoal.parent_goal_id.is_(None),
    ).order_by(JourneyGoal.sort_order.asc(), JourneyGoal.updated_at.desc()).all()
    projects = db.query(JourneyProject).filter(JourneyProject.user_number == user_number, JourneyProject.status == "active").order_by(JourneyProject.project_name).all()
    user = db.query(User).filter((User.phone_number == user_number) | (User.email == user_number)).first()
    return {
        "current_user": {"title": user.name or "Me"} if user else {"title": "Me"},
        "people": [{"id": item.id, "title": item.name} for item in people],
        "goals": [{"id": item.id, "title": item.title or item.goal_text} for item in goals],
        "projects": [{"id": item.id, "title": item.project_name} for item in projects],
    }


@router.post("/drafts", status_code=201)
def create_recording_draft(payload: DraftMeetingCreate, db: Session = Depends(get_db)):
    if not payload.consent_acknowledged:
        raise HTTPException(status_code=400, detail="Recording consent acknowledgement is required.")
    project = None
    if payload.project_id is not None:
        project = db.query(JourneyProject).filter(
            JourneyProject.id == payload.project_id,
            JourneyProject.user_number == payload.user_number,
        ).first()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found.")
    meeting = Meeting(
        user_number=payload.user_number,
        title="Meeting in progress",
        source_type="recording",
        processing_status="draft",
        started_at=payload.started_at or datetime.now(timezone.utc),
        consent_acknowledged_at=datetime.now(timezone.utc),
    )
    db.add(meeting)
    db.flush()
    if project:
        db.add(MeetingProjectLink(meeting_id=meeting.id, project_id=project.id))
    db.commit()
    return {"id": meeting.id, "processing_status": "draft"}


@router.put("/{meeting_id:int}/live-attendees")
def update_live_attendees(meeting_id: int, payload: LiveAttendeesUpdate, db: Session = Depends(get_db)):
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id, Meeting.user_number == payload.user_number).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found.")
    people = db.query(JourneyPerson).filter(
        JourneyPerson.user_number == payload.user_number,
        JourneyPerson.id.in_(set(payload.person_ids)),
    ).all() if payload.person_ids else []
    if len(people) != len(set(payload.person_ids)):
        raise HTTPException(status_code=400, detail="One or more selected people are invalid.")
    db.query(MeetingAttendee).filter(MeetingAttendee.meeting_id == meeting_id).delete(synchronize_session=False)
    for person in people:
        db.add(MeetingAttendee(meeting_id=meeting_id, person_id=person.id))
    db.commit()
    return {"attendees": [{"id": person.id, "title": person.name} for person in people]}


@router.post("/{meeting_id:int}/context-notes", status_code=201)
def add_live_context_note(meeting_id: int, payload: ContextNoteCreate, db: Session = Depends(get_db)):
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id, Meeting.user_number == payload.user_number).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found.")
    note = MeetingContextNote(
        meeting_id=meeting_id,
        elapsed_seconds=payload.elapsed_seconds,
        note_text=payload.note_text.strip(),
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return {"id": note.id, "note_text": note.note_text, "elapsed_seconds": note.elapsed_seconds, "created_at": note.created_at}


def _find_user(db: Session, user_number: str):
    return db.query(User).filter((User.phone_number == user_number) | (User.email == user_number)).first()


@router.get("/voice-profile")
def get_voice_profile(user_number: str, db: Session = Depends(get_db)):
    user = _find_user(db, user_number)
    if not user:
        raise HTTPException(status_code=404, detail="Current user not found.")
    return {"enrolled": bool(user.voice_reference_data_url), "consented_at": user.voice_reference_consented_at}


@router.post("/voice-profile")
async def enroll_voice_profile(
    user_number: str = Form(...),
    consent_acknowledged: bool = Form(...),
    duration_seconds: float = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    if not consent_acknowledged:
        raise HTTPException(status_code=400, detail="Voice-reference consent is required.")
    if duration_seconds < 2 or duration_seconds > 10:
        raise HTTPException(status_code=400, detail="Record a voice sample between 2 and 10 seconds.")
    content_type = (file.content_type or "").split(";", 1)[0].lower()
    if content_type not in ALLOWED_AUDIO_TYPES:
        raise HTTPException(status_code=415, detail="Unsupported voice sample format.")
    data = await file.read(2 * 1024 * 1024 + 1)
    if not data or len(data) > 2 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Voice sample must be smaller than 2 MB.")
    user = _find_user(db, user_number)
    if not user:
        raise HTTPException(status_code=404, detail="Current user not found.")
    user.voice_reference_data_url = f"data:{content_type};base64,{base64.b64encode(data).decode('ascii')}"
    user.voice_reference_mime_type = content_type
    user.voice_reference_consented_at = datetime.now(timezone.utc)
    db.commit()
    return {"enrolled": True, "consented_at": user.voice_reference_consented_at}


@router.delete("/voice-profile", status_code=204)
def delete_voice_profile(user_number: str, db: Session = Depends(get_db)):
    user = _find_user(db, user_number)
    if not user:
        raise HTTPException(status_code=404, detail="Current user not found.")
    user.voice_reference_data_url = None
    user.voice_reference_mime_type = None
    user.voice_reference_consented_at = None
    db.commit()


@router.patch("/participants/{participant_id}")
def match_participant(participant_id: int, payload: ParticipantMatch, db: Session = Depends(get_db)):
    participant = db.query(MeetingParticipant).join(Meeting).filter(
        MeetingParticipant.id == participant_id,
        Meeting.user_number == payload.user_number,
    ).first()
    if not participant:
        raise HTTPException(status_code=404, detail="Meeting participant not found.")
    if payload.is_current_user:
        user = db.query(User).filter((User.phone_number == payload.user_number) | (User.email == payload.user_number)).first()
        if not user:
            raise HTTPException(status_code=404, detail="Current user not found.")
        participant.person_id = None
        participant.display_name = user.name or "Me"
        participant.match_status = "current_user"
        participant.is_current_user = True
    elif payload.person_id is None:
        participant.person_id = None
        participant.match_status = "unmatched"
        participant.is_current_user = False
    else:
        person = db.query(JourneyPerson).filter(JourneyPerson.id == payload.person_id, JourneyPerson.user_number == payload.user_number).first()
        if not person:
            raise HTTPException(status_code=404, detail="Team member not found.")
        participant.person_id = person.id
        participant.display_name = person.name
        participant.match_status = "confirmed"
        participant.is_current_user = False
    db.commit()
    return {"matched": payload.person_id is not None or payload.is_current_user}


@router.post("/{meeting_id}/goals", status_code=201)
def link_goal(meeting_id: int, payload: MeetingLinkCreate, db: Session = Depends(get_db)):
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id, Meeting.user_number == payload.user_number).first()
    goal = db.query(JourneyGoal).filter(JourneyGoal.id == payload.target_id, JourneyGoal.user_number == payload.user_number).first()
    if not meeting or not goal:
        raise HTTPException(status_code=404, detail="Meeting or goal not found.")
    if normalize_goal_level(goal.time_horizon) != "vision" or goal.parent_goal_id is not None:
        raise HTTPException(status_code=400, detail="Meetings can only be linked to top-level visions.")
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
    project = None
    if payload.project_id is not None:
        project = db.query(JourneyProject).filter(JourneyProject.id == payload.project_id, JourneyProject.user_number == payload.user_number).first()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found.")
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
    if project:
        db.add(MeetingProjectLink(meeting_id=meeting.id, project_id=project.id))
        db.commit()
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
    project_id: Optional[int] = Form(None),
    meeting_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
):
    project = None
    if project_id is not None:
        project = db.query(JourneyProject).filter(JourneyProject.id == project_id, JourneyProject.user_number == user_number).first()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found.")
    if not consent_acknowledged:
        raise HTTPException(status_code=400, detail="Recording consent acknowledgement is required.")
    # Browsers commonly include codec parameters, for example
    # "audio/webm;codecs=opus". Validate the base media type while preserving
    # the complete value for playback and transcription metadata.
    safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", file.filename or "meeting-audio")
    file_suffix = Path(safe_name).suffix.lower()
    base_content_type = (file.content_type or "").split(";", 1)[0].strip().lower()
    # Some browsers and operating systems label M4A files as generic binary data.
    # The filename fallback is intentionally limited to M4A rather than accepting
    # arbitrary extensions as audio.
    generic_m4a = file_suffix == ".m4a" and base_content_type in {"", "application/octet-stream", "video/mp4"}
    if base_content_type not in ALLOWED_AUDIO_TYPES and not generic_m4a:
        raise HTTPException(status_code=415, detail="Unsupported audio format. Upload MP3, WAV, M4A, MP4, or WebM audio.")

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

    meeting = None
    if meeting_id is not None:
        meeting = db.query(Meeting).filter(Meeting.id == meeting_id, Meeting.user_number == user_number).first()
        if not meeting:
            storage_path.unlink(missing_ok=True)
            raise HTTPException(status_code=404, detail="Recording draft not found.")
    if meeting is None:
        meeting = Meeting(user_number=user_number)
        db.add(meeting)
    meeting.title = (title or (meeting.title if meeting.title != "Meeting in progress" else None) or Path(safe_name).stem or "Recorded meeting")[:240]
    meeting.source_type = source_type if source_type in {"recording", "upload"} else "upload"
    meeting.processing_status = "queued"
    meeting.processing_error = None
    meeting.started_at = started_at or meeting.started_at or datetime.now(timezone.utc)
    meeting.duration_seconds = duration_seconds
    meeting.recording_filename = safe_name
    meeting.recording_content_type = "audio/mp4" if generic_m4a else file.content_type
    meeting.recording_storage_key = str(storage_path)
    meeting.consent_acknowledged_at = meeting.consent_acknowledged_at or datetime.now(timezone.utc)
    db.commit()
    db.refresh(meeting)
    if project and not db.query(MeetingProjectLink).filter(MeetingProjectLink.meeting_id == meeting.id, MeetingProjectLink.project_id == project.id).first():
        db.add(MeetingProjectLink(meeting_id=meeting.id, project_id=project.id))
        db.commit()
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
    if payload.mode not in {"my_todo", "follow_up"}:
        raise HTTPException(status_code=400, detail="Mode must be my_todo or follow_up.")
    today = today_for_timezone(get_user_timezone(db, payload.user_number))
    today_due = datetime.combine(today, datetime.min.time())
    if action.created_task_id:
        existing_task = db.query(Task).filter(Task.id == action.created_task_id, Task.user_number == payload.user_number).first()
        if existing_task:
            existing_task.scheduled_date = today
            existing_task.due_date = today_due
            db.commit()
            return {"task_id": existing_task.id, "already_created": True}
        action.created_task_id = None
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
        scheduled_date=today,
        due_date=today_due,
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
