from app.services import meeting_intelligence_service as service
import json
import pytest


class _Meeting:
    context_receipt = None
    processing_status = None
    processing_error = None
    updated_at = None


class _Query:
    def __init__(self, meeting):
        self.meeting = meeting

    def filter(self, *_args, **_kwargs):
        return self

    def first(self):
        return self.meeting


class _Session:
    def __init__(self, meeting):
        self.meeting = meeting

    def query(self, _model):
        return _Query(self.meeting)


def test_no_intelligible_speech_has_clear_public_error(monkeypatch):
    meeting = _Meeting()

    def run_with_session(operation, _label, **_kwargs):
        return operation(_Session(meeting))

    monkeypatch.setattr(service, "_with_fresh_session", run_with_session)

    service._mark_processing_failed(
        meeting_id=27,
        exc=service.NoIntelligibleSpeechError(),
        stage="transcribing recording",
        attempt_id="D0145040",
    )

    assert meeting.processing_status == "failed"
    assert meeting.processing_error == (
        "No intelligible speech was detected in this recording. "
        "Please try again and speak clearly near the microphone. "
        "Reference: MTG-27-D0145040"
    )


@pytest.mark.parametrize("recovered", [True, False])
def test_empty_transcription_retries_once_without_voice_reference(monkeypatch, recovered):
    calls = []
    normalized = []
    def transcribe(path, filename, content_type, reference):
        calls.append(reference)
        return {"text": "A: Hello" if len(calls) == 2 and recovered else "", "segments": []}
    monkeypatch.setattr(service, "_transcribe_file", transcribe)
    monkeypatch.setattr(service, "_normalize_audio", lambda *a: normalized.append(a))
    result = service._transcribe_with_empty_retry("audio.webm", "audio.webm", "audio/webm", "voice",
                                                meeting_id=1, attempt_id="TEST")
    assert calls == ["voice", None]
    assert len(normalized) == 1
    assert bool(result["text"]) == recovered


def test_nonempty_transcription_does_not_retry(monkeypatch):
    monkeypatch.setattr(service, "_transcribe_file", lambda *a: {"text": "Me: Hello", "segments": []})
    def forbidden(*args):
        raise AssertionError("Successful transcription must not be normalized again")
    monkeypatch.setattr(service, "_normalize_audio", forbidden)
    result = service._transcribe_with_empty_retry("audio", "audio", "audio/mpeg", None,
                                                meeting_id=1, attempt_id="TEST")
    assert result["text"] == "Me: Hello"


def test_invalid_supplement_retries_but_database_errors_do_not(monkeypatch):
    calls = []
    def generate():
        calls.append(1)
        if len(calls) == 1:
            raise json.JSONDecodeError("invalid", "", 0)
        return {"reviewed": True}
    assert service._retry_supplement_output(generate, meeting_id=1, attempt_id="TEST", stage="coaching") == {"reviewed": True}
    assert len(calls) == 2
    calls.clear()
    def fail():
        calls.append(1)
        raise RuntimeError("database failure")
    with pytest.raises(RuntimeError):
        service._retry_supplement_output(fail, meeting_id=1, attempt_id="TEST", stage="coaching")
    assert len(calls) == 1
