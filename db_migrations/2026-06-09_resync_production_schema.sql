-- Resync production schema with the current application model.
-- This migration is intentionally idempotent so it can be used to converge
-- production, development, and restore/test Neon branches safely.

ALTER TABLE users
ADD COLUMN IF NOT EXISTS is_synthetic_user BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS synthetic_user_type VARCHAR;

CREATE INDEX IF NOT EXISTS idx_users_synthetic_type
ON users (is_synthetic_user, synthetic_user_type);

ALTER TABLE journey_energy_drains
ADD COLUMN IF NOT EXISTS mitigation TEXT;

ALTER TABLE journey_execution_systems
ADD COLUMN IF NOT EXISTS effectiveness VARCHAR;

ALTER TABLE journey_inspiration
ADD COLUMN IF NOT EXISTS approach TEXT;

ALTER TABLE journey_inspiration
ADD COLUMN IF NOT EXISTS effectiveness VARCHAR;

ALTER TABLE journey_coaching_moments
ADD COLUMN IF NOT EXISTS outcome TEXT;

ALTER TABLE journey_coaching_moments
ADD COLUMN IF NOT EXISTS learning TEXT;

ALTER TABLE journey_team_composition
ADD COLUMN IF NOT EXISTS dynamics TEXT;

ALTER TABLE journey_procrastination_patterns
ADD COLUMN IF NOT EXISTS underlying_reason TEXT;

ALTER TABLE journey_procrastination_patterns
ADD COLUMN IF NOT EXISTS strategy TEXT;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'journey_procrastination_patterns'
          AND column_name = 'trigger_text'
    ) THEN
        UPDATE journey_procrastination_patterns
        SET underlying_reason = COALESCE(underlying_reason, trigger_text)
        WHERE underlying_reason IS NULL
          AND trigger_text IS NOT NULL;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'journey_procrastination_patterns'
          AND column_name = 'trigger'
    ) THEN
        UPDATE journey_procrastination_patterns
        SET underlying_reason = COALESCE(underlying_reason, trigger)
        WHERE underlying_reason IS NULL
          AND trigger IS NOT NULL;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'journey_procrastination_patterns'
          AND column_name = 'mitigation'
    ) THEN
        UPDATE journey_procrastination_patterns
        SET strategy = COALESCE(strategy, mitigation)
        WHERE strategy IS NULL
          AND mitigation IS NOT NULL;
    END IF;
END $$;

ALTER TABLE journey_procrastination_patterns
DROP COLUMN IF EXISTS trigger_text;

ALTER TABLE journey_procrastination_patterns
DROP COLUMN IF EXISTS trigger;

ALTER TABLE journey_procrastination_patterns
DROP COLUMN IF EXISTS mitigation;
