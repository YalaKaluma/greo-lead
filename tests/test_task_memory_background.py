from datetime import date
from types import SimpleNamespace
from unittest.mock import Mock, patch

from fastapi import BackgroundTasks

from app.routers.tasks import TaskCreate, _sync_task_memory, create_task


def test_task_creation_queues_memory_sync_instead_of_running_it_inline():
    db = Mock()

    def assign_task_id(task):
        task.id = 321

    db.refresh.side_effect = assign_task_id
    background_tasks = BackgroundTasks()

    with patch("app.routers.tasks.sync_task_evidence") as sync_task_evidence:
        created = create_task(
            task=TaskCreate(title="Prepare the board update", due_date=date(2026, 9, 22)),
            background_tasks=background_tasks,
            user_number="user-a",
            db=db,
        )

    assert created.id == 321
    sync_task_evidence.assert_not_called()
    assert len(background_tasks.tasks) == 1
    queued = background_tasks.tasks[0]
    assert queued.func is _sync_task_memory
    assert queued.args == ("user-a", 321)


def test_background_memory_sync_uses_an_independent_database_session():
    user = SimpleNamespace(id=7, phone_number="user-a")
    task = SimpleNamespace(id=321, user_number="user-a")
    db = Mock()
    db.query.return_value.filter.return_value.first.side_effect = [user, task]

    with (
        patch("app.routers.tasks.SessionLocal", return_value=db),
        patch("app.routers.tasks.sync_task_evidence") as sync_task_evidence,
    ):
        _sync_task_memory("user-a", 321)

    sync_task_evidence.assert_called_once_with(db, user, task)
    db.close.assert_called_once_with()
