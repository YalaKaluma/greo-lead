ALTER TABLE system_health_events ADD COLUMN IF NOT EXISTS environment VARCHAR(80);
ALTER TABLE system_health_events ADD COLUMN IF NOT EXISTS category VARCHAR(80);
ALTER TABLE system_health_events ADD COLUMN IF NOT EXISTS details_json JSONB;
ALTER TABLE system_health_events ADD COLUMN IF NOT EXISTS stack_trace TEXT;
ALTER TABLE system_health_events ADD COLUMN IF NOT EXISTS endpoint VARCHAR(240);
ALTER TABLE system_health_events ADD COLUMN IF NOT EXISTS user_number VARCHAR(80);
ALTER TABLE system_health_events ADD COLUMN IF NOT EXISTS request_id VARCHAR(120);
ALTER TABLE system_health_events ADD COLUMN IF NOT EXISTS release_version VARCHAR(120);
ALTER TABLE system_health_events ADD COLUMN IF NOT EXISTS job_name VARCHAR(120);
ALTER TABLE system_health_events ADD COLUMN IF NOT EXISTS dedupe_key VARCHAR(500);
ALTER TABLE system_health_events ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMP NOT NULL DEFAULT NOW();
ALTER TABLE system_health_events ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP NOT NULL DEFAULT NOW();
ALTER TABLE system_health_events ADD COLUMN IF NOT EXISTS occurrence_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE system_health_events ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP;
ALTER TABLE system_health_events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();

UPDATE system_health_events
SET
    category = COALESCE(category, event_type),
    endpoint = COALESCE(endpoint, path),
    first_seen_at = COALESCE(first_seen_at, created_at, NOW()),
    last_seen_at = COALESCE(last_seen_at, created_at, NOW()),
    updated_at = COALESCE(updated_at, created_at, NOW());

CREATE INDEX IF NOT EXISTS idx_system_health_events_dedupe
ON system_health_events(dedupe_key);

CREATE INDEX IF NOT EXISTS idx_system_health_events_category_last_seen
ON system_health_events(category, last_seen_at);

CREATE TABLE IF NOT EXISTS operations_issue_drafts (
    id SERIAL PRIMARY KEY,
    title VARCHAR(220) NOT NULL,
    summary TEXT NOT NULL,
    severity VARCHAR(20) NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'draft',
    environment VARCHAR(80),
    category VARCHAR(80),
    source_event_ids JSONB,
    evidence_json JSONB,
    suspected_root_cause TEXT,
    recommended_action TEXT,
    codex_brief_markdown TEXT NOT NULL,
    github_labels_json JSONB,
    github_issue_number INTEGER,
    github_issue_url TEXT,
    created_by_agent VARCHAR(80) NOT NULL DEFAULT 'operations_director',
    reviewed_by VARCHAR(160),
    reviewed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operations_issue_drafts_status_created
ON operations_issue_drafts(status, created_at);

CREATE INDEX IF NOT EXISTS idx_operations_issue_drafts_category_created
ON operations_issue_drafts(category, created_at);
