from types import SimpleNamespace
from datetime import datetime, timedelta

from app.services.journal_reflection_depth_service import get_reflection_depth_trends
from app.services.onboarding_seed_service import (
    STARTER_JOURNAL_DEPTH_EXPLANATION,
    STARTER_JOURNAL_EXAMPLES,
    STARTER_TASK_TITLES,
    ensure_starter_tasks_visible_today,
    is_starter_goal_example,
    is_starter_journal_example,
)


def goal(title, time_horizon):
    return SimpleNamespace(title=title, time_horizon=time_horizon)


def test_detects_seeded_starter_goal_titles_by_level():
    assert is_starter_goal_example(goal("Build My Own Software Business", "vision"))
    assert is_starter_goal_example(goal("Build a First MVP", "pillar"))
    assert is_starter_goal_example(goal("Validate a real customer problem", "outcome"))


def test_edited_or_custom_goal_is_not_treated_as_starter_example():
    assert not is_starter_goal_example(goal("Build My Own AI Consulting Studio", "vision"))
    assert not is_starter_goal_example(goal("Build My Own Software Business", "outcome"))


def starter_journal_message():
    item = STARTER_JOURNAL_EXAMPLES[0]
    return SimpleNamespace(
        content=f"{item['title']}\n\n{item['body']}",
        reflection_depth_explanation=STARTER_JOURNAL_DEPTH_EXPLANATION,
    )


def test_detects_seeded_starter_journal_examples():
    assert is_starter_journal_example(starter_journal_message())


def test_edited_journal_example_is_not_treated_as_starter_example():
    entry = starter_journal_message()
    entry.content = f"{entry.content}\n\nMy own note."

    assert not is_starter_journal_example(entry)


class FakeQuery:
    def __init__(self, entries):
        self.entries = entries

    def filter(self, *args):
        return self

    def order_by(self, *args):
        return self

    def all(self):
        return self.entries


class FakeDb:
    def __init__(self, entries):
        self.entries = entries

    def query(self, *args):
        return FakeQuery(self.entries)


def test_starter_task_date_repair_only_updates_undated_tasks(monkeypatch):
    today = datetime(2026, 6, 27)
    future_due = today + timedelta(days=7)
    undated = SimpleNamespace(
        title=STARTER_TASK_TITLES[0],
        due_date=None,
        current_bucket="today",
        updated_at=None,
    )
    postponed = SimpleNamespace(
        title=STARTER_TASK_TITLES[1],
        due_date=future_due,
        current_bucket="today",
        updated_at=None,
    )

    monkeypatch.setattr(
        "app.services.onboarding_seed_service._starter_due_datetime",
        lambda db, user_number: today,
    )

    repaired_count = ensure_starter_tasks_visible_today(FakeDb([undated, postponed]), "user-1")

    assert repaired_count == 1
    assert undated.due_date == today
    assert undated.current_bucket == "today"
    assert postponed.due_date == future_due


def test_reflection_trends_can_exclude_starter_journal_examples():
    starter = starter_journal_message()
    starter.sender = "user"
    starter.user_number = "user-1"
    starter.reflection_depth_score = 2.0
    starter.timestamp = datetime.utcnow()

    custom = SimpleNamespace(
        sender="user",
        user_number="user-1",
        content="Today I noticed a real pattern in how I delegate.",
        reflection_depth_score=7.0,
        reflection_depth_explanation="User-created reflection.",
        timestamp=datetime.utcnow(),
    )

    trends = get_reflection_depth_trends("user-1", FakeDb([starter, custom]), include_starter_examples=False)

    assert trends["summary"]["total_journal_entries"] == 1
    assert trends["trend_chart"][-1]["entry_count"] == 1
