from __future__ import annotations

import json
import logging
import os
import time
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Callable, TypeVar

from openai import OpenAI
from sqlalchemy.exc import DBAPIError, OperationalError
from sqlalchemy.orm import Session

from app.config import OPENAI_API_KEY
from app.db import SessionLocal
from app.models import (
    Meeting,
    MeetingActionItem,
    MeetingDecision,
    MeetingLeadershipObservation,
    MeetingParticipant,
    MeetingTopic,
    MeetingTranscriptSegment,
)

logger = logging.getLogger(__name__)
client = OpenAI(api_key=OPENAI_API_KEY)
MEETING_PROMPT_VERSION = "meeting-phase1-v1"
MEETING_MODEL = os.getenv("MEETING_INTELLIGENCE_MODEL", "gpt-4o-mini")
DB_WRITE_ATTEMPTS = int(os.getenv("MEETING_DB_WRITE_ATTEMPTS", "3"))
T = TypeVar("T")


def _with_fresh_session(operation: Callable[[Session], T], label: str) -> T:
    """Run one short database transaction, reconnecting after transient failures."""
    last_error = None
    for attempt in range(1, DB_WRITE_ATTEMPTS + 1):
        db = SessionLocal()
        try:
            result = operation(db)
            db.commit()
            return result
        except (OperationalError, DBAPIError) as exc:
            last_error = exc
            db.rollback()
            logger.warning(
                "Meeting database step '%s' lost its connection (attempt %s/%s).",
                label, attempt, DB_WRITE_ATTEMPTS,
            )
            if attempt < DB_WRITE_ATTEMPTS:
                time.sleep(0.5 * (2 ** (attempt - 1)))
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()
    raise last_error


def _safe_confidence(value):
    try:
        return max(0.0, min(float(value), 1.0))
    except (TypeError, ValueError):
        return None


def _safe_date(value):
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def transcribe_recording(path: str, filename: str, content_type: str | None) -> dict:
    with open(path, "rb") as audio_file:
        transcript = client.audio.transcriptions.create(
            model="gpt-4o-transcribe-diarize",
            file=(filename, audio_file, content_type or "application/octet-stream"),
            response_format="diarized_json",
            chunking_strategy="auto",
        )
    segments = [
        {
            "speaker": segment.speaker,
            "start": segment.start,
            "end": segment.end,
            "text": segment.text.strip(),
        }
        for segment in transcript.segments
        if segment.text.strip()
    ]
    speaker_text = "\n".join(f"{segment['speaker']}: {segment['text']}" for segment in segments)
    return {"text": speaker_text or transcript.text.strip(), "segments": segments}


def analyze_transcript(transcript: str, supplied_title: str | None = None) -> dict:
    today = datetime.now(timezone.utc).date().isoformat()
    response = client.chat.completions.create(
        model=MEETING_MODEL,
        response_format={"type": "json_object"},
        temperature=0.2,
        messages=[
            {
                "role": "system",
                "content": (
                    "You extract evidence-backed executive meeting intelligence. Return JSON only. "
                    "Never invent attendees, decisions, deadlines, or evidence. Confidence is 0 to 1. "
                    "Leadership observations must be tentative, useful, non-judgmental, and explicitly "
                    "supported by transcript evidence. Use wording such as 'Based on this meeting...' or "
                    "'Alfred estimates...'. Do not infer conversations that did not occur."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Today is {today}. Supplied title: {supplied_title or 'none'}.\n"
                    "Return this exact JSON shape: {title, meeting_type, one_line_summary, "
                    "executive_summary, participants:[{display_name,speaker_label}], "
                    "topics:[{title,summary}], decisions:[{description,confidence,evidence_excerpt}], "
                    "action_items:[{description,owner_name,due_date,confidence,evidence_excerpt}], "
                    "leadership_observations:[{category,observation,confidence,evidence_excerpt}]}. "
                    "Executive summary should be 3-5 concise paragraphs for substantial transcripts, "
                    "and proportionally shorter for brief notes. Use null for unknown due dates.\n\n"
                    f"TRANSCRIPT OR NOTES:\n{transcript[:120000]}"
                ),
            },
        ],
    )
    return json.loads(response.choices[0].message.content)


def _replace_analysis(db: Session, meeting: Meeting, analysis: dict) -> None:
    meeting.title = (analysis.get("title") or meeting.title or "Untitled meeting")[:240]
    meeting.meeting_type = (analysis.get("meeting_type") or "Other")[:80]
    meeting.one_line_summary = analysis.get("one_line_summary")
    meeting.executive_summary = analysis.get("executive_summary")
    meeting.prompt_version = MEETING_PROMPT_VERSION
    meeting.model_version = MEETING_MODEL

    for participant in analysis.get("participants") or []:
        display_name = str(participant.get("display_name") or participant.get("speaker_label") or "Unknown participant").strip()
        speaker_label = str(participant.get("speaker_label") or display_name).strip()[:80]
        existing = db.query(MeetingParticipant).filter(
            MeetingParticipant.meeting_id == meeting.id,
            MeetingParticipant.speaker_label == speaker_label,
        ).first()
        if existing and display_name != speaker_label:
            existing.display_name = display_name[:200]
        elif display_name and not existing:
            db.add(MeetingParticipant(
                meeting_id=meeting.id,
                display_name=display_name[:200],
                speaker_label=speaker_label,
            ))

    for index, topic in enumerate(analysis.get("topics") or []):
        title = str(topic.get("title") or "").strip()
        if title:
            db.add(MeetingTopic(meeting_id=meeting.id, title=title[:240], summary=topic.get("summary"), sequence_number=index))

    for decision in analysis.get("decisions") or []:
        description = str(decision.get("description") or "").strip()
        if description:
            db.add(MeetingDecision(
                meeting_id=meeting.id,
                description=description,
                confidence=_safe_confidence(decision.get("confidence")),
                evidence_excerpt=decision.get("evidence_excerpt"),
            ))

    for action in analysis.get("action_items") or []:
        description = str(action.get("description") or "").strip()
        if description:
            db.add(MeetingActionItem(
                meeting_id=meeting.id,
                description=description,
                owner_name=(str(action.get("owner_name"))[:200] if action.get("owner_name") else None),
                due_date=_safe_date(action.get("due_date")),
                confidence=_safe_confidence(action.get("confidence")),
                evidence_excerpt=action.get("evidence_excerpt"),
            ))

    for observation in analysis.get("leadership_observations") or []:
        text = str(observation.get("observation") or "").strip()
        if text:
            db.add(MeetingLeadershipObservation(
                meeting_id=meeting.id,
                category=str(observation.get("category") or "Leadership reflection")[:100],
                observation=text,
                confidence=_safe_confidence(observation.get("confidence")),
                evidence_excerpt=observation.get("evidence_excerpt"),
            ))


def process_meeting(meeting_id: int) -> None:
    db = SessionLocal()
    try:
        meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
        if not meeting:
            return
        meeting.processing_status = "transcribing" if meeting.recording_storage_key else "analyzing"
        meeting.processing_error = None
        db.commit()

        if meeting.recording_storage_key:
            transcription = transcribe_recording(
                meeting.recording_storage_key,
                meeting.recording_filename or "meeting-audio",
                meeting.recording_content_type,
            )
            meeting.transcript_text = transcription["text"]
            speaker_labels = set()
            for index, segment in enumerate(transcription["segments"]):
                db.add(MeetingTranscriptSegment(
                    meeting_id=meeting.id,
                    sequence_number=index,
                    speaker_label=segment["speaker"],
                    start_seconds=segment["start"],
                    end_seconds=segment["end"],
                    text=segment["text"],
                ))
                speaker_labels.add(segment["speaker"])
            for speaker_label in sorted(speaker_labels):
                db.add(MeetingParticipant(
                    meeting_id=meeting.id,
                    display_name=speaker_label,
                    speaker_label=speaker_label,
                ))
            meeting.processing_status = "analyzing"
            db.commit()

        transcript = (meeting.transcript_text or meeting.user_notes or "").strip()
        if not transcript:
            raise ValueError("No recording, transcript, or notes were provided.")

        analysis = analyze_transcript(transcript, meeting.title)
        _replace_analysis(db, meeting, analysis)
        meeting.processing_status = "ready"
        meeting.updated_at = datetime.now(timezone.utc)
        db.commit()
    except Exception as exc:
        db.rollback()
        meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
        if meeting:
            meeting.processing_status = "failed"
            meeting.processing_error = str(exc)[:1000]
            db.commit()
        logger.exception("Meeting %s processing failed", meeting_id)
    finally:
        db.close()
