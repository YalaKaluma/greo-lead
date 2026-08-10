from io import BytesIO

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.services.audio_service import synthesize_speech, transcribe_audio
from app.utils.safe_errors import internal_error

router = APIRouter()
MAX_TRANSCRIPTION_BYTES = 25 * 1024 * 1024
ALLOWED_AUDIO_TYPES = {
    "audio/mpeg", "audio/mp3", "audio/mp4", "audio/m4a", "audio/x-m4a",
    "audio/wav", "audio/x-wav", "audio/webm", "video/webm",
}


class SpeechRequest(BaseModel):
    text: str


@router.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    """
    Transcribe uploaded audio without storing it or applying domain logic.
    """
    content_type = (file.content_type or "").split(";", 1)[0].strip().lower()
    if content_type not in ALLOWED_AUDIO_TYPES:
        raise HTTPException(status_code=415, detail="Unsupported audio format.")
    data = await file.read(MAX_TRANSCRIPTION_BYTES + 1)
    if not data or len(data) > MAX_TRANSCRIPTION_BYTES:
        raise HTTPException(status_code=413, detail="Audio must be smaller than 25 MB.")
    await file.seek(0)
    try:
        transcript = await transcribe_audio(file)
        return {"transcript": transcript}
    except Exception as e:
        raise internal_error("audio_transcription", e, "Transcription failed.")


@router.post("/speech")
async def speech(request: SpeechRequest):
    """
    Generate Alfred's consistent read-aloud voice without storing audio.
    """
    text = request.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is required.")

    try:
        audio_bytes = synthesize_speech(text[:4000])
        return StreamingResponse(
            BytesIO(audio_bytes),
            media_type="audio/mpeg",
            headers={"Cache-Control": "no-store"},
        )
    except Exception as e:
        raise internal_error("speech_generation", e, "Speech generation failed.")
