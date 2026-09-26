from types import SimpleNamespace

from app.services import meeting_intelligence_service as service


def _meeting(*, goal_ids=(), project_ids=()):
    return SimpleNamespace(
        goal_links=[SimpleNamespace(goal_id=value) for value in goal_ids],
        project_links=[SimpleNamespace(project_id=value) for value in project_ids],
    )


def test_analysis_suggestions_are_proposals_and_skip_existing_links():
    analysis = {
        "suggested_goal_ids": [
            {"id": 10, "confidence": 0.95},
            {"id": 11, "confidence": 0.91},
        ],
        "suggested_project_ids": [{"id": 20, "confidence": 0.92}],
        "new_people": [{
            "name": "Morgan Lee",
            "speaker_label": "B",
            "confidence": 0.89,
            "evidence_excerpt": "Morgan will lead the review.",
        }],
        "suggested_flags": [{"label": "Client escalation", "confidence": 0.8}],
    }

    suggestions = service._analysis_suggestions(
        _meeting(goal_ids=(10,), project_ids=(20,)), analysis
    )

    assert {(item["suggestion_type"], item["action"]) for item in suggestions} == {
        ("goal", "link"),
        ("person", "create"),
        ("flag", "confirm"),
    }
    assert next(item for item in suggestions if item["suggestion_type"] == "goal")["target_id"] == 11


def test_weak_or_unsupported_profile_claims_are_not_suggested():
    analysis = {
        "profile_suggestions": [
            {"suggestion_type": "strength", "action": "create", "title": "Clarity", "confidence": 0.8},
            {"suggestion_type": "development_area", "action": "evidence", "target_id": 8, "title": "Delegation", "confidence": 0.4},
            {"suggestion_type": "personality", "action": "create", "title": "Introvert", "confidence": 0.99},
        ]
    }

    suggestions = service._analysis_suggestions(_meeting(), analysis)

    assert len(suggestions) == 1
    assert suggestions[0]["suggestion_type"] == "strength"
    assert suggestions[0]["title"] == "Clarity"


def test_suggestion_fingerprint_is_stable_for_equivalent_labels():
    first = {
        "suggestion_type": "flag",
        "action": "confirm",
        "title": " Client Escalation ",
    }
    second = {
        "suggestion_type": "flag",
        "action": "confirm",
        "title": "client escalation",
    }

    assert service._suggestion_fingerprint(first) == service._suggestion_fingerprint(second)
