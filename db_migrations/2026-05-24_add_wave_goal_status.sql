ALTER TABLE wave_goals
    ADD COLUMN IF NOT EXISTS status VARCHAR NOT NULL DEFAULT 'ongoing';

ALTER TABLE wave_goals
    DROP CONSTRAINT IF EXISTS ck_wave_goals_status;

ALTER TABLE wave_goals
    ADD CONSTRAINT ck_wave_goals_status
    CHECK (status IN ('done', 'ongoing', 'at_risk', 'blocked'));
