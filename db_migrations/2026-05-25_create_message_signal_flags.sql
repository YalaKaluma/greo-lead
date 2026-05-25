CREATE TABLE IF NOT EXISTS message_signal_flags (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    source_type VARCHAR NOT NULL,
    signal_type VARCHAR NOT NULL,
    is_met BOOLEAN NOT NULL DEFAULT FALSE,
    confidence_score DOUBLE PRECISION NOT NULL DEFAULT 0,
    evidence_excerpt TEXT,
    reasoning_summary TEXT,
    prompt_version VARCHAR NOT NULL,
    model_version VARCHAR NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_message_signal_flags_message_signal_version
        UNIQUE (message_id, signal_type, prompt_version, model_version)
);

CREATE INDEX IF NOT EXISTS idx_message_signal_flags_user
    ON message_signal_flags (user_id);

CREATE INDEX IF NOT EXISTS idx_message_signal_flags_message
    ON message_signal_flags (message_id);

CREATE INDEX IF NOT EXISTS idx_message_signal_flags_signal
    ON message_signal_flags (signal_type);

CREATE INDEX IF NOT EXISTS idx_message_signal_flags_source
    ON message_signal_flags (source_type);

CREATE INDEX IF NOT EXISTS idx_message_signal_flags_confidence
    ON message_signal_flags (confidence_score);

CREATE INDEX IF NOT EXISTS idx_message_signal_flags_created
    ON message_signal_flags (created_at);
