ALTER TABLE journey_people
    ADD COLUMN IF NOT EXISTS strengths TEXT,
    ADD COLUMN IF NOT EXISTS growth_areas TEXT,
    ADD COLUMN IF NOT EXISTS aspirations TEXT;
