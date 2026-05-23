from openai import OpenAI

client = OpenAI()


async def transcribe_audio(audio_file) -> str:
    audio_bytes = await audio_file.read()

    transcript = client.audio.transcriptions.create(
        model="gpt-4o-mini-transcribe",
        file=(audio_file.filename, audio_bytes, audio_file.content_type),
    )

    return transcript.text
