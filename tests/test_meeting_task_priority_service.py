from datetime import date

from app.services import meeting_task_priority_service as service


class _Meeting:
    title = "Weekly leadership meeting"


class _Action:
    id = 17
    description = "Follow up with the customer"
    owner_name = "Alex"
    due_date = None
    priority = "High"
    goal_id = 4
    delegated_to = None
    created_at = None
    meeting = _Meeting()
    mtn_score = None
    mtn_reason = None
    mtn_risk_if_ignored = None
    mtn_scored_at = None


class _Query:
    def __init__(self, actions):
        self.actions = actions

    def join(self, *_args):
        return self

    def filter(self, *_args):
        return self

    def limit(self, _limit):
        return self

    def all(self):
        return self.actions


class _Session:
    def __init__(self, actions):
        self.actions = actions

    def query(self, _model):
        return _Query(self.actions)


def test_scores_pending_action_items_when_meeting_is_created(monkeypatch):
    action = _Action()
    captured = {}

    class _PriorityService:
        def __init__(self, db):
            captured["db"] = db

        def create_context_snapshot(self, user_number):
            captured["user_number"] = user_number
            return {"context": "snapshot"}

    class _PriorityLLMService:
        def score_tasks(self, tasks, context):
            captured["tasks"] = tasks
            captured["context"] = context
            return {
                "scores": [{
                    "task_id": -17,
                    "top10_likelihood": 8.7,
                    "primary_reason": "Important customer commitment",
                    "risk_if_ignored": "Customer confidence may decline",
                }]
            }

    monkeypatch.setattr(service, "PriorityService", _PriorityService)
    monkeypatch.setattr(service, "PriorityLLMService", _PriorityLLMService)
    monkeypatch.setattr(service, "get_user_timezone", lambda *_args: "UTC")
    monkeypatch.setattr(service, "today_for_timezone", lambda *_args: date(2026, 8, 15))

    scored = service.score_pending_meeting_action_items(
        _Session([action]),
        "user-42",
        meeting_id=9,
    )

    assert scored == 1
    assert captured["user_number"] == "user-42"
    assert captured["tasks"][0].id == -17
    assert captured["tasks"][0].due_date.date() == date(2026, 8, 15)
    assert action.mtn_score == 8.7
    assert action.mtn_reason == "Important customer commitment"
    assert action.mtn_risk_if_ignored == "Customer confidence may decline"
    assert action.mtn_scored_at is not None
