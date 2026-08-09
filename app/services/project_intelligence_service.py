from __future__ import annotations

import json
import logging
import os
import re
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from defusedxml import ElementTree

from openai import OpenAI
from pydantic import BaseModel, ConfigDict, Field

from app.config import OPENAI_API_KEY
from app.db import SessionLocal
from app.models import JourneyProject, ProjectDocument
from app.utils.ai_safety import UNTRUSTED_CONTEXT_POLICY, parse_bounded_json_object, wrap_untrusted_context


logger = logging.getLogger(__name__)
MODEL = os.getenv("PROJECT_INTELLIGENCE_MODEL", "gpt-4o-mini")
MAX_CONTEXT_CHARACTERS = int(os.getenv("PROJECT_DOCUMENT_CONTEXT_CHARACTERS", "120000"))
MAX_EXTRACTED_CHARACTERS = int(os.getenv("PROJECT_DOCUMENT_EXTRACTED_CHARACTERS", "2000000"))
MAX_ARCHIVE_ENTRIES = 1000
MAX_ARCHIVE_UNCOMPRESSED_BYTES = 100 * 1024 * 1024
MAX_PDF_PAGES = 500


class ProjectWorkplanItem(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    workstream: str = Field(default="", max_length=300)
    deliverable: str = Field(default="", max_length=500)
    start: str = Field(default="", max_length=80)
    finish: str = Field(default="", max_length=80)
    due: str = Field(default="", max_length=80)
    owner: str = Field(default="", max_length=200)


class ProjectDeliverable(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(default="", max_length=500)
    owner: str = Field(default="", max_length=200)
    due: str = Field(default="", max_length=80)


class ProjectPerson(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(default="", max_length=200)
    role: str = Field(default="", max_length=300)


class ProjectRisk(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    risk: str = Field(default="", max_length=800)
    impact: str = Field(default="", max_length=300)
    probability: str = Field(default="", max_length=100)
    owner: str = Field(default="", max_length=200)
    status: str = Field(default="", max_length=100)


class ProjectDocumentAnalysis(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    project_summary: str = Field(default="", max_length=5000)
    objective: str = Field(default="", max_length=3000)
    timeline: str = Field(default="", max_length=2000)
    ai_overview: str = Field(default="", max_length=10000)
    workplan: list[ProjectWorkplanItem] = Field(default_factory=list, max_length=200)
    in_scope: list[str] = Field(default_factory=list, max_length=200)
    out_of_scope: list[str] = Field(default_factory=list, max_length=200)
    deliverables: list[ProjectDeliverable] = Field(default_factory=list, max_length=200)
    core_team: list[ProjectPerson] = Field(default_factory=list, max_length=200)
    client_stakeholders: list[ProjectPerson] = Field(default_factory=list, max_length=200)
    risks: list[ProjectRisk] = Field(default_factory=list, max_length=200)


def _xml_text(data: bytes) -> str:
    root = ElementTree.fromstring(data)
    paragraphs = []
    for element in root.iter():
        if element.tag.rsplit("}", 1)[-1] in {"t", "tab", "br"}:
            if element.tag.endswith("}t") and element.text:
                paragraphs.append(element.text)
            elif paragraphs:
                paragraphs.append("\n")
    return " ".join(paragraphs).replace(" \n ", "\n")


def extract_document_text(path: str, filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix in {".txt", ".md", ".csv"}:
        with Path(path).open("rb") as source:
            return source.read(MAX_EXTRACTED_CHARACTERS * 4 + 1).decode("utf-8", errors="replace")[:MAX_EXTRACTED_CHARACTERS]
    if suffix in {".pptx", ".docx"}:
        prefix = "ppt/slides/slide" if suffix == ".pptx" else "word/document.xml"
        with zipfile.ZipFile(path) as archive:
            entries = archive.infolist()
            if len(entries) > MAX_ARCHIVE_ENTRIES:
                raise RuntimeError("Document archive contains too many entries.")
            if sum(entry.file_size for entry in entries) > MAX_ARCHIVE_UNCOMPRESSED_BYTES:
                raise RuntimeError("Document archive expands beyond the processing limit.")
            names = [name for name in archive.namelist() if name.startswith(prefix) and name.endswith(".xml")]
            if suffix == ".pptx":
                names.sort(key=lambda name: int(re.search(r"slide(\d+)\.xml$", name).group(1)))
            extracted = []
            character_count = 0
            for name in names:
                value = _xml_text(archive.read(name))
                extracted.append(value)
                character_count += len(value)
                if character_count >= MAX_EXTRACTED_CHARACTERS:
                    break
            return "\n\n".join(extracted)[:MAX_EXTRACTED_CHARACTERS]
    if suffix == ".pdf":
        try:
            from pypdf import PdfReader
        except ImportError as exc:
            raise RuntimeError("PDF extraction is not available on this deployment. Upload a PPTX, DOCX, or text file.") from exc
        reader = PdfReader(path)
        if len(reader.pages) > MAX_PDF_PAGES:
            raise RuntimeError("PDF has too many pages to process safely.")
        extracted = []
        character_count = 0
        for page in reader.pages:
            value = page.extract_text() or ""
            extracted.append(value)
            character_count += len(value)
            if character_count >= MAX_EXTRACTED_CHARACTERS:
                break
        return "\n\n".join(extracted)[:MAX_EXTRACTED_CHARACTERS]
    raise RuntimeError("Unsupported project document. Upload PPTX, DOCX, PDF, TXT, MD, or CSV.")


def analyze_project_document(text: str, filename: str, project_name: str) -> dict:
    if not OPENAI_API_KEY:
        raise RuntimeError("Alfred AI is not configured on this deployment.")
    response = OpenAI(api_key=OPENAI_API_KEY).chat.completions.create(
        model=MODEL,
        response_format={"type": "json_object"},
        temperature=0.1,
        messages=[
            {"role": "system", "content": (
                "You extract grounded strategic project context from source documents. Return JSON only. "
                "Do not invent facts, owners, dates, stakeholders, risks, or scope. Omit unsupported values. "
                "Keep source wording precise while making the result concise and executive-ready. "
                + UNTRUSTED_CONTEXT_POLICY
            )},
            {"role": "user", "content": (
                wrap_untrusted_context("project_metadata", f"Project: {project_name}\nDocument: {filename}", 2000)
                + "\nReturn this JSON shape: {project_summary:string, objective:string, timeline:string, "
                "ai_overview:string, workplan:[{workstream,deliverable,start,finish,due,owner}], in_scope:[string], "
                "out_of_scope:[string], deliverables:[{name,owner,due}], core_team:[{name,role}], "
                "client_stakeholders:[{name,role}], risks:[{risk,impact,probability,owner,status}]}. "
                "The workplan is the project's integrated timeline and is the highest-priority extraction. "
                "Capture every stated workstream, phase, activity, deliverable, milestone, start, finish, and deadline. "
                "Create separate rows when one workstream contains multiple time-bound activities. Preserve useful "
                "time wording such as exact dates, months, quarters, weeks, or relative timing; never invent a date. "
                "Use due for a specific deadline or milestone and start/finish for the activity window. "
                "Use empty strings or arrays when the document does not support a field. The overview should "
                "explain the initiative, intended outcome, major work, and material constraints in 1-3 paragraphs.\n\n"
                + wrap_untrusted_context("project_document", text, MAX_CONTEXT_CHARACTERS)
            )},
        ],
        max_tokens=3500,
    )
    parsed = parse_bounded_json_object(response.choices[0].message.content, max_characters=120_000)
    return ProjectDocumentAnalysis.model_validate(parsed).model_dump()


def _merge_items(existing, extracted):
    combined = list(existing or [])
    known = {json.dumps(item, sort_keys=True).lower() for item in combined}
    for item in extracted or []:
        key = json.dumps(item, sort_keys=True).lower()
        if key not in known:
            combined.append(item)
            known.add(key)
    return combined


def process_project_document(document_id: int) -> None:
    db = SessionLocal()
    document = None
    try:
        document = db.query(ProjectDocument).filter(ProjectDocument.id == document_id).first()
        if not document:
            return
        document.processing_status = "extracting"
        document.processing_error = None
        db.commit()
        text = extract_document_text(document.storage_key, document.filename).strip()
        if len(text) < 40:
            raise RuntimeError("Alfred could not find enough readable text in this document.")
        document.extracted_character_count = len(text)
        document.processing_status = "analyzing"
        db.commit()
        project = db.query(JourneyProject).filter(JourneyProject.id == document.project_id).first()
        if not project:
            raise RuntimeError("Project no longer exists.")
        analysis = analyze_project_document(text, document.filename, project.project_name)
        if not project.description and analysis.get("project_summary"):
            project.description = analysis["project_summary"]
        if not project.objective and analysis.get("objective"):
            project.objective = analysis["objective"]
            project.goal = analysis["objective"]
        if not project.timeline and analysis.get("timeline"):
            project.timeline = analysis["timeline"]
        if analysis.get("ai_overview"):
            project.ai_overview = analysis["ai_overview"]
        for field in ("workplan", "in_scope", "out_of_scope", "deliverables", "core_team", "client_stakeholders", "risks"):
            setattr(project, field, _merge_items(getattr(project, field), analysis.get(field)))
        project.updated_at = datetime.utcnow()
        document.processing_status = "ready"
        document.processed_at = datetime.now(timezone.utc)
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error("Project document processing failed document_id=%s error_type=%s", document_id, type(exc).__name__)
        if document:
            document = db.query(ProjectDocument).filter(ProjectDocument.id == document_id).first()
            if document:
                document.processing_status = "failed"
                document.processing_error = "Document processing failed. Verify the file format and try again."
                db.commit()
    finally:
        db.close()
