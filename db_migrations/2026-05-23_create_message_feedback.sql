CREATE TABLE IF NOT EXISTS message_feedback (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    message_id INTEGER NOT NULL REFERENCES messages(id),
    source_context VARCHAR(50) NOT NULL,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    feedback_text TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_message_feedback_message_id
    ON message_feedback(message_id);

CREATE INDEX IF NOT EXISTS ix_message_feedback_source_context
    ON message_feedback(source_context);
