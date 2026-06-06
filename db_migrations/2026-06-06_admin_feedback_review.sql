ALTER TABLE message_feedback
ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'New';

ALTER TABLE message_feedback
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;

ALTER TABLE message_feedback
ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS ix_message_feedback_status
ON message_feedback(status);
