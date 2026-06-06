CREATE TABLE IF NOT EXISTS daily_energy_checkins (
    id SERIAL PRIMARY KEY,
    user_number VARCHAR NOT NULL,
    date DATE NOT NULL,
    energy_level INTEGER NOT NULL,
    source VARCHAR NOT NULL DEFAULT 'evening_nudge',
    message_id INTEGER NULL REFERENCES messages(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_daily_energy_checkins_energy_level CHECK (energy_level BETWEEN 1 AND 5),
    CONSTRAINT uq_daily_energy_checkins_user_date UNIQUE (user_number, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_energy_checkins_user_date
    ON daily_energy_checkins (user_number, date);

CREATE INDEX IF NOT EXISTS ix_daily_energy_checkins_user_number
    ON daily_energy_checkins (user_number);
