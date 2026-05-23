from openai import OpenAI

client = OpenAI()

ALFRED_VOICE_INSTRUCTIONS = (
    "Speak as Alfred: an older, composed male executive coach with a warm, "
    "slightly British accent. Use a smooth, calm baritone delivery, measured "
    "pace, subtle authority, and understated warmth. Avoid sounding theatrical, "
    "announcer-like, robotic, rushed, or overly cheerful."
)


async def transcribe_audio(audio_file) -> str:
    audio_bytes = await audio_file.read()

    transcript = client.audio.transcriptions.create(
        model="gpt-4o-mini-transcribe",
        file=(audio_file.filename, audio_bytes, audio_file.content_type),
    )

    return transcript.text


def synthesize_speech(text: str) -> bytes:
    speech = client.audio.speech.create(
        model="gpt-4o-mini-tts",
        voice="onyx",
        input=text,
        instructions=ALFRED_VOICE_INSTRUCTIONS,
        response_format="mp3",
    )

    return speech.content
