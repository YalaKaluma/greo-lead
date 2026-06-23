from app.routers import journey


def test_journey_router_keeps_public_route_contract():
    route_paths = {route.path for route in journey.router.routes}

    expected_paths = {
        "/trial-config",
        "/subdomain-prompts",
        "/validation/{belt}",
        "/validation/{belt}/{dimension_id}",
        "/belt-readiness/status",
        "/belt-assessments/latest",
        "/belt-assessments",
        "/belt-assessments/submit",
        "/belt-assessments/{assessment_id}/accept-promotion",
        "/belt-trials",
        "/goals",
        "/goals/reorder",
        "/visions/{vision_id}/roadmap",
        "/visions/{vision_id}/progress-review",
        "/visions/{vision_id}/waves",
        "/visions/{vision_id}/generate-roadmap",
        "/people",
        "/people/{person_id}/review-history",
        "/people/{person_id}/synthesis",
        "/coach",
        "/goal-reviews",
    }

    assert expected_paths <= route_paths


def test_journey_router_keeps_legacy_test_exports():
    assert journey.submit_belt_trial_response is journey.submit_belt_trial
    assert journey.ensure_starter_goal_samples_compacted is not None


def test_journey_goal_level_normalization_contract():
    assert journey.normalize_goal_level("long") == "vision"
    assert journey.normalize_goal_level("medium_term") == "pillar"
    assert journey.normalize_goal_level("short") == "outcome"
    assert set(journey.goal_level_variants("vision")) == {"vision", "long"}
