CREATE TABLE IF NOT EXISTS opportunity_suggestions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    surface TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    rationale TEXT,
    domain TEXT,
    linked_goal_id INTEGER REFERENCES journey_goals(id) ON DELETE SET NULL,
    mtn_score NUMERIC,
    status TEXT DEFAULT 'suggested',
    generated_context JSONB,
    scoring_details JSONB,
    created_task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
    user_feedback TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS originating_opportunity_id INTEGER REFERENCES opportunity_suggestions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_opportunity_suggestions_user_surface
    ON opportunity_suggestions(user_id, surface, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_opportunity_suggestions_status
    ON opportunity_suggestions(user_id, status, created_at DESC);
