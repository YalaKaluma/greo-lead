CREATE TABLE IF NOT EXISTS usage_events (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    event_type VARCHAR(80) NOT NULL,
    page VARCHAR(80),
    feature VARCHAR(120),
    metadata_json JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_events_user_created
ON usage_events(user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_usage_events_type_created
ON usage_events(event_type, created_at);

CREATE INDEX IF NOT EXISTS idx_usage_events_page_created
ON usage_events(page, created_at);
