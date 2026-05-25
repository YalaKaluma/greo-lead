-- Belt readiness assessments for Journey 2.0

CREATE TABLE IF NOT EXISTS belt_assessments (
    id SERIAL PRIMARY KEY,
    user_number VARCHAR NOT NULL,
    current_belt VARCHAR NOT NULL,
    target_belt VARCHAR NOT NULL,
    status VARCHAR NOT NULL DEFAULT 'submitted',
    readiness_score INTEGER,
    recommendation VARCHAR,
    assessment_summary TEXT,
    dimension_scores JSONB,
    strengths JSONB,
    growth_edges JSONB,
    domain_feedback JSONB,
    subdomain_feedback JSONB,
    required_next_actions JSONB,
    leadership_profile JSONB,
    wheel_feedback JSONB,
    priority_next_actions JSONB,
    final_coaching_note TEXT,
    alfred_coaching_note TEXT,
    evidence_snapshot JSONB,
    llm_raw_response JSONB,
    accepted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_belt_assessments_user
    ON belt_assessments (user_number);

CREATE INDEX IF NOT EXISTS idx_belt_assessments_belts
    ON belt_assessments (user_number, current_belt, target_belt);

CREATE INDEX IF NOT EXISTS idx_belt_assessments_created
    ON belt_assessments (created_at DESC);
