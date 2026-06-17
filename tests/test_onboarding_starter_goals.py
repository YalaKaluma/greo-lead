from types import SimpleNamespace

from app.services.onboarding_seed_service import is_starter_goal_example


def goal(title, time_horizon):
    return SimpleNamespace(title=title, time_horizon=time_horizon)


def test_detects_seeded_starter_goal_titles_by_level():
    assert is_starter_goal_example(goal("Build My Own Software Business", "vision"))
    assert is_starter_goal_example(goal("Build a First MVP", "pillar"))
    assert is_starter_goal_example(goal("Validate a real customer problem", "outcome"))


def test_edited_or_custom_goal_is_not_treated_as_starter_example():
    assert not is_starter_goal_example(goal("Build My Own AI Consulting Studio", "vision"))
    assert not is_starter_goal_example(goal("Build My Own Software Business", "outcome"))
