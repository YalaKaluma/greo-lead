ALTER TABLE journey_goals
ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

UPDATE journey_goals
SET sort_order = 0
WHERE sort_order IS NULL;
