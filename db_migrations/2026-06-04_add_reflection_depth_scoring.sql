ALTER TABLE journal_entries
ADD COLUMN IF NOT EXISTS reflection_depth_score DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS reflection_depth_level INTEGER,
ADD COLUMN IF NOT EXISTS reflection_depth_label VARCHAR,
ADD COLUMN IF NOT EXISTS reflection_depth_explanation TEXT,
ADD COLUMN IF NOT EXISTS reflection_depth_recommendations JSON,
ADD COLUMN IF NOT EXISTS reflection_depth_scored_at TIMESTAMP;

ALTER TABLE messages
ADD COLUMN IF NOT EXISTS reflection_depth_score DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS reflection_depth_level INTEGER,
ADD COLUMN IF NOT EXISTS reflection_depth_label VARCHAR,
ADD COLUMN IF NOT EXISTS reflection_depth_explanation TEXT,
ADD COLUMN IF NOT EXISTS reflection_depth_recommendations JSON,
ADD COLUMN IF NOT EXISTS reflection_depth_scored_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_messages_reflection_depth_user
ON messages (user_number, sender, reflection_depth_score, timestamp);
