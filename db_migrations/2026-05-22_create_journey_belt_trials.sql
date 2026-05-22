-- Journey 2.0 belt trial persistence
-- Run this against the Neon/Postgres database used by production.

CREATE TABLE IF NOT EXISTS journey_belt_trials (
    id SERIAL PRIMARY KEY,
    user_number VARCHAR NOT NULL,
    dimension_id VARCHAR NOT NULL,
    target_belt VARCHAR NOT NULL DEFAULT 'yellow',
    trial_type VARCHAR NOT NULL,
    prompt TEXT NOT NULL,
    response_text TEXT,
    status VARCHAR NOT NULL DEFAULT 'not_started',
    ai_feedback TEXT,
    score INTEGER,
    evidence JSON,
    started_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    submitted_at TIMESTAMP WITHOUT TIME ZONE,
    reviewed_at TIMESTAMP WITHOUT TIME ZONE,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_journey_belt_trials_user
    ON journey_belt_trials (user_number);

CREATE INDEX IF NOT EXISTS idx_journey_belt_trials_dimension
    ON journey_belt_trials (dimension_id);

CREATE INDEX IF NOT EXISTS idx_journey_belt_trials_trial_type
    ON journey_belt_trials (trial_type);

CREATE UNIQUE INDEX IF NOT EXISTS idx_journey_belt_trials_unique_active
    ON journey_belt_trials (user_number, dimension_id, target_belt, trial_type);
