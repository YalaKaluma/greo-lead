CREATE TABLE IF NOT EXISTS meetings (
    id SERIAL PRIMARY KEY,
    user_number VARCHAR NOT NULL,
    title VARCHAR(240) NOT NULL DEFAULT 'Untitled meeting',
    source_type VARCHAR(30) NOT NULL,
    processing_status VARCHAR(30) NOT NULL DEFAULT 'queued',
    processing_error TEXT,
    meeting_type VARCHAR(80),
    started_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    executive_summary TEXT,
    one_line_summary TEXT,
    transcript_text TEXT,
    user_notes TEXT,
    recording_filename VARCHAR(300),
    recording_content_type VARCHAR(120),
    recording_storage_key VARCHAR(500),
    consent_acknowledged_at TIMESTAMPTZ,
    prompt_version VARCHAR(40),
    model_version VARCHAR(80),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_meetings_user_started ON meetings(user_number, started_at);
CREATE INDEX IF NOT EXISTS idx_meetings_user_status ON meetings(user_number, processing_status);

CREATE TABLE IF NOT EXISTS meeting_participants (
    id SERIAL PRIMARY KEY,
    meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    person_id INTEGER REFERENCES journey_people(id) ON DELETE SET NULL,
    display_name VARCHAR(200) NOT NULL,
    speaker_label VARCHAR(80),
    match_status VARCHAR(30) NOT NULL DEFAULT 'unmatched',
    is_current_user BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_meeting_speaker_label UNIQUE(meeting_id, speaker_label)
);
CREATE INDEX IF NOT EXISTS idx_meeting_participants_meeting ON meeting_participants(meeting_id);
ALTER TABLE meeting_participants ADD COLUMN IF NOT EXISTS is_current_user BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS meeting_transcript_segments (
    id SERIAL PRIMARY KEY,
    meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    sequence_number INTEGER NOT NULL,
    speaker_label VARCHAR(80),
    start_seconds DOUBLE PRECISION,
    end_seconds DOUBLE PRECISION,
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_meeting_segments_meeting ON meeting_transcript_segments(meeting_id);

CREATE TABLE IF NOT EXISTS meeting_topics (
    id SERIAL PRIMARY KEY,
    meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    title VARCHAR(240) NOT NULL,
    summary TEXT,
    sequence_number INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meeting_decisions (
    id SERIAL PRIMARY KEY,
    meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    confidence DOUBLE PRECISION,
    evidence_excerpt TEXT,
    transcript_segment_id INTEGER REFERENCES meeting_transcript_segments(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meeting_action_items (
    id SERIAL PRIMARY KEY,
    meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    owner_name VARCHAR(200),
    due_date DATE,
    confidence DOUBLE PRECISION,
    evidence_excerpt TEXT,
    transcript_segment_id INTEGER REFERENCES meeting_transcript_segments(id) ON DELETE SET NULL,
    created_task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
    tracking_mode VARCHAR(30),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meeting_leadership_observations (
    id SERIAL PRIMARY KEY,
    meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    category VARCHAR(100) NOT NULL,
    observation TEXT NOT NULL,
    confidence DOUBLE PRECISION,
    evidence_excerpt TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meeting_goal_links (
    id SERIAL PRIMARY KEY,
    meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    goal_id INTEGER NOT NULL REFERENCES journey_goals(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_meeting_goal_link UNIQUE(meeting_id, goal_id)
);

CREATE TABLE IF NOT EXISTS meeting_project_links (
    id SERIAL PRIMARY KEY,
    meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    project_id INTEGER NOT NULL REFERENCES journey_projects(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_meeting_project_link UNIQUE(meeting_id, project_id)
);
