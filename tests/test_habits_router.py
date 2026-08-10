import os
from datetime import date, timedelta
from unittest import TestCase
from unittest.mock import patch

from fastapi import HTTPException

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

from app.models import DailyEnergyCheckin, Habit, HabitCompletion, JourneyGoal, User
from app.routers import habits


class FakeQuery:
    def __init__(self, items):
        self.items = items

    def filter(self, *args, **kwargs):
        return self

    def all(self):
        return list(self.items)

    def first(self):
        return self.items[0] if self.items else None

    def scalar(self):
        return self.items[0] if self.items else None


class FakeHabitDb:
    def __init__(self):
        self.habits = []
        self.completions = []
        self.energy_checkins = []
        self.goals = []
        self.users = []
        self.commits = 0
        self.refreshes = []
        self.next_ids = {
            Habit: 1,
            HabitCompletion: 1,
            DailyEnergyCheckin: 1,
        }

    def add(self, item):
        if getattr(item, "id", None) is None and type(item) in self.next_ids:
            item.id = self.next_ids[type(item)]
            self.next_ids[type(item)] += 1

        if isinstance(item, Habit) and item not in self.habits:
            self.habits.append(item)
        if isinstance(item, HabitCompletion) and item not in self.completions:
            self.completions.append(item)
        if isinstance(item, DailyEnergyCheckin) and item not in self.energy_checkins:
            self.energy_checkins.append(item)

    def query(self, model):
        if getattr(model, "name", None) == "max":
            sort_orders = [
                habit.sort_order
                for habit in self.habits
                if habit.sort_order is not None
            ]
            return FakeQuery([max(sort_orders)] if sort_orders else [None])
        if model is Habit:
            return FakeQuery(self.habits)
        if model is HabitCompletion:
            return FakeQuery(self.completions)
        if model is DailyEnergyCheckin:
            return FakeQuery(self.energy_checkins)
        if model is User:
            return FakeQuery(self.users)
        if model is JourneyGoal.id:
            return FakeQuery(self.goals)
        return FakeQuery([])

    def commit(self):
        self.commits += 1

    def refresh(self, item):
        self.refreshes.append(item)


class HabitsRouterTest(TestCase):
    def test_calculate_streak_skips_weekends_for_weekday_habits(self):
        today = date(2026, 6, 15)  # Monday
        completions = [
            HabitCompletion(date=today, status="done"),
            HabitCompletion(date=today - timedelta(days=3), status="done"),  # Friday
            HabitCompletion(date=today - timedelta(days=4), status="done"),  # Thursday
        ]

        self.assertEqual(habits.calculate_streak(completions, "weekdays", today), 3)

    def test_weekday_streak_survives_the_weekend(self):
        friday = date(2026, 6, 12)
        completions = [
            HabitCompletion(date=friday, status="done"),
            HabitCompletion(date=friday - timedelta(days=1), status="done"),
        ]

        self.assertEqual(habits.calculate_streak(completions, "weekdays", friday + timedelta(days=1)), 2)
        self.assertEqual(habits.calculate_streak(completions, "weekdays", friday + timedelta(days=2)), 2)
        self.assertEqual(habits.calculate_streak(completions, "weekdays", friday + timedelta(days=3)), 2)

    def test_create_habit_validates_goal_and_trims_title(self):
        db = FakeHabitDb()
        db.goals.append((7,))

        result = habits.create_habit(
            habits.HabitCreate(title="  Deep work  ", goal_id=7, frequency="weekdays"),
            user_number="user-1",
            db=db,
        )

        self.assertEqual(result, {"id": 1, "message": "Habit created successfully"})
        self.assertEqual(db.habits[0].title, "Deep work")
        self.assertEqual(db.habits[0].goal_id, 7)
        self.assertEqual(db.habits[0].frequency, "weekdays")
        self.assertEqual(db.habits[0].sort_order, 0)
        self.assertEqual(db.commits, 1)
        self.assertEqual(db.refreshes, [db.habits[0]])

    def test_create_habit_places_new_habit_after_existing_sort_order(self):
        db = FakeHabitDb()
        db.habits.extend([
            Habit(id=10, user_number="user-1", title="First", sort_order=2),
            Habit(id=11, user_number="user-1", title="Second", sort_order=7),
        ])

        result = habits.create_habit(
            habits.HabitCreate(title="Third"),
            user_number="user-1",
            db=db,
        )

        self.assertEqual(result, {"id": 1, "message": "Habit created successfully"})
        self.assertEqual(db.habits[-1].sort_order, 8)

    def test_create_habit_rejects_missing_goal_link(self):
        db = FakeHabitDb()

        with self.assertRaises(HTTPException) as exc:
            habits.create_habit(
                habits.HabitCreate(title="Deep work", goal_id=404),
                user_number="user-1",
                db=db,
            )

        self.assertEqual(exc.exception.status_code, 404)
        self.assertEqual(exc.exception.detail, "Goal not found")
        self.assertEqual(db.habits, [])
        self.assertEqual(db.commits, 0)

    def test_toggle_today_creates_then_cycles_completion(self):
        db = FakeHabitDb()
        db.habits.append(Habit(id=10, user_number="user-1", title="Reflect"))

        with (
            patch.object(habits, "get_user_timezone", return_value="UTC"),
            patch.object(habits, "today_for_timezone", return_value=date(2026, 6, 16)),
        ):
            first = habits.toggle_today(10, user_number="user-1", db=db)
            second = habits.toggle_today(10, user_number="user-1", db=db)
            third = habits.toggle_today(10, user_number="user-1", db=db)

        self.assertEqual(first, {"status": "done"})
        self.assertEqual(second, {"status": "not_done"})
        self.assertEqual(third, {"status": "pending"})
        self.assertEqual(len(db.completions), 1)
        self.assertEqual(db.completions[0].date, date(2026, 6, 16))
        self.assertEqual(db.commits, 3)

    def test_energy_checkin_upserts_by_user_and_date(self):
        db = FakeHabitDb()

        created = habits.save_energy_checkin(
            habits.EnergyCheckinRequest(
                user_number="user-1",
                checkin_date="2026-06-16",
                energy_level=3,
                source="manual",
                message_id=12,
            ),
            db=db,
        )
        updated = habits.save_energy_checkin(
            habits.EnergyCheckinRequest(
                user_number="user-1",
                checkin_date="2026-06-16",
                energy_level=5,
                source="evening_nudge",
            ),
            db=db,
        )

        self.assertEqual(created["energy_level"], 3)
        self.assertEqual(updated["energy_level"], 5)
        self.assertEqual(updated["source"], "evening_nudge")
        self.assertIsNone(updated["message_id"])
        self.assertEqual(len(db.energy_checkins), 1)
        self.assertEqual(db.commits, 2)
