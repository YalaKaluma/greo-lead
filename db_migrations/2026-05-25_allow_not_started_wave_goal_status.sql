-- Allow roadmap outcomes to explicitly be not started.

ALTER TABLE wave_goals
    ALTER COLUMN status SET DEFAULT 'not_started';

ALTER TABLE wave_goals
    DROP CONSTRAINT IF EXISTS ck_wave_goals_status;

ALTER TABLE wave_goals
    ADD CONSTRAINT ck_wave_goals_status
    CHECK (status IN ('not_started', 'done', 'ongoing', 'at_risk', 'blocked'));
