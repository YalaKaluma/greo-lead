-- Separate the day a user plans to work on a task from its optional deadline.
ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS scheduled_date DATE;

CREATE INDEX IF NOT EXISTS ix_tasks_user_scheduled_date
    ON tasks (user_number, scheduled_date);
