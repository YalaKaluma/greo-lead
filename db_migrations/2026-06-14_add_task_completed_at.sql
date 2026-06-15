-- Preserve the actual task completion date separately from later edits.

ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;

UPDATE tasks
SET completed_at = updated_at
WHERE status = 'completed'
  AND completed_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_tasks_user_status_completed_at
    ON tasks(user_number, status, completed_at);
