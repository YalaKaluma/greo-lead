ALTER TABLE journey_projects ADD COLUMN IF NOT EXISTS client VARCHAR(240);
ALTER TABLE journey_projects ADD COLUMN IF NOT EXISTS role VARCHAR(240);
ALTER TABLE journey_projects ADD COLUMN IF NOT EXISTS objective TEXT;
ALTER TABLE journey_projects ADD COLUMN IF NOT EXISTS timeline VARCHAR(500);
ALTER TABLE journey_projects ADD COLUMN IF NOT EXISTS ai_overview TEXT;
ALTER TABLE journey_projects ADD COLUMN IF NOT EXISTS workplan JSONB;
ALTER TABLE journey_projects ADD COLUMN IF NOT EXISTS in_scope JSONB;
ALTER TABLE journey_projects ADD COLUMN IF NOT EXISTS out_of_scope JSONB;
ALTER TABLE journey_projects ADD COLUMN IF NOT EXISTS deliverables JSONB;
ALTER TABLE journey_projects ADD COLUMN IF NOT EXISTS core_team JSONB;
ALTER TABLE journey_projects ADD COLUMN IF NOT EXISTS client_stakeholders JSONB;
ALTER TABLE journey_projects ADD COLUMN IF NOT EXISTS risks JSONB;
UPDATE journey_projects SET objective = goal WHERE objective IS NULL;

CREATE TABLE IF NOT EXISTS project_documents (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES journey_projects(id) ON DELETE CASCADE,
    user_number VARCHAR NOT NULL,
    filename VARCHAR(300) NOT NULL,
    content_type VARCHAR(120),
    storage_key VARCHAR(500) NOT NULL,
    document_type VARCHAR(80),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_project_documents_project_id ON project_documents(project_id);
CREATE INDEX IF NOT EXISTS ix_project_documents_user_number ON project_documents(user_number);
ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS processing_status VARCHAR(30) NOT NULL DEFAULT 'queued';
ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS processing_error TEXT;
ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS extracted_character_count INTEGER;
ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;
UPDATE project_documents
SET processing_status = 'failed',
    processing_error = 'This file was uploaded before automatic project analysis was enabled. Retry analysis to add its context.'
WHERE processed_at IS NULL AND processing_status = 'queued';
