from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest import TestCase

from app.services.task_mtn_trend_service import _rank_procrastinated_tasks


class TaskMtnTrendsTest(TestCase):
    def test_procrastination_ranking_limits_to_top_three(self):
        now = datetime(2026, 6, 9, 12, 0, 0)
        tasks = [
            SimpleNamespace(id=1, times_postponed=5, move_the_needle_score=0.2, updated_at=now),
            SimpleNamespace(id=2, times_postponed=4, move_the_needle_score=0.9, updated_at=now),
            SimpleNamespace(id=3, times_postponed=3, move_the_needle_score=0.8, updated_at=now),
            SimpleNamespace(id=4, times_postponed=2, move_the_needle_score=10, updated_at=now),
        ]

        ranked = _rank_procrastinated_tasks(tasks)

        self.assertEqual([task.id for task in ranked], [1, 2, 3])

    def test_procrastination_ranking_breaks_postpone_ties_by_normalized_score(self):
        now = datetime(2026, 6, 9, 12, 0, 0)
        tasks = [
            SimpleNamespace(id=1, times_postponed=3, move_the_needle_score=0.5, updated_at=now),
            SimpleNamespace(id=2, times_postponed=3, move_the_needle_score=0.9, updated_at=now - timedelta(days=2)),
            SimpleNamespace(id=3, times_postponed=3, move_the_needle_score=8, updated_at=now),
            SimpleNamespace(id=4, times_postponed=2, move_the_needle_score=10, updated_at=now),
        ]

        ranked = _rank_procrastinated_tasks(tasks)

        self.assertEqual([task.id for task in ranked], [2, 3, 1])
