CREATE TABLE IF NOT EXISTS journey_goal_values (
    id SERIAL PRIMARY KEY,
    user_number VARCHAR NOT NULL,
    goal_id INTEGER NOT NULL REFERENCES journey_goals(id) ON DELETE CASCADE,
    value_id INTEGER NOT NULL REFERENCES journey_values(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_journey_goal_values_goal_value UNIQUE (goal_id, value_id)
);

CREATE INDEX IF NOT EXISTS ix_journey_goal_values_goal
    ON journey_goal_values(goal_id);

CREATE INDEX IF NOT EXISTS ix_journey_goal_values_value
    ON journey_goal_values(value_id);

CREATE INDEX IF NOT EXISTS ix_journey_goal_values_user
    ON journey_goal_values(user_number);
