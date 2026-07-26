from app.services import meeting_intelligence_service as service


class _Meeting:
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
