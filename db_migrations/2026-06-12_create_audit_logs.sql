CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    event_type VARCHAR(80) NOT NULL,
    object_type VARCHAR(80),
    object_id VARCHAR(120),
    metadata_json JSONB,
    ip_address VARCHAR(64),
    user_agent TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created
    ON audit_logs(user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_audit_logs_event_created
    ON audit_logs(event_type, created_at);

CREATE INDEX IF NOT EXISTS idx_audit_logs_object
    ON audit_logs(object_type, object_id);
