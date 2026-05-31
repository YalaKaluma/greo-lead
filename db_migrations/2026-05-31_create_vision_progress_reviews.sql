CREATE TABLE IF NOT EXISTS vision_progress_reviews (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_number VARCHAR NOT NULL,
    vision_id INTEGER NOT NULL REFERENCES journey_goals(id) ON DELETE CASCADE,
    review_period_start TIMESTAMP NOT NULL,
    review_period_end TIMESTAMP NOT NULL,
    status VARCHAR NOT NULL,
    executive_summary TEXT NOT NULL,
    key_wins JSONB,
    key_risks JSONB,
    recommended_focus TEXT,
    mtn_actions JSONB,
    health_scores JSONB,
    raw_context JSONB,
    raw_llm_response JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_vision_progress_reviews_user_vision_created
    ON vision_progress_reviews(user_number, vision_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_vision_progress_reviews_user_id
    ON vision_progress_reviews(user_id);
