ALTER TABLE meeting_action_items
ADD COLUMN IF NOT EXISTS ignored_at TIMESTAMPTZ;
