from __future__ import annotations

import json
import logging
import math
import os
import re
import shutil
import subprocess  # nosec B404 - commands are fixed binaries invoked without a shell
import tempfile
import time
import traceback
import uuid
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Callable, TypeVar

from openai import OpenAI
from sqlalchemy.exc import DBAPIError, InterfaceError, OperationalError
from sqlalchemy.orm import Session

from app.config import OPENAI_API_KEY
from app.db import SessionLocal
from app.services.meeting_task_extraction_service import extract_action_items
from app.models import (
    BeltAssessment,
    JournalEntry,
    JourneyBeltTrial,
    JourneyGoal,
    JourneyPerson,
    JourneyProject,
    Meeting,
    MeetingActionItem,
    MeetingAttendee,
    MeetingContextNote,
    MeetingDecision,
    MeetingLeadershipObservation,
    MeetingGoalLink,
    MeetingParticipant,
    MeetingProjectLink,
    MeetingTopic,
    MeetingTranscriptSegment,
    User,
)

logger = logging.getLogger(__name__)
client = OpenAI(api_key=OPENAI_API_KEY)
MEETING_PROMPT_VERSION = "meeting-v4-coaching-links"
MEETING_MODEL = os.getenv("MEETING_INTELLIGENCE_MODEL", "gpt-4o-mini")
MEETING_COACHING_MODEL = os.getenv("MEETING_COACHING_MODEL", MEETING_MODEL)
DB_WRITE_ATTEMPTS = max(1, int(os.getenv("MEETING_DB_WRITE_ATTEMPTS", "3")))
TRANSCRIPTION_CHUNK_SECONDS = min(
    1200, max(300, int(os.getenv("MEETING_TRANSCRIPTION_CHUNK_SECONDS", "1200")))
)
T = TypeVar("T")


class NoIntelligibleSpeechError(ValueError):
    """Raised when a valid audio recording contains no transcribable speech."""


def _meeting_log(
    level: int,
    event: str,
    *,
    meeting_id: int,
    attempt_id: str,
    stage: str,
    **fields,
) -> None:
    """Emit searchable diagnostics without meeting or leadership content."""
    payload = {
        "event": event,
        "meeting_id": meeting_id,
        "attempt_id": attempt_id,
        "stage": stage,
        "deployment_commit": os.getenv("RAILWAY_GIT_COMMIT_SHA") or os.getenv("GIT_COMMIT_SHA") or "unknown",
        **fields,
    }
    logger.log(level, "meeting_processing %s", json.dumps(payload, default=str, sort_keys=True))


def _safe_error_fields(exc: Exception) -> dict:
    """Return diagnostic metadata only; never serialize messages, SQL, or parameters."""
    original = getattr(exc, "orig", None)
    frames = traceback.extract_tb(exc.__traceback__) if exc.__traceback__ else []
    origin = frames[-1] if frames else None
    return {
        "exception_type": type(exc).__name__,
        "original_exception_type": type(original).__name__ if original else None,
        "connection_invalidated": bool(getattr(exc, "connection_invalidated", False)),
        "http_status": getattr(exc, "status_code", None),
        "provider_error_code": getattr(exc, "code", None),
        "sqlstate": getattr(original, "pgcode", None) if original else None,
        "origin_file": Path(origin.filename).name if origin else None,
        "origin_function": origin.name if origin else None,
        "origin_line": origin.lineno if origin else None,
    }


def _is_transient_database_error(exc: DBAPIError) -> bool:
    return (
        isinstance(exc, (OperationalError, InterfaceError))
        or bool(getattr(exc, "connection_invalidated", False))
    )


def _with_fresh_session(
    operation: Callable[[Session], T],
    label: str,
    *,
    meeting_id: int,
    attempt_id: str,
) -> T:
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
            if not _is_transient_database_error(exc):
                try:
                    db.rollback()
                except DBAPIError:
                    pass
                _meeting_log(
                    logging.ERROR,
                    "database_non_retryable",
                    meeting_id=meeting_id,
                    attempt_id=attempt_id,
                    stage=label,
                    **_safe_error_fields(exc),
                )
                raise
            rollback_failed = False
            try:
                db.rollback()
            except DBAPIError:
                rollback_failed = True
            connection_invalidated = False
            try:
                # Ensure the next attempt cannot check the dead SSL connection
                # back into the pool and receive it again.
                db.invalidate()
                connection_invalidated = True
            except (OperationalError, DBAPIError):
                pass
            _meeting_log(
                logging.WARNING,
                "database_retry",
                meeting_id=meeting_id,
                attempt_id=attempt_id,
                stage=label,
                retry_attempt=attempt,
                retry_limit=DB_WRITE_ATTEMPTS,
                rollback_failed=rollback_failed,
                session_invalidated=connection_invalidated,
                **_safe_error_fields(exc),
            )
            if attempt < DB_WRITE_ATTEMPTS:
                time.sleep(0.5 * (2 ** (attempt - 1)))
        except Exception:
            try:
                db.rollback()
            except (OperationalError, DBAPIError):
                try:
                    db.invalidate()
                except (OperationalError, DBAPIError):
                    pass
                _meeting_log(
                    logging.WARNING,
                    "secondary_rollback_failure",
                    meeting_id=meeting_id,
                    attempt_id=attempt_id,
                    stage=label,
                )
            # Preserve the primary operation exception; rollback/cleanup failures
            # are logged separately and must never replace it.
            raise
        finally:
            try:
                # Closing a session normally rolls back any open transaction. A
                # connection that disappeared mid-request can fail during that
                # rollback; cleanup must never override the retry decision above.
                db.close()
            except (OperationalError, DBAPIError):
                _meeting_log(
                    logging.WARNING,
                    "database_cleanup_failure",
                    meeting_id=meeting_id,
                    attempt_id=attempt_id,
                    stage=label,
                    retry_attempt=attempt,
                )
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


def _transcribe_file(path: str, filename: str, content_type: str | None, voice_reference: str | None = None) -> dict:
    with open(path, "rb") as audio_file:
        known_speaker_options = {}
        if voice_reference:
            known_speaker_options = {
                "known_speaker_names": ["Me"],
                "known_speaker_references": [voice_reference],
            }
        transcript = client.audio.transcriptions.create(
            model="gpt-4o-transcribe-diarize",
            file=(filename, audio_file, content_type or "application/octet-stream"),
            response_format="diarized_json",
            chunking_strategy="auto",
            **known_speaker_options,
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


def _audio_duration_seconds(path: str) -> float | None:
    try:
        ffprobe_path = shutil.which("ffprobe")
        if not ffprobe_path:
            raise FileNotFoundError("ffprobe is not installed")
        result = subprocess.run(
            [
                ffprobe_path, "-v", "error", "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1", path,
            ],
            check=True, capture_output=True, text=True, timeout=60,
        )  # nosec B603 - argument list is passed directly with shell=False
        raw_duration = result.stdout.strip()
        if not raw_duration or raw_duration.upper() == "N/A":
            return None
        return float(raw_duration)
    except (FileNotFoundError, subprocess.SubprocessError, ValueError):
        logger.exception("Could not determine duration for meeting audio %s", path)
        return None


def _create_audio_chunk(source_path: str, output_path: str, offset: float, duration: float) -> None:
    ffmpeg_path = shutil.which("ffmpeg")
    if not ffmpeg_path:
        raise RuntimeError("ffmpeg is not installed on this deployment")
    subprocess.run(
        [
            ffmpeg_path, "-hide_banner", "-loglevel", "error", "-y",
            "-ss", str(offset), "-t", str(duration), "-i", source_path,
            "-vn", "-ac", "1", "-ar", "16000", "-codec:a", "libmp3lame",
            "-b:a", "64k", output_path,
        ],
        check=True, capture_output=True, timeout=300,
    )  # nosec B603 - argument list is passed directly with shell=False


def _normalize_audio(source_path: str, output_path: str) -> None:
    """Decode browser/native recordings into a seekable transcription-safe MP3."""
    ffmpeg_path = shutil.which("ffmpeg")
    if not ffmpeg_path:
        raise RuntimeError("ffmpeg is not installed on this deployment")
    subprocess.run(
        [
            ffmpeg_path, "-hide_banner", "-loglevel", "error", "-y",
            "-i", source_path, "-vn", "-ac", "1", "-ar", "16000",
            "-codec:a", "libmp3lame", "-b:a", "64k", output_path,
        ],
        check=True, capture_output=True, timeout=600,
    )  # nosec B603 - argument list is passed directly with shell=False


def transcribe_recording(
    path: str,
    filename: str,
    content_type: str | None,
    voice_reference: str | None = None,
    *,
    meeting_id: int,
    attempt_id: str,
    _already_normalized: bool = False,
) -> dict:
    duration = _audio_duration_seconds(path)
    if duration is None and not _already_normalized:
        _meeting_log(
            logging.WARNING,
            "audio_normalization_started",
            meeting_id=meeting_id,
            attempt_id=attempt_id,
            stage="transcription",
            reason="duration_metadata_unavailable",
        )
        normalization_started = time.monotonic()
        with tempfile.TemporaryDirectory(prefix="alfred-normalized-audio-") as normalization_dir:
            normalized_path = str(Path(normalization_dir) / "normalized-recording.mp3")
            _normalize_audio(path, normalized_path)
            normalized_duration = _audio_duration_seconds(normalized_path)
            _meeting_log(
                logging.INFO,
                "audio_normalization_completed",
                meeting_id=meeting_id,
                attempt_id=attempt_id,
                stage="transcription",
                duration_ms=round((time.monotonic() - normalization_started) * 1000),
                normalized_duration_seconds=(
                    round(normalized_duration, 1) if normalized_duration is not None else None
                ),
            )
            return transcribe_recording(
                normalized_path,
                "normalized-recording.mp3",
                "audio/mpeg",
                voice_reference,
                meeting_id=meeting_id,
                attempt_id=attempt_id,
                _already_normalized=True,
            )
    if duration is None or duration <= TRANSCRIPTION_CHUNK_SECONDS:
        _meeting_log(
            logging.INFO,
            "transcription_plan",
            meeting_id=meeting_id,
            attempt_id=attempt_id,
            stage="transcription",
            duration_seconds=round(duration, 1) if duration is not None else None,
            chunk_count=1,
        )
        return _transcribe_file(path, filename, content_type, voice_reference)

    chunk_count = math.ceil(duration / TRANSCRIPTION_CHUNK_SECONDS)
    _meeting_log(
        logging.INFO,
        "transcription_plan",
        meeting_id=meeting_id,
        attempt_id=attempt_id,
        stage="transcription",
        duration_seconds=round(duration, 1),
        chunk_count=chunk_count,
        maximum_chunk_seconds=TRANSCRIPTION_CHUNK_SECONDS,
    )
    combined_segments = []
    combined_text = []
    with tempfile.TemporaryDirectory(prefix="alfred-meeting-chunks-") as chunk_dir:
        for index in range(chunk_count):
            chunk_started = time.monotonic()
            offset = index * TRANSCRIPTION_CHUNK_SECONDS
            chunk_duration = min(TRANSCRIPTION_CHUNK_SECONDS, duration - offset)
            chunk_path = str(Path(chunk_dir) / f"chunk-{index + 1:03d}.mp3")
            _meeting_log(
                logging.INFO,
                "transcription_chunk_started",
                meeting_id=meeting_id,
                attempt_id=attempt_id,
                stage="transcription",
                chunk_number=index + 1,
                chunk_count=chunk_count,
                chunk_duration_seconds=round(chunk_duration, 1),
            )
            _create_audio_chunk(path, chunk_path, offset, chunk_duration)
            result = _transcribe_file(
                chunk_path, f"{Path(filename).stem}-part-{index + 1}.mp3", "audio/mpeg", voice_reference
            )
            combined_text.append(result["text"])
            for segment in result["segments"]:
                combined_segments.append({
                    **segment,
                    "start": segment["start"] + offset,
                    "end": segment["end"] + offset,
                })
            _meeting_log(
                logging.INFO,
                "transcription_chunk_completed",
                meeting_id=meeting_id,
                attempt_id=attempt_id,
                stage="transcription",
                chunk_number=index + 1,
                chunk_count=chunk_count,
                segment_count=len(result.get("segments") or []),
                duration_ms=round((time.monotonic() - chunk_started) * 1000),
            )
    return {"text": "\n".join(combined_text).strip(), "segments": combined_segments}


def analyze_transcript(
    transcript: str,
    supplied_title: str | None = None,
    supplied_context: str | None = None,
    matching_context: str | None = None,
) -> dict:
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
                    "Do not infer conversations that did not occur. Candidate IDs are opaque identifiers: "
                    "only return an ID present in the supplied candidate catalog. Always generate a concise, "
                    "specific meeting title that names the main subject or outcome of the conversation. The title "
                    "must stand on its own in a meeting history; never return a filename, 'Meeting notes', "
                    "'Recorded meeting', 'Meeting in progress', or 'Untitled meeting'."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Today is {today}. User-supplied title (context only; replace it with a content-based title): {supplied_title or 'none'}.\n"
                    "Return this exact JSON shape: {title, meeting_type, one_line_summary, "
                    "executive_summary, participants:[{display_name,speaker_label}], "
                    "self_speaker_label, self_identification_confidence, "
                    "topics:[{title,summary}], decisions:[{description,confidence,evidence_excerpt}], "
                    "suggested_person_matches:[{speaker_label,person_id,confidence}], "
                    "suggested_goal_ids:[{id,confidence}], suggested_project_ids:[{id,confidence}]}. "
                    "Executive summary should be 3-5 concise paragraphs for substantial transcripts, "
                    "and proportionally shorter for brief notes. Use null for unknown due dates.\n\n"
                    "The user participated in every uploaded meeting. Set self_speaker_label to exactly one "
                    "speaker label that already appears in the transcript. If voice recognition labelled a "
                    "speaker Me, choose Me. Otherwise select the most likely existing speaker using introductions, "
                    "names, roles, supplied attendee/context information, first-person references, and the user's "
                    "supplied meeting context. Never add Me as a separate participant when the transcript only "
                    "contains generic labels such as A and B. Always make a best selection and express uncertainty "
                    "through self_identification_confidence rather than inventing another speaker. Participants must "
                    "contain only distinct speakers that actually appear in the transcript.\n\n"
                    "Suggest people, goals, and projects only when there is meaningful evidence. Prefer no link "
                    "over a weak link. Use confidence of at least 0.75 only for strong matches.\n\n"
                    f"USER-SUPPLIED MEETING CONTEXT (treat as context, not spoken transcript):\n{supplied_context or 'none'}\n\n"
                    f"AVAILABLE LINK TARGETS:\n{matching_context or 'none'}\n\n"
                    f"TRANSCRIPT OR NOTES:\n{transcript[:120000]}"
                ),
            },
        ],
    )
    return json.loads(response.choices[0].message.content)


def analyze_leadership_feedback(
    transcript: str,
    analysis: dict,
    leadership_context: str | None,
) -> dict:
    response = client.chat.completions.create(
        model=MEETING_COACHING_MODEL,
        response_format={"type": "json_object"},
        temperature=0.35,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are Alfred, a rigorous but supportive executive coach. This is a dedicated coaching "
                    "analysis, separate from factual meeting extraction. Focus only on the user's identified "
                    "speaker. Ground every behavioral claim in meeting evidence. Explicitly connect useful "
                    "feedback to the leader's wheel, trials, goals, and recent journal patterns. Never quote "
                    "private journal, assessment, or trial text; paraphrase the relevant pattern. Distinguish "
                    "observation from inference and do not manufacture criticism."
                ),
            },
            {
                "role": "user",
                "content": (
                    "Return JSON only: {leadership_observations:[{category,observation,confidence,"
                    "evidence_excerpt}]}. Produce 5-8 substantive observations when evidence allows, covering: "
                    "What you did well; What could have been stronger; Connection to your leadership context; "
                    "A missed leadership opportunity; and a concrete next-meeting experiment. Explain why each "
                    "point matters for this leader now. Make recommendations behaviorally specific.\n\n"
                    f"MEETING ANALYSIS:\n{json.dumps(analysis, default=str)[:20000]}\n\n"
                    f"PRIVATE LEADERSHIP CONTEXT (paraphrase, never quote):\n{leadership_context or 'none'}\n\n"
                    f"TRANSCRIPT:\n{transcript[:120000]}"
                ),
            },
        ],
    )
    return json.loads(response.choices[0].message.content)


def answer_meeting_question(meeting_context: dict, question: str, history: list[dict] | None = None) -> str:
    safe_history = [
        {"role": item.get("role"), "content": str(item.get("content") or "")[:3000]}
        for item in (history or [])[-8:]
        if item.get("role") in {"user", "assistant"}
    ]
    response = client.chat.completions.create(
        model=MEETING_MODEL,
        temperature=0.2,
        messages=[
            {
                "role": "system",
                "content": (
                    "You answer questions about one meeting using only the supplied meeting record. Be concise "
                    "but useful. Separate explicit facts from reasonable inference, cite speaker names and "
                    "timestamps when available, and say when the meeting does not contain the answer."
                ),
            },
            {
                "role": "user",
                "content": "MEETING RECORD:\n" + json.dumps(meeting_context, default=str)[:120000],
            },
            *safe_history,
            {"role": "user", "content": question[:4000]},
        ],
    )
    return (response.choices[0].message.content or "").strip()


def _replace_analysis(db: Session, meeting: Meeting, analysis: dict) -> None:
    meeting.title = (analysis.get("title") or meeting.title or "Untitled meeting")[:240]
    meeting.meeting_type = (analysis.get("meeting_type") or "Other")[:80]
    meeting.one_line_summary = analysis.get("one_line_summary")
    meeting.executive_summary = analysis.get("executive_summary")
    meeting.prompt_version = MEETING_PROMPT_VERSION[:40]
    meeting.model_version = MEETING_MODEL[:80]

    transcript_labels = {
        str(label).strip()
        for (label,) in db.query(MeetingTranscriptSegment.speaker_label).filter(
            MeetingTranscriptSegment.meeting_id == meeting.id
        ).distinct().all()
        if label and str(label).strip()
    }
    transcript_labels_by_key = {label.casefold(): label for label in transcript_labels}

    for participant in analysis.get("participants") or []:
        display_name = str(participant.get("display_name") or participant.get("speaker_label") or "Unknown participant").strip()
        raw_speaker_label = str(participant.get("speaker_label") or display_name).strip()
        speaker_label = re.sub(
            r"^(speaker|participant)\s+", "", raw_speaker_label, flags=re.IGNORECASE
        ).strip()[:80]
        if speaker_label.lower() == "me":
            speaker_label = "Me"
        canonical_label = transcript_labels_by_key.get(speaker_label.casefold())
        if transcript_labels and canonical_label is None:
            # Analysis may describe a person by name, but participant rows represent
            # diarized speakers. Do not create a phantom speaker outside the transcript.
            continue
        speaker_label = canonical_label or speaker_label
        existing = db.query(MeetingParticipant).filter(
            MeetingParticipant.meeting_id == meeting.id,
            MeetingParticipant.speaker_label.ilike(speaker_label),
        ).first()
        generic_display = re.fullmatch(
            r"(?i)(speaker|participant)\s+[a-z0-9]+", display_name
        ) is not None
        if existing and display_name != speaker_label and not generic_display:
            existing.display_name = display_name[:200]
        elif display_name and not existing:
            db.add(MeetingParticipant(
                meeting_id=meeting.id,
                display_name=display_name[:200],
                speaker_label=speaker_label,
            ))

    self_label = str(analysis.get("self_speaker_label") or "").strip()
    canonical_self_label = transcript_labels_by_key.get(self_label.casefold())
    if not canonical_self_label and "me" in transcript_labels_by_key:
        canonical_self_label = transcript_labels_by_key["me"]
    if canonical_self_label:
        user = db.query(User).filter(
            (User.phone_number == meeting.user_number) | (User.email == meeting.user_number)
        ).first()
        selected_self = db.query(MeetingParticipant).filter(
            MeetingParticipant.meeting_id == meeting.id,
            MeetingParticipant.speaker_label.ilike(canonical_self_label),
        ).first()
        if not selected_self:
            selected_self = MeetingParticipant(
                meeting_id=meeting.id,
                speaker_label=canonical_self_label,
            )
            db.add(selected_self)
        db.query(MeetingParticipant).filter(
            MeetingParticipant.meeting_id == meeting.id,
            MeetingParticipant.speaker_label.not_ilike(canonical_self_label),
        ).update(
            {"is_current_user": False}, synchronize_session=False
        )
        selected_self.display_name = (user.name if user and user.name else "Me")[:200]
        selected_self.person_id = None
        selected_self.match_status = "current_user"
        selected_self.is_current_user = True

        # Remove old analysis-created self aliases. The real diarized speaker row
        # above is now the single canonical representation of the current user.
        stale_self_rows = db.query(MeetingParticipant).filter(
            MeetingParticipant.meeting_id == meeting.id,
            MeetingParticipant.speaker_label.ilike("me"),
            MeetingParticipant.speaker_label.not_ilike(canonical_self_label),
        ).all()
        for stale_self in stale_self_rows:
            db.delete(stale_self)

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

    candidate_people = {
        person.id: person for person in db.query(JourneyPerson).filter(
            JourneyPerson.user_number == meeting.user_number
        ).all()
    }
    for suggestion in analysis.get("suggested_person_matches") or []:
        if _safe_confidence(suggestion.get("confidence")) < 0.75:
            continue
        person = candidate_people.get(suggestion.get("person_id"))
        label = str(suggestion.get("speaker_label") or "").strip()
        participant = db.query(MeetingParticipant).filter(
            MeetingParticipant.meeting_id == meeting.id,
            MeetingParticipant.speaker_label.ilike(label),
            MeetingParticipant.is_current_user.is_(False),
        ).first()
        if person and participant and participant.match_status != "confirmed":
            participant.person_id = person.id
            participant.display_name = person.name[:200]
            participant.match_status = "auto_matched"

    valid_goals = {
        goal.id for goal in db.query(JourneyGoal).filter(
            JourneyGoal.user_number == meeting.user_number,
            JourneyGoal.parent_goal_id.is_(None),
        ).all()
    }
    valid_projects = {
        project.id for project in db.query(JourneyProject).filter(
            JourneyProject.user_number == meeting.user_number,
            JourneyProject.status == "active",
        ).all()
    }
    existing_goal_ids = {link.goal_id for link in meeting.goal_links}
    existing_project_ids = {link.project_id for link in meeting.project_links}
    for suggestion in analysis.get("suggested_goal_ids") or []:
        goal_id = suggestion.get("id")
        if goal_id in valid_goals and goal_id not in existing_goal_ids and _safe_confidence(suggestion.get("confidence")) >= 0.75:
            db.add(MeetingGoalLink(meeting_id=meeting.id, goal_id=goal_id))
    for suggestion in analysis.get("suggested_project_ids") or []:
        project_id = suggestion.get("id")
        if project_id in valid_projects and project_id not in existing_project_ids and _safe_confidence(suggestion.get("confidence")) >= 0.75:
            db.add(MeetingProjectLink(meeting_id=meeting.id, project_id=project_id))


def _start_processing(db: Session, meeting_id: int) -> dict | None:
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        return None
    has_saved_transcript = bool((meeting.transcript_text or meeting.user_notes or "").strip())
    meeting.processing_status = "analyzing" if has_saved_transcript else (
        "transcribing" if meeting.recording_storage_key else "analyzing"
    )
    meeting.processing_error = None
    user = db.query(User).filter(
        (User.phone_number == meeting.user_number) | (User.email == meeting.user_number)
    ).first()
    attendee_names = [name for (name,) in db.query(JourneyPerson.name).join(
        MeetingAttendee, MeetingAttendee.person_id == JourneyPerson.id
    ).filter(MeetingAttendee.meeting_id == meeting_id).all()]
    context_notes = db.query(MeetingContextNote).filter(
        MeetingContextNote.meeting_id == meeting_id
    ).order_by(MeetingContextNote.elapsed_seconds, MeetingContextNote.id).all()
    supplied_context_parts = []
    if attendee_names:
        supplied_context_parts.append("People selected as present: " + ", ".join(attendee_names))
    supplied_context_parts.extend(
        f"[{note.elapsed_seconds // 60:02d}:{note.elapsed_seconds % 60:02d}] {note.note_text}"
        for note in context_notes
    )
    leadership_context_parts = []
    user_identifiers = {meeting.user_number}
    if user:
        user_identifiers.update(value for value in (user.phone_number, user.email) if value)
        assessment = db.query(BeltAssessment).filter(
            BeltAssessment.user_number.in_(user_identifiers)
        ).order_by(BeltAssessment.created_at.desc()).first()
        if assessment:
            assessment_snapshot = {
                "current_belt": assessment.current_belt,
                "readiness_score": assessment.readiness_score,
                "strengths": assessment.strengths,
                "growth_edges": assessment.growth_edges,
                "wheel_scores": assessment.wheel_scores or assessment.dimension_scores,
                "wheel_feedback": assessment.wheel_feedback,
                "priority_next_actions": assessment.priority_next_actions or assessment.required_next_actions,
            }
            leadership_context_parts.append(
                "Latest leadership wheel/assessment: " + json.dumps(assessment_snapshot, default=str)[:6000]
            )
        trials = db.query(JourneyBeltTrial).filter(
            JourneyBeltTrial.user_number.in_(user_identifiers),
            JourneyBeltTrial.status.in_(["in_progress", "submitted", "completed"]),
        ).order_by(JourneyBeltTrial.updated_at.desc()).limit(6).all()
        if trials:
            trial_snapshot = [{
                "dimension": trial.dimension_id,
                "belt": trial.target_belt,
                "type": trial.trial_type,
                "status": trial.status,
                "prompt": (trial.prompt or "")[:500],
                "feedback": (trial.ai_feedback or "")[:700],
                "score": trial.score,
            } for trial in trials]
            leadership_context_parts.append(
                "Current/recent leadership trials: " + json.dumps(trial_snapshot, default=str)[:6000]
            )
        journal_entries = db.query(JournalEntry).filter(
            JournalEntry.user_id == user.id
        ).order_by(JournalEntry.created_at.desc()).limit(7).all()
        if journal_entries:
            journal_snapshot = [{
                "date": entry.created_at.date().isoformat() if entry.created_at else None,
                "reflection": (entry.text or "")[:1000],
                "depth_label": entry.reflection_depth_label,
            } for entry in journal_entries]
            leadership_context_parts.append(
                "Recent Growth Journal themes: " + json.dumps(journal_snapshot, default=str)[:7000]
            )
    goals = db.query(JourneyGoal).filter(
        JourneyGoal.user_number.in_(user_identifiers),
        JourneyGoal.parent_goal_id.is_(None),
    ).order_by(JourneyGoal.sort_order.asc(), JourneyGoal.updated_at.desc()).limit(5).all()
    if goals:
        leadership_context_parts.append(
            "Current top-level goals: " + json.dumps([{
                "title": goal.title or goal.goal_text,
                "why": (goal.why or "")[:500],
                "horizon": goal.time_horizon,
            } for goal in goals], default=str)[:4000]
        )
    people = db.query(JourneyPerson).filter(JourneyPerson.user_number == meeting.user_number).all()
    projects = db.query(JourneyProject).filter(
        JourneyProject.user_number == meeting.user_number,
        JourneyProject.status == "active",
    ).all()
    matching_context = {
        "people": [{"id": p.id, "name": p.name, "organization": p.organization, "context": (p.context or "")[:300]} for p in people],
        "goals": [{"id": g.id, "title": g.title or g.goal_text, "description": (g.goal_text or "")[:400]} for g in goals],
        "projects": [{"id": p.id, "title": p.project_name, "description": (p.description or p.goal or "")[:400]} for p in projects],
    }
    return {
        "title": meeting.title,
        "recording_storage_key": meeting.recording_storage_key,
        "recording_filename": meeting.recording_filename,
        "recording_content_type": meeting.recording_content_type,
        "transcript": (meeting.transcript_text or meeting.user_notes or "").strip(),
        "voice_reference": user.voice_reference_data_url if user else None,
        "supplied_context": "\n".join(supplied_context_parts),
        "leadership_context": "\n".join(leadership_context_parts)[:22000],
        "matching_context": json.dumps(matching_context, default=str)[:22000],
    }


def _save_transcription(db: Session, meeting_id: int, transcription: dict) -> str:
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise ValueError("Meeting was deleted while it was being transcribed.")
    meeting.transcript_text = transcription["text"]
    meeting.processing_status = "analyzing"
    meeting.updated_at = datetime.now(timezone.utc)
    db.query(MeetingTranscriptSegment).filter(MeetingTranscriptSegment.meeting_id == meeting_id).delete(
        synchronize_session=False
    )
    speaker_labels = set()
    for index, segment in enumerate(transcription["segments"]):
        db.add(MeetingTranscriptSegment(
            meeting_id=meeting_id,
            sequence_number=index,
            speaker_label=segment["speaker"],
            start_seconds=segment["start"],
            end_seconds=segment["end"],
            text=segment["text"],
        ))
        speaker_labels.add(segment["speaker"])
    existing_labels = {
        label for (label,) in db.query(MeetingParticipant.speaker_label).filter(
            MeetingParticipant.meeting_id == meeting_id
        ).all()
    }
    for speaker_label in sorted(speaker_labels - existing_labels):
        db.add(MeetingParticipant(
            meeting_id=meeting_id,
            display_name=speaker_label,
            speaker_label=speaker_label,
            match_status="current_user" if speaker_label == "Me" else "unmatched",
            is_current_user=speaker_label == "Me",
        ))
    return transcription["text"].strip()


def _save_analysis(
    db: Session,
    meeting_id: int,
    analysis: dict,
    tasks: dict,
    coaching: dict,
) -> None:
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise ValueError("Meeting was deleted while it was being analyzed.")
    # Analysis writes are idempotent, so a reconnect retry cannot duplicate rows.
    db.query(MeetingTopic).filter(MeetingTopic.meeting_id == meeting_id).delete(synchronize_session=False)
    db.query(MeetingDecision).filter(MeetingDecision.meeting_id == meeting_id).delete(synchronize_session=False)
    db.query(MeetingActionItem).filter(MeetingActionItem.meeting_id == meeting_id).delete(synchronize_session=False)
    db.query(MeetingLeadershipObservation).filter(
        MeetingLeadershipObservation.meeting_id == meeting_id
    ).delete(synchronize_session=False)
    analysis_with_coaching = {
        **analysis,
        "action_items": tasks.get("action_items") or [],
        "leadership_observations": coaching.get("leadership_observations") or [],
    }
    _replace_analysis(db, meeting, analysis_with_coaching)
    meeting.processing_status = "ready"
    meeting.processing_error = None
    meeting.updated_at = datetime.now(timezone.utc)


def _mark_processing_failed(meeting_id: int, exc: Exception, stage: str, attempt_id: str) -> None:
    reference = f"MTG-{meeting_id}-{attempt_id}"
    stage_label = stage.replace("_", " ")
    if isinstance(exc, NoIntelligibleSpeechError):
        public_error = (
            "No intelligible speech was detected in this recording. "
            f"Please try again and speak clearly near the microphone. Reference: {reference}"
        )
    elif isinstance(exc, DBAPIError) and _is_transient_database_error(exc):
        public_error = (
            f"A temporary database connection interrupted processing while {stage_label}. "
            f"Your recording is safe; please retry. Reference: {reference}"
        )
    elif isinstance(exc, DBAPIError):
        public_error = (
            f"Alfred could not save the generated meeting result while {stage_label}. "
            f"Your recording and transcript are safe. Reference: {reference}"
        )
    else:
        public_error = f"Processing failed while {stage_label}. Reference: {reference}"

    def mark(db: Session) -> None:
        meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
        if meeting:
            meeting.processing_status = "failed"
            meeting.processing_error = public_error
            meeting.updated_at = datetime.now(timezone.utc)

    try:
        _with_fresh_session(
            mark,
            "persist_failure_status",
            meeting_id=meeting_id,
            attempt_id=attempt_id,
        )
    except Exception as persist_exc:
        _meeting_log(
            logging.ERROR,
            "failure_status_persist_failed",
            meeting_id=meeting_id,
            attempt_id=attempt_id,
            stage="persist_failure_status",
            **_safe_error_fields(persist_exc),
        )


def process_meeting(meeting_id: int) -> None:
    attempt_id = uuid.uuid4().hex[:8].upper()
    processing_started = time.monotonic()
    stage = "starting processing"
    _meeting_log(
        logging.INFO,
        "processing_started",
        meeting_id=meeting_id,
        attempt_id=attempt_id,
        stage="start_processing",
    )
    try:
        stage = "loading meeting context"
        stage_started = time.monotonic()
        snapshot = _with_fresh_session(
            lambda db: _start_processing(db, meeting_id),
            "load_meeting_context",
            meeting_id=meeting_id,
            attempt_id=attempt_id,
        )
        if not snapshot:
            _meeting_log(
                logging.WARNING,
                "meeting_not_found",
                meeting_id=meeting_id,
                attempt_id=attempt_id,
                stage="load_meeting_context",
            )
            return
        _meeting_log(
            logging.INFO,
            "stage_completed",
            meeting_id=meeting_id,
            attempt_id=attempt_id,
            stage="load_meeting_context",
            duration_ms=round((time.monotonic() - stage_started) * 1000),
            has_saved_transcript=bool(snapshot["transcript"]),
            has_recording=bool(snapshot["recording_storage_key"]),
        )

        transcript = snapshot["transcript"]
        if not transcript and snapshot["recording_storage_key"]:
            stage = "transcribing recording"
            stage_started = time.monotonic()
            _meeting_log(logging.INFO, "stage_started", meeting_id=meeting_id, attempt_id=attempt_id, stage="transcription")
            transcription = transcribe_recording(
                snapshot["recording_storage_key"],
                snapshot["recording_filename"] or "meeting-audio",
                snapshot["recording_content_type"],
                snapshot["voice_reference"],
                meeting_id=meeting_id,
                attempt_id=attempt_id,
            )
            _meeting_log(
                logging.INFO,
                "stage_completed",
                meeting_id=meeting_id,
                attempt_id=attempt_id,
                stage="transcription",
                duration_ms=round((time.monotonic() - stage_started) * 1000),
                segment_count=len(transcription.get("segments") or []),
            )
            if not (transcription.get("text") or "").strip():
                raise NoIntelligibleSpeechError
            stage = "saving transcription"
            stage_started = time.monotonic()
            transcript = _with_fresh_session(
                lambda db: _save_transcription(db, meeting_id, transcription),
                "save_transcription",
                meeting_id=meeting_id,
                attempt_id=attempt_id,
            )
            _meeting_log(
                logging.INFO,
                "stage_completed",
                meeting_id=meeting_id,
                attempt_id=attempt_id,
                stage="save_transcription",
                duration_ms=round((time.monotonic() - stage_started) * 1000),
            )
        elif transcript:
            _meeting_log(logging.INFO, "saved_transcript_reused", meeting_id=meeting_id, attempt_id=attempt_id, stage="transcription")

        if not transcript:
            raise ValueError("No recording, transcript, or notes were provided.")

        stage = "analyzing meeting"
        stage_started = time.monotonic()
        _meeting_log(logging.INFO, "stage_started", meeting_id=meeting_id, attempt_id=attempt_id, stage="analysis")
        analysis = analyze_transcript(
            transcript,
            snapshot["title"],
            snapshot["supplied_context"],
            snapshot["matching_context"],
        )
        _meeting_log(
            logging.INFO,
            "stage_completed",
            meeting_id=meeting_id,
            attempt_id=attempt_id,
            stage="analysis",
            duration_ms=round((time.monotonic() - stage_started) * 1000),
            participant_count=len(analysis.get("participants") or []),
            topic_count=len(analysis.get("topics") or []),
            decision_count=len(analysis.get("decisions") or []),
        )
        stage = "extracting action items"
        stage_started = time.monotonic()
        _meeting_log(logging.INFO, "stage_started", meeting_id=meeting_id, attempt_id=attempt_id, stage="task_extraction")
        tasks = extract_action_items(transcript, analysis, snapshot["supplied_context"])
        _meeting_log(
            logging.INFO, "stage_completed", meeting_id=meeting_id, attempt_id=attempt_id,
            stage="task_extraction",
            duration_ms=round((time.monotonic() - stage_started) * 1000),
            action_item_count=len(tasks.get("action_items") or []),
        )
        stage = "generating leadership coaching"
        stage_started = time.monotonic()
        _meeting_log(logging.INFO, "stage_started", meeting_id=meeting_id, attempt_id=attempt_id, stage="leadership_coaching")
        coaching_analysis = {**analysis, "action_items": tasks.get("action_items") or []}
        coaching = analyze_leadership_feedback(
            transcript,
            coaching_analysis,
            snapshot["leadership_context"],
        )
        _meeting_log(
            logging.INFO, "stage_completed", meeting_id=meeting_id, attempt_id=attempt_id,
            stage="leadership_coaching",
            duration_ms=round((time.monotonic() - stage_started) * 1000),
            leadership_observation_count=len(coaching.get("leadership_observations") or []),
        )
        stage = "saving analysis"
        stage_started = time.monotonic()
        _with_fresh_session(
            lambda db: _save_analysis(db, meeting_id, analysis, tasks, coaching),
            "save_analysis",
            meeting_id=meeting_id,
            attempt_id=attempt_id,
        )
        _meeting_log(
            logging.INFO,
            "processing_completed",
            meeting_id=meeting_id,
            attempt_id=attempt_id,
            stage="save_analysis",
            stage_duration_ms=round((time.monotonic() - stage_started) * 1000),
            total_duration_ms=round((time.monotonic() - processing_started) * 1000),
        )
    except Exception as exc:
        _meeting_log(
            logging.ERROR,
            "processing_failed",
            meeting_id=meeting_id,
            attempt_id=attempt_id,
            stage=stage.replace(" ", "_"),
            total_duration_ms=round((time.monotonic() - processing_started) * 1000),
            **_safe_error_fields(exc),
        )
        _mark_processing_failed(meeting_id, exc, stage, attempt_id)
