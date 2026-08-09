from __future__ import annotations

import os
import re
import tempfile
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, selectinload

from app.db import get_db
from app.models import JourneyProject, Meeting, MeetingProjectLink, ProjectDocument, User
from app.services.project_intelligence_service import process_project_document
from app.routers.auth import require_authenticated_user
from app.security_dependencies import authenticated_user_identifier, ensure_user_identity


router = APIRouter()
STORAGE_ROOT = Path(os.getenv("PROJECT_STORAGE_DIR") or Path(tempfile.gettempdir()) / "alfred-projects")
MAX_FILE_BYTES = int(os.getenv("PROJECT_MAX_FILE_BYTES", str(50 * 1024 * 1024)))


class ProjectCreate(BaseModel):
    project_name: str = Field(min_length=1, max_length=240)
    client: Optional[str] = Field(default=None, max_length=240)
    role: Optional[str] = Field(default=None, max_length=240)
    status: str = "active"
    description: Optional[str] = None
    objective: Optional[str] = None


class ProjectUpdate(BaseModel):
    project_name: Optional[str] = Field(default=None, min_length=1, max_length=240)
    client: Optional[str] = None
    role: Optional[str] = None
    status: Optional[str] = None
    description: Optional[str] = None
    objective: Optional[str] = None
    timeline: Optional[str] = None
    ai_overview: Optional[str] = None
    workplan: Optional[list[dict[str, Any]]] = None
    in_scope: Optional[list[str]] = None
    out_of_scope: Optional[list[str]] = None
    deliverables: Optional[list[Any]] = None
    core_team: Optional[list[Any]] = None
    client_stakeholders: Optional[list[Any]] = None
    risks: Optional[list[dict[str, Any]]] = None


def _project_or_404(db: Session, project_id: int, user_number: str) -> JourneyProject:
    project = db.query(JourneyProject).options(selectinload(JourneyProject.documents)).filter(
        JourneyProject.id == project_id, JourneyProject.user_number == user_number
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")
    return project


def _payload(project: JourneyProject, meetings: Optional[list[Meeting]] = None):
    result = {column.name: getattr(project, column.name) for column in JourneyProject.__table__.columns}
    result["documents"] = [{"id": d.id, "filename": d.filename, "content_type": d.content_type, "document_type": d.document_type, "processing_status": d.processing_status, "processing_error": d.processing_error, "created_at": d.created_at} for d in project.documents]
    if meetings is not None:
        result["meetings"] = [{
            "id": meeting.id, "title": meeting.title, "started_at": meeting.started_at,
            "one_line_summary": meeting.one_line_summary, "processing_status": meeting.processing_status,
            "participants": [participant.display_name for participant in meeting.participants],
        } for meeting in meetings]
    return result


@router.get("")
def list_projects(user_number: Optional[str] = None, db: Session = Depends(get_db), current_user: User = Depends(require_authenticated_user)):
    user_number = authenticated_user_identifier(current_user)
    projects = db.query(JourneyProject).options(selectinload(JourneyProject.documents)).filter(JourneyProject.user_number == user_number).order_by(JourneyProject.updated_at.desc()).all()
    return [_payload(project) for project in projects]


@router.post("", status_code=201)
def create_project(payload: ProjectCreate, user_number: Optional[str] = None, db: Session = Depends(get_db), current_user: User = Depends(require_authenticated_user)):
    user_number = authenticated_user_identifier(current_user)
    project = JourneyProject(user_number=user_number, goal=payload.objective, **payload.model_dump())
    db.add(project)
    db.commit()
    db.refresh(project)
    project.documents = []
    return _payload(project)


@router.get("/{project_id}")
def get_project(project_id: int, user_number: Optional[str] = None, db: Session = Depends(get_db), current_user: User = Depends(require_authenticated_user)):
    user_number = authenticated_user_identifier(current_user)
    project = _project_or_404(db, project_id, user_number)
    meetings = db.query(Meeting).options(selectinload(Meeting.participants)).join(MeetingProjectLink).filter(MeetingProjectLink.project_id == project.id, Meeting.user_number == user_number).order_by(Meeting.started_at.desc().nullslast(), Meeting.created_at.desc()).all()
    return _payload(project, meetings)


@router.patch("/{project_id}")
def update_project(project_id: int, payload: ProjectUpdate, user_number: Optional[str] = None, db: Session = Depends(get_db), current_user: User = Depends(require_authenticated_user)):
    user_number = authenticated_user_identifier(current_user)
    project = _project_or_404(db, project_id, user_number)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(project, field, value)
        if field == "objective":
            project.goal = value
    project.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(project)
    return _payload(project)


@router.post("/{project_id}/documents", status_code=201)
async def upload_document(project_id: int, background_tasks: BackgroundTasks, user_number: str = Form(...), document_type: Optional[str] = Form(None), file: UploadFile = File(...), db: Session = Depends(get_db), current_user: User = Depends(require_authenticated_user)):
    ensure_user_identity(current_user, user_number)
    user_number = authenticated_user_identifier(current_user)
    project = _project_or_404(db, project_id, user_number)
    safe_name = re.sub(r"[^A-Za-z0-9._ -]", "_", file.filename or "project-document")[:300]
    user_dir = STORAGE_ROOT / re.sub(r"[^A-Za-z0-9_-]", "_", user_number)[:100] / str(project.id)
    user_dir.mkdir(parents=True, exist_ok=True)
    path = user_dir / f"{uuid.uuid4().hex}-{safe_name}"
    size = 0
    try:
        with path.open("wb") as output:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_FILE_BYTES:
                    raise HTTPException(status_code=413, detail="Project file exceeds the 50 MB limit.")
                output.write(chunk)
    except Exception:
        path.unlink(missing_ok=True)
        raise
    document = ProjectDocument(project_id=project.id, user_number=user_number, filename=safe_name, content_type=file.content_type, storage_key=str(path), document_type=document_type)
    db.add(document)
    db.commit()
    db.refresh(document)
    background_tasks.add_task(process_project_document, document.id)
    return {"id": document.id, "filename": document.filename, "document_type": document.document_type, "processing_status": document.processing_status, "created_at": document.created_at}


@router.post("/{project_id}/documents/{document_id}/retry", status_code=202)
def retry_document(project_id: int, document_id: int, background_tasks: BackgroundTasks, user_number: Optional[str] = None, db: Session = Depends(get_db), current_user: User = Depends(require_authenticated_user)):
    user_number = authenticated_user_identifier(current_user)
    document = db.query(ProjectDocument).filter(ProjectDocument.id == document_id, ProjectDocument.project_id == project_id, ProjectDocument.user_number == user_number).first()
    if not document:
        raise HTTPException(status_code=404, detail="Project document not found.")
    document.processing_status = "queued"
    document.processing_error = None
    db.commit()
    background_tasks.add_task(process_project_document, document.id)
    return {"id": document.id, "processing_status": "queued"}


@router.get("/{project_id}/documents/{document_id}")
def download_document(project_id: int, document_id: int, user_number: Optional[str] = None, db: Session = Depends(get_db), current_user: User = Depends(require_authenticated_user)):
    user_number = authenticated_user_identifier(current_user)
    document = db.query(ProjectDocument).filter(ProjectDocument.id == document_id, ProjectDocument.project_id == project_id, ProjectDocument.user_number == user_number).first()
    if not document or not Path(document.storage_key).is_file():
        raise HTTPException(status_code=404, detail="Project document not found.")
    return FileResponse(document.storage_key, media_type=document.content_type, filename=document.filename)
