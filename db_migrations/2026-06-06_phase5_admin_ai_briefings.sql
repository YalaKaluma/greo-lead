CREATE TABLE IF NOT EXISTS admin_ai_briefings (
    id SERIAL PRIMARY KEY,
    briefing_type VARCHAR(40) NOT NULL,
    admin_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    title VARCHAR(160) NOT NULL,
    summary_text TEXT NOT NULL,
    codex_brief TEXT,
    top_recommendations JSONB,
    source_snapshot JSONB,
    model VARCHAR(80),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_ai_briefings_type_created
ON admin_ai_briefings(briefing_type, created_at);

CREATE INDEX IF NOT EXISTS idx_admin_ai_briefings_admin_created
ON admin_ai_briefings(admin_user_id, created_at);

ALTER TABLE admin_ai_briefings
ADD COLUMN IF NOT EXISTS codex_brief TEXT;
