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
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session, selectinload

from app.db import get_db
from app.models import JourneyGoal, JourneyPerson, JourneyProject, Meeting, MeetingActionItem, MeetingAttendee, MeetingContextNote, MeetingGoalLink, MeetingParticipant, MeetingProjectLink, Task, User
from app.services.meeting_intelligence_service import answer_meeting_question, process_meeting, reassess_meeting_leadership
from app.services.leadership_trends_service import get_leadership_trends
from app.services.journey_support import goal_level_variants, normalize_goal_level
from app.services.timezone_service import get_user_timezone, today_for_timezone
from app.services.priority_service import PriorityService
from app.services.priority_llm_service import PriorityLLMService
from app.routers.auth import require_authenticated_user
from app.security_dependencies import ensure_user_identity

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
    mode: str = "auto"


class ActionItemUpdate(BaseModel):
    user_number: str
    description: Optional[str] = Field(default=None, min_length=1, max_length=2000)
    notes: Optional[str] = Field(default=None, max_length=30000)
    due_date: Optional[date] = None
    priority: Optional[str] = Field(default=None, max_length=20)
    delegated_to: Optional[str] = Field(default=None, max_length=200)
    goal_id: Optional[int] = None
    ignored: Optional[bool] = None


class MeetingLinkCreate(BaseModel):
    user_number: str
    target_id: int


class ParticipantMatch(BaseModel):
    user_number: str
    person_id: Optional[int] = None
    is_current_user: bool = False


class MeetingChatMessage(BaseModel):
    role: str
    content: str = Field(min_length=1, max_length=4000)


class MeetingQuestion(BaseModel):
    user_number: str
    question: str = Field(min_length=1, max_length=4000)
    history: list[MeetingChatMessage] = Field(default_factory=list, max_length=8)


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
        selectinload(Meeting.leadership_domain_assessments),
        selectinload(Meeting.transcript_segments),
        selectinload(Meeting.goal_links).selectinload(MeetingGoalLink.goal),
        selectinload(Meeting.project_links).selectinload(MeetingProjectLink.project),
        selectinload(Meeting.attendees).selectinload(MeetingAttendee.person),
        selectinload(Meeting.context_notes),
    )


def _participant_key(participant: MeetingParticipant) -> str:
    label = (participant.speaker_label or participant.display_name or "").strip()
    normalized = re.sub(r"^(speaker|participant)\s+", "", label, flags=re.IGNORECASE).strip().lower()
    if participant.is_current_user or participant.match_status == "current_user" or normalized == "me":
        return "current-user"
    if participant.person_id:
        return f"person:{participant.person_id}"
    return f"speaker:{normalized or participant.id}"


def _participant_score(participant: MeetingParticipant) -> tuple:
    label = (participant.speaker_label or "").strip()
    normalized = re.sub(r"^(speaker|participant)\s+", "", label, flags=re.IGNORECASE).strip()
    return (
        1 if participant.is_current_user else 0,
        1 if participant.person_id else 0,
        1 if label.lower() == "me" else 0,
        1 if label == normalized else 0,
        -participant.id,
    )


def _deduplicated_participants(meeting: Meeting) -> list[MeetingParticipant]:
    selected = {}
    for participant in meeting.participants:
        key = _participant_key(participant)
        existing = selected.get(key)
        if existing is None or _participant_score(participant) > _participant_score(existing):
            selected[key] = participant
    return sorted(selected.values(), key=lambda item: item.id)


def _meeting_payload(meeting: Meeting, detail: bool = False):
    participants = _deduplicated_participants(meeting)
    is_processed = meeting.processing_status == "ready" and all(
        action.created_task_id is not None or action.ignored_at is not None
        for action in meeting.action_items
    )
    payload = {
        "id": meeting.id,
        "title": meeting.title,
        "source_type": meeting.source_type,
        "processing_status": meeting.processing_status,
        "status": "processed" if is_processed else meeting.processing_status,
        "is_processed": is_processed,
        "processing_error": meeting.processing_error,
        "meeting_type": meeting.meeting_type,
        "started_at": meeting.started_at,
        "duration_seconds": meeting.duration_seconds,
        "one_line_summary": meeting.one_line_summary,
        "executive_summary": meeting.executive_summary,
        "participant_count": len(participants),
        "participants": [{"id": p.id, "display_name": p.display_name, "speaker_label": p.speaker_label, "person_id": p.person_id, "match_status": p.match_status, "is_current_user": p.is_current_user} for p in participants],
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
            "action_items": [{"id": a.id, "description": a.description, "owner_name": a.owner_name, "due_date": a.due_date, "confidence": a.confidence, "evidence_excerpt": a.evidence_excerpt, "created_task_id": a.created_task_id, "tracking_mode": a.tracking_mode, "ignored": bool(a.ignored_at)} for a in meeting.action_items],
            "leadership_observations": [{"id": o.id, "category": o.category, "observation": o.observation, "confidence": o.confidence, "evidence_excerpt": o.evidence_excerpt} for o in meeting.leadership_observations],
            "leadership_domain_assessments": [{"id": item.id, "domain": item.domain, "score": item.score, "feedback": item.feedback, "evidence_excerpt": item.evidence_excerpt} for item in meeting.leadership_domain_assessments],
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
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=20),
    db: Session = Depends(get_db),
):
    query = _query(db).filter(Meeting.user_number == user_number)
    if search:
        pattern = f"%{search.strip()}%"
        query = query.filter(or_(Meeting.title.ilike(pattern), Meeting.one_line_summary.ilike(pattern), Meeting.transcript_text.ilike(pattern)))
    if status == "processed":
        query = query.filter(
            Meeting.processing_status == "ready",
            ~Meeting.action_items.any(and_(MeetingActionItem.created_task_id.is_(None), MeetingActionItem.ignored_at.is_(None))),
        )
    elif status == "ready":
        query = query.filter(
            Meeting.processing_status == "ready",
            Meeting.action_items.any(and_(MeetingActionItem.created_task_id.is_(None), MeetingActionItem.ignored_at.is_(None))),
        )
    elif status:
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
    total = query.count()
    meetings = query.order_by(Meeting.started_at.desc().nullslast(), Meeting.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {
        "items": [_meeting_payload(meeting) for meeting in meetings],
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }


@router.get("/action-items/tasks")
def list_meeting_action_items(user_number: str, db: Session = Depends(get_db)):
    rows = db.query(MeetingActionItem, Meeting).join(Meeting).filter(
        Meeting.user_number == user_number,
        MeetingActionItem.created_task_id.is_(None),
        MeetingActionItem.ignored_at.is_(None),
    ).order_by(Meeting.started_at.desc().nullslast(), MeetingActionItem.created_at.desc()).limit(500).all()
    return [{
        "id": action.id,
        "description": action.description,
        "meeting_id": meeting.id,
        "meeting_title": meeting.title,
        "owner_name": action.owner_name,
        "notes": action.notes,
        "due_date": action.due_date,
        "priority": action.priority or "Medium",
        "delegated_to": action.delegated_to,
        "goal_id": action.goal_id,
        "created_at": action.created_at,
        "mtn_score": float(action.mtn_score) if action.mtn_score is not None else None,
        "mtn_reason": action.mtn_reason,
        "mtn_risk_if_ignored": action.mtn_risk_if_ignored,
    } for action, meeting in rows]


@router.post("/action-items/tasks/prepare")
def prepare_meeting_action_items(payload: ActionConversion, db: Session = Depends(get_db)):
    """Score pending commitments without turning them into to-do tasks."""
    actions = db.query(MeetingActionItem).join(Meeting).filter(
        Meeting.user_number == payload.user_number,
        MeetingActionItem.created_task_id.is_(None),
        MeetingActionItem.ignored_at.is_(None),
        MeetingActionItem.mtn_score.is_(None),
    ).limit(50).all()
    if not actions:
        return {"scored": 0}

    priority_service = PriorityService(db)
    context = priority_service.create_context_snapshot(payload.user_number)
    temporary_tasks = [Task(
        id=-action.id,
        user_number=payload.user_number,
        title=action.description,
        notes=f"Meeting: {action.meeting.title}\nOwner: {action.owner_name or 'Unclear'}",
        due_date=datetime.combine(action.due_date or today_for_timezone(get_user_timezone(db, payload.user_number)), datetime.min.time()),
        priority=action.priority or "Medium",
        status="open",
        goal_id=action.goal_id,
        delegated_to=action.delegated_to or action.owner_name,
        created_at=action.created_at or datetime.now(timezone.utc),
    ) for action in actions]
    result = PriorityLLMService().score_tasks(temporary_tasks, context)
    score_by_action_id = {-int(item["task_id"]): item for item in result["scores"]}
    scored_at = datetime.now(timezone.utc)
    for action in actions:
        score = score_by_action_id.get(action.id)
        if not score:
            continue
        action.mtn_score = score["top10_likelihood"]
        action.mtn_reason = score.get("primary_reason")
        action.mtn_risk_if_ignored = score.get("risk_if_ignored")
        action.mtn_scored_at = scored_at
    db.commit()
    return {"scored": len(score_by_action_id)}


@router.get("/leadership-trends")
def leadership_trends(user_number: str, days: int = 90, db: Session = Depends(get_db)):
    if days not in {0, 7, 30, 90}:
        raise HTTPException(status_code=400, detail="Days must be 0, 7, 30, or 90")
    return get_leadership_trends(db, user_number, days=days)


@router.post("/leadership-trends/refresh")
def refresh_leadership_trends(user_number: str, days: int = 90, db: Session = Depends(get_db)):
    if days not in {0, 7, 30, 90}:
        raise HTTPException(status_code=400, detail="Days must be 0, 7, 30, or 90")
    return get_leadership_trends(db, user_number, days=days, refresh=True)


@router.patch("/action-items/{action_item_id}")
def update_action_item(action_item_id: int, payload: ActionItemUpdate, db: Session = Depends(get_db)):
    action = db.query(MeetingActionItem).join(Meeting).filter(
        MeetingActionItem.id == action_item_id,
        Meeting.user_number == payload.user_number,
    ).first()
    if not action:
        raise HTTPException(status_code=404, detail="Action item not found.")
    if payload.description is not None:
        action.description = payload.description.strip()
        if action.created_task:
            action.created_task.title = action.description
            action.created_task.updated_at = datetime.now(timezone.utc)
    supplied_fields = payload.model_fields_set
    if "goal_id" in supplied_fields and payload.goal_id is not None:
        goal = db.query(JourneyGoal).filter(
            JourneyGoal.id == payload.goal_id,
            JourneyGoal.user_number == payload.user_number,
        ).first()
        if not goal:
            raise HTTPException(status_code=404, detail="Goal not found.")
    for field in ("notes", "due_date", "priority", "delegated_to", "goal_id"):
        if field not in supplied_fields:
            continue
        value = getattr(payload, field)
        setattr(action, field, value.strip() if isinstance(value, str) else value)
    if "goal_id" in supplied_fields:
        action.goal_override_set = True
    if supplied_fields.intersection({"description", "notes", "due_date", "priority", "delegated_to", "goal_id"}):
        action.mtn_score = None
        action.mtn_reason = None
        action.mtn_risk_if_ignored = None
        action.mtn_scored_at = None
    if payload.ignored is not None:
        action.ignored_at = datetime.now(timezone.utc) if payload.ignored else None
    db.commit()
    return {
        "id": action.id,
        "description": action.description,
        "notes": action.notes,
        "due_date": action.due_date,
        "priority": action.priority or "Medium",
        "delegated_to": action.delegated_to,
        "goal_id": action.goal_id,
        "mtn_score": float(action.mtn_score) if action.mtn_score is not None else None,
        "ignored": bool(action.ignored_at),
    }


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
    current_user: User = Depends(require_authenticated_user),
):
    ensure_user_identity(current_user, user_number)
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
        recognized_self = db.query(MeetingParticipant).filter(
            MeetingParticipant.meeting_id == participant.meeting_id,
            MeetingParticipant.id != participant.id,
            MeetingParticipant.speaker_label.ilike("me"),
            MeetingParticipant.is_current_user.is_(True),
        ).first()
        if recognized_self:
            # Voice recognition is the canonical self record. Removing the later
            # analysis alias avoids showing both "Me" and "Participant B = Me".
            db.delete(participant)
            db.commit()
            return {"matched": True, "merged_into_participant_id": recognized_self.id}
        db.query(MeetingParticipant).filter(
            MeetingParticipant.meeting_id == participant.meeting_id,
            MeetingParticipant.id != participant.id,
            MeetingParticipant.is_current_user.is_(True),
        ).update({"is_current_user": False, "match_status": "unmatched"}, synchronize_session=False)
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


@router.post("/{meeting_id}/leadership-assessment", status_code=202)
def create_leadership_assessment(meeting_id: int, user_number: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id, Meeting.user_number == user_number).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found.")
    if meeting.processing_status != "ready":
        raise HTTPException(status_code=409, detail="The meeting must finish processing before it can be assessed.")
    background_tasks.add_task(reassess_meeting_leadership, meeting.id)
    return {"id": meeting.id, "assessment_status": "queued"}


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
    current_user: User = Depends(require_authenticated_user),
):
    ensure_user_identity(current_user, user_number)
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
    if payload.mode not in {"auto", "my_todo", "follow_up"}:
        raise HTTPException(status_code=400, detail="Mode must be auto, my_todo, or follow_up.")
    today = today_for_timezone(get_user_timezone(db, payload.user_number))
    today_due = datetime.combine(today, datetime.min.time())
    goal_links = db.query(MeetingGoalLink).filter(MeetingGoalLink.meeting_id == action.meeting_id).all()
    project_links = db.query(MeetingProjectLink).filter(MeetingProjectLink.meeting_id == action.meeting_id).all()
    linked_goals = db.query(JourneyGoal).filter(JourneyGoal.id.in_([link.goal_id for link in goal_links])).all() if goal_links else []
    selected_goal = db.query(JourneyGoal).filter(
        JourneyGoal.id == action.goal_id,
        JourneyGoal.user_number == payload.user_number,
    ).first() if action.goal_id else None
    linked_projects = db.query(JourneyProject).filter(JourneyProject.id.in_([link.project_id for link in project_links])).all() if project_links else []
    context_lines = [
        f"Related meeting: {action.meeting.title}",
        f"Meeting date: {(action.meeting.started_at or action.meeting.created_at).date().isoformat()}",
    ]
    if action.meeting.one_line_summary:
        context_lines.append(f"Why this matters: {action.meeting.one_line_summary}")
    if action.evidence_excerpt:
        context_lines.append(f"Meeting context: {action.evidence_excerpt}")
    if linked_goals:
        context_lines.append("Related goal(s): " + ", ".join(goal.title or goal.goal_text for goal in linked_goals))
    if linked_projects:
        context_lines.append("Related project(s): " + ", ".join(project.project_name for project in linked_projects))
    enriched_notes = "\n".join(context_lines)
    if action.created_task_id:
        existing_task = db.query(Task).filter(Task.id == action.created_task_id, Task.user_number == payload.user_number).first()
        if existing_task:
            existing_task.due_date = today_due
            existing_task.notes = enriched_notes
            existing_task.goal_id = linked_goals[0].id if linked_goals else existing_task.goal_id
            existing_task.project = linked_projects[0].project_name if linked_projects else existing_task.project
            db.commit()
            return {"task_id": existing_task.id, "already_created": True}
        action.created_task_id = None
    owner = (action.owner_name or "").strip()
    normalized_owner = re.sub(r"[^a-z0-9]+", " ", owner.lower()).strip()
    unclear_owners = {"", "unclear", "unknown", "not specified", "n a", "none", "tbd"}
    self_names = {"me", "myself", "i", "current user"}
    user = db.query(User).filter(User.phone_number == payload.user_number).first()
    if user and user.name:
        self_names.add(re.sub(r"[^a-z0-9]+", " ", user.name.lower()).strip())
    for participant in action.meeting.participants:
        if participant.is_current_user or participant.match_status == "current_user":
            for label in (participant.display_name, participant.speaker_label):
                if label:
                    self_names.add(re.sub(r"[^a-z0-9]+", " ", label.lower()).strip())

    mode = payload.mode
    if mode == "auto":
        mode = "clarify_owner" if normalized_owner in unclear_owners else ("my_todo" if normalized_owner in self_names else "follow_up")

    title = action.description
    delegated_to = None
    if mode == "follow_up":
        title = f"Follow up with {owner}: {action.description}"
        delegated_to = owner
    elif mode == "clarify_owner":
        title = f"Clarify ownership: {action.description}"
    context_lines.append(f"Original action owner: {owner or 'Unclear'}")
    enriched_notes = "\n".join(context_lines)
    task = Task(
        user_number=payload.user_number,
        title=title,
        notes="\n\n".join(part for part in (action.notes, enriched_notes) if part),
        goal_id=(selected_goal.id if selected_goal else None) if action.goal_override_set else (linked_goals[0].id if linked_goals else None),
        project=linked_projects[0].project_name if linked_projects else None,
        delegated_to=action.delegated_to or delegated_to,
        due_date=datetime.combine(action.due_date, datetime.min.time()) if action.due_date else today_due,
        priority=(action.priority or "Medium").capitalize(),
        status="open",
        move_the_needle_score=action.mtn_score,
        last_prioritized_at=action.mtn_scored_at,
    )
    db.add(task)
    db.flush()
    action.created_task_id = task.id
    action.tracking_mode = mode
    db.commit()
    return {"task_id": task.id, "already_created": False}


@router.post("/action-items/{action_item_id}/complete")
def complete_action_item(action_item_id: int, payload: ActionConversion, db: Session = Depends(get_db)):
    """Create the corresponding to-do and complete it so its MTN counts today."""
    result = convert_action_item(
        action_item_id,
        ActionConversion(user_number=payload.user_number, mode="my_todo"),
        db,
    )
    task = db.query(Task).filter(
        Task.id == result["task_id"],
        Task.user_number == payload.user_number,
    ).first()
    if not task:
        raise HTTPException(status_code=404, detail="Created task not found.")
    completed_at = datetime.now()
    task.status = "completed"
    task.completed_at = completed_at
    task.updated_at = completed_at
    db.commit()
    return {"task_id": task.id, "status": task.status}


@router.post("/{meeting_id:int}/ask")
def ask_about_meeting(meeting_id: int, payload: MeetingQuestion, db: Session = Depends(get_db)):
    meeting = _query(db).filter(
        Meeting.id == meeting_id,
        Meeting.user_number == payload.user_number,
    ).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found.")
    if not (meeting.transcript_text or meeting.user_notes):
        raise HTTPException(status_code=409, detail="This meeting has no transcript or notes yet.")
    context = {
        "title": meeting.title,
        "date": meeting.started_at,
        "summary": meeting.executive_summary,
        "participants": [participant.display_name for participant in meeting.participants],
        "topics": [{"title": topic.title, "summary": topic.summary} for topic in meeting.topics],
        "decisions": [decision.description for decision in meeting.decisions],
        "action_items": [
            {"description": action.description, "owner": action.owner_name, "due_date": action.due_date}
            for action in meeting.action_items
        ],
        "leadership_feedback": [observation.observation for observation in meeting.leadership_observations],
        "context_notes": [note.note_text for note in meeting.context_notes],
        "transcript": meeting.transcript_text or meeting.user_notes,
    }
    answer = answer_meeting_question(
        context,
        payload.question,
        [message.model_dump() for message in payload.history],
    )
    return {"answer": answer}


@router.delete("/{meeting_id:int}", status_code=204)
def delete_meeting(meeting_id: int, user_number: str, db: Session = Depends(get_db)):
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id, Meeting.user_number == user_number).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found.")
    if meeting.recording_storage_key:
        Path(meeting.recording_storage_key).unlink(missing_ok=True)
    db.delete(meeting)
    db.commit()
