ALTER TABLE message_feedback
ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'New';

ALTER TABLE message_feedback
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;

ALTER TABLE message_feedback
ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS ix_message_feedback_status
ON message_feedback(status);

ALTER TABLE task_priority_decisions
ADD COLUMN IF NOT EXISTS admin_review_status VARCHAR(20) NOT NULL DEFAULT 'New';

ALTER TABLE task_priority_decisions
ADD COLUMN IF NOT EXISTS admin_reviewed_at TIMESTAMP;

ALTER TABLE task_priority_decisions
ADD COLUMN IF NOT EXISTS admin_resolved_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS ix_task_priority_decisions_admin_review_status
ON task_priority_decisions(admin_review_status);
