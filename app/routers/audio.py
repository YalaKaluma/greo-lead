from fastapi import APIRouter, File, HTTPException, UploadFile

from app.services.audio_service import transcribe_audio

router = APIRouter()


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
