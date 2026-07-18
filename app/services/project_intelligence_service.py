from __future__ import annotations

import json
import logging
import os
import re
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree

from openai import OpenAI

from app.config import OPENAI_API_KEY
from app.db import SessionLocal
from app.models import JourneyProject, ProjectDocument


logger = logging.getLogger(__name__)
MODEL = os.getenv("PROJECT_INTELLIGENCE_MODEL", "gpt-4o-mini")
MAX_CONTEXT_CHARACTERS = int(os.getenv("PROJECT_DOCUMENT_CONTEXT_CHARACTERS", "120000"))


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
        return Path(path).read_text(encoding="utf-8", errors="replace")
    if suffix in {".pptx", ".docx"}:
        prefix = "ppt/slides/slide" if suffix == ".pptx" else "word/document.xml"
        with zipfile.ZipFile(path) as archive:
            names = [name for name in archive.namelist() if name.startswith(prefix) and name.endswith(".xml")]
            if suffix == ".pptx":
                names.sort(key=lambda name: int(re.search(r"slide(\d+)\.xml$", name).group(1)))
            return "\n\n".join(_xml_text(archive.read(name)) for name in names)
    if suffix == ".pdf":
        try:
            from pypdf import PdfReader
        except ImportError as exc:
            raise RuntimeError("PDF extraction is not available on this deployment. Upload a PPTX, DOCX, or text file.") from exc
        return "\n\n".join(page.extract_text() or "" for page in PdfReader(path).pages)
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
                "Keep source wording precise while making the result concise and executive-ready."
            )},
            {"role": "user", "content": (
                f"Project: {project_name}\nDocument: {filename}\n"
                "Return this JSON shape: {project_summary:string, objective:string, timeline:string, "
                "ai_overview:string, workplan:[{workstream,deliverable,owner,due}], in_scope:[string], "
                "out_of_scope:[string], deliverables:[{name,owner,due}], core_team:[{name,role}], "
                "client_stakeholders:[{name,role}], risks:[{risk,impact,probability,owner,status}]}. "
                "Use empty strings or arrays when the document does not support a field. The overview should "
                "explain the initiative, intended outcome, major work, and material constraints in 1-3 paragraphs.\n\n"
                f"DOCUMENT TEXT:\n{text[:MAX_CONTEXT_CHARACTERS]}"
            )},
        ],
    )
    return json.loads(response.choices[0].message.content)


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
        logger.exception("Project document processing failed for document_id=%s", document_id)
        if document:
            document = db.query(ProjectDocument).filter(ProjectDocument.id == document_id).first()
            if document:
                document.processing_status = "failed"
                document.processing_error = str(exc)[:2000]
                db.commit()
    finally:
        db.close()
