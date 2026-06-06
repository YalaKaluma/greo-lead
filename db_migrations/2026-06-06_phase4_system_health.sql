CREATE TABLE IF NOT EXISTS system_health_events (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(80) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'info',
    source VARCHAR(80),
    path VARCHAR(240),
    method VARCHAR(12),
    status_code INTEGER,
    response_time_ms INTEGER,
    message TEXT,
    metadata_json JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_health_events_type_created
ON system_health_events(event_type, created_at);

CREATE INDEX IF NOT EXISTS idx_system_health_events_status_created
ON system_health_events(status_code, created_at);

CREATE INDEX IF NOT EXISTS idx_system_health_events_path_created
ON system_health_events(path, created_at);
