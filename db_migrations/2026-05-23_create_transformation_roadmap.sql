CREATE TABLE IF NOT EXISTS vision_roadmap_waves (
    id SERIAL PRIMARY KEY,
    user_number VARCHAR NOT NULL,
    vision_goal_id INTEGER NOT NULL REFERENCES journey_goals(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    sequence_order INTEGER NOT NULL DEFAULT 0,
    status VARCHAR NOT NULL DEFAULT 'not_started',
    target_start_date DATE,
    target_end_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_vision_roadmap_wave_status CHECK (status IN ('not_started', 'active', 'completed'))
);

CREATE INDEX IF NOT EXISTS idx_vision_roadmap_waves_user
    ON vision_roadmap_waves (user_number);

CREATE INDEX IF NOT EXISTS idx_vision_roadmap_waves_vision
    ON vision_roadmap_waves (vision_goal_id);

CREATE TABLE IF NOT EXISTS wave_goals (
    id SERIAL PRIMARY KEY,
    wave_id INTEGER NOT NULL REFERENCES vision_roadmap_waves(id) ON DELETE CASCADE,
    goal_id INTEGER NOT NULL REFERENCES journey_goals(id) ON DELETE CASCADE,
    sequence_order INTEGER NOT NULL DEFAULT 0,
    status VARCHAR NOT NULL DEFAULT 'not_started',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_wave_goals_status CHECK (status IN ('not_started', 'done', 'ongoing', 'at_risk', 'blocked')),
    CONSTRAINT uq_wave_goals_wave_goal UNIQUE (wave_id, goal_id)
);

CREATE INDEX IF NOT EXISTS idx_wave_goals_wave
    ON wave_goals (wave_id);

CREATE INDEX IF NOT EXISTS idx_wave_goals_goal
    ON wave_goals (goal_id);
