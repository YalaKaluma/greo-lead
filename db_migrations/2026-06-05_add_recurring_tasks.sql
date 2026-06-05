ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS recurrence_type TEXT,
    ADD COLUMN IF NOT EXISTS recurrence_interval INTEGER,
    ADD COLUMN IF NOT EXISTS recurrence_day_of_week TEXT,
    ADD COLUMN IF NOT EXISTS recurrence_day_of_month INTEGER,
    ADD COLUMN IF NOT EXISTS recurrence_end_date DATE,
    ADD COLUMN IF NOT EXISTS recurrence_parent_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS recurrence_created_from_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_tasks_recurring_user
    ON tasks(user_number, is_recurring, status);

CREATE INDEX IF NOT EXISTS ix_tasks_recurrence_parent
    ON tasks(recurrence_parent_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_tasks_recurrence_created_from
    ON tasks(recurrence_created_from_id)
    WHERE recurrence_created_from_id IS NOT NULL;
