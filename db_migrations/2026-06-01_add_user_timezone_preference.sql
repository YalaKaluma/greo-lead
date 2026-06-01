ALTER TABLE users
ADD COLUMN IF NOT EXISTS timezone_preference VARCHAR(64) NOT NULL DEFAULT 'America/New_York';
