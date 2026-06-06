-- Track how often a task's due date is pushed later.

ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS times_postponed INTEGER DEFAULT 0;

UPDATE tasks
SET times_postponed = 0
WHERE times_postponed IS NULL;

CREATE INDEX IF NOT EXISTS ix_tasks_user_times_postponed
    ON tasks(user_number, times_postponed DESC);
