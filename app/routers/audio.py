from io import BytesIO

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.services.audio_service import synthesize_speech, transcribe_audio

router = APIRouter()


class SpeechRequest(BaseModel):
    text: str


@router.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    """
    Transcribe uploaded audio without storing it or applying domain logic.
    """
    try:
        transcript = await transcribe_audio(file)
        return {"transcript": transcript}
    except Exception as e:
        print(f"Audio transcription error: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Transcription failed: {str(e)}",
        )


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
        print(f"Audio speech generation error: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Speech generation failed: {str(e)}",
        )
