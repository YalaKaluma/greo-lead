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


def test_resolution_maps_goal_people_and_project_to_approval_proposals():
    resolution = {
        "primary_goal": {"status": "existing", "id": 3, "title": "Grow Engine", "confidence": 0.9},
        "people": [
            {"speaker_label": "A", "status": "existing", "id": 7, "name": "Sarah", "confidence": 0.92},
            {"speaker_label": "B", "status": "new", "name": "Morgan", "confidence": 0.85},
            {"speaker_label": "C", "status": "unknown", "confidence": 0.2},
        ],
        "primary_project": {"status": "new", "name": "Campari US Demo", "confidence": 0.88},
        "suggested_flags": [{"label": "Client demo", "confidence": 0.8}],
    }

    mapped = service._resolution_to_analysis(resolution)

    assert mapped["suggested_goal_ids"][0]["id"] == 3
    assert mapped["suggested_person_matches"][0]["person_id"] == 7
    assert mapped["new_people"][0]["name"] == "Morgan"
    assert mapped["new_projects"][0]["name"] == "Campari US Demo"
    assert not any(item.get("speaker_label") == "C" for item in mapped["new_people"])


def test_entity_enrichment_is_one_grouped_proposal_per_entity():
    analysis = {
        "entity_enrichments": [{
            "entity_type": "person",
            "target_id": 7,
            "entity_name": "Sarah",
            "confidence": 0.86,
            "changes": [
                {"field": "stakeholder_priorities", "operation": "append", "current_value": None, "proposed_value": "Prepare the US demo"},
                {"field": "next_action", "operation": "replace", "current_value": None, "proposed_value": "Review the dataset"},
            ],
        }]
    }

    suggestions = service._analysis_suggestions(_meeting(), analysis)

    assert len(suggestions) == 1
    assert suggestions[0]["suggestion_type"] == "person_update"
    assert suggestions[0]["action"] == "update"
    assert suggestions[0]["target_id"] == 7
    assert len(suggestions[0]["changes"]) == 2


def test_update_fingerprint_changes_when_proposed_fields_change():
    base = {
        "suggestion_type": "project_update",
        "action": "update",
        "target_id": 4,
        "title": "Platform",
        "changes": [{"field": "status", "proposed_value": "active"}],
    }
    changed = {**base, "changes": [{"field": "status", "proposed_value": "paused"}]}

    assert service._suggestion_fingerprint(base) != service._suggestion_fingerprint(changed)
