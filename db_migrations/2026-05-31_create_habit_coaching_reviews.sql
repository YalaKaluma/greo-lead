CREATE TABLE IF NOT EXISTS habit_coaching_reviews (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_number VARCHAR NOT NULL,
    review_period_start TIMESTAMP NOT NULL,
    review_period_end TIMESTAMP NOT NULL,
    status VARCHAR NOT NULL,
    executive_summary TEXT NOT NULL,
    what_changed TEXT,
    key_wins JSONB,
    watchouts JSONB,
    top_habits JSONB,
    habits_needing_attention JSONB,
    recommended_focus TEXT,
    mtn_actions JSONB,
    raw_context JSONB,
    raw_llm_response JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_habit_coaching_reviews_user_created
    ON habit_coaching_reviews(user_number, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_habit_coaching_reviews_user_id
    ON habit_coaching_reviews(user_id);
