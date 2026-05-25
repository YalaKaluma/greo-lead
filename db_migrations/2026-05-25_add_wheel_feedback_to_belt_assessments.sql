-- Add richer wheel-based assessment fields.

ALTER TABLE belt_assessments
    ADD COLUMN IF NOT EXISTS leadership_profile JSONB,
    ADD COLUMN IF NOT EXISTS wheel_feedback JSONB,
    ADD COLUMN IF NOT EXISTS priority_next_actions JSONB,
    ADD COLUMN IF NOT EXISTS alfred_coaching_note TEXT;
