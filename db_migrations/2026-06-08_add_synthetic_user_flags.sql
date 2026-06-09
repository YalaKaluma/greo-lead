ALTER TABLE users
ADD COLUMN IF NOT EXISTS is_synthetic_user BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS synthetic_user_type VARCHAR;

CREATE INDEX IF NOT EXISTS idx_users_synthetic_type
ON users (is_synthetic_user, synthetic_user_type);
