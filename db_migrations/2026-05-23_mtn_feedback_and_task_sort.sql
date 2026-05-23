-- MTN feedback uses the existing task_priority_decisions learning table.
-- This migration only makes the dependency explicit and ensures durable task
-- ordering works for MTN sort and drag/drop reorder.

ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS sort_order INTEGER;

CREATE INDEX IF NOT EXISTS ix_tasks_user_sort_order
    ON tasks(user_number, sort_order);

CREATE INDEX IF NOT EXISTS ix_task_priority_decisions_user_action
    ON task_priority_decisions(user_number, user_action);

CREATE INDEX IF NOT EXISTS ix_task_priority_decisions_task_decided_at
    ON task_priority_decisions(task_id, decided_at DESC);
