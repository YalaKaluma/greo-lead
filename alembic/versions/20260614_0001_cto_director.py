"""Add CTO Director reviews and findings.

Revision ID: 20260614_0001
Revises: 20260609_0001
Create Date: 2026-06-14
"""

from typing import Sequence, Union

from alembic import op


revision: str = "20260614_0001"
down_revision: Union[str, None] = "20260609_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
    CREATE TABLE IF NOT EXISTS cto_reviews (
        id SERIAL PRIMARY KEY,
        environment VARCHAR(80),
        review_type VARCHAR(40) NOT NULL DEFAULT 'manual',
        status VARCHAR(40) NOT NULL DEFAULT 'running',
        architecture_score INTEGER,
        security_score INTEGER,
        maintainability_score INTEGER,
        test_coverage_score INTEGER,
        release_readiness_score INTEGER,
        summary TEXT,
        top_risks_json JSONB,
        recommendations_json JSONB,
        source_snapshot_json JSONB,
        started_at TIMESTAMP NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_cto_reviews_status_created ON cto_reviews(status, created_at);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_cto_reviews_environment_created ON cto_reviews(environment, created_at);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_cto_reviews_environment ON cto_reviews(environment);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_cto_reviews_review_type ON cto_reviews(review_type);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_cto_reviews_status ON cto_reviews(status);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_cto_reviews_created_at ON cto_reviews(created_at);")

    op.execute("""
    CREATE TABLE IF NOT EXISTS cto_findings (
        id SERIAL PRIMARY KEY,
        cto_review_id INTEGER REFERENCES cto_reviews(id) ON DELETE CASCADE,
        category VARCHAR(40) NOT NULL,
        severity VARCHAR(20) NOT NULL,
        title VARCHAR(220) NOT NULL,
        summary TEXT NOT NULL,
        evidence_json JSONB,
        affected_files_json JSONB,
        affected_modules_json JSONB,
        risk_explanation TEXT,
        recommended_action TEXT,
        codex_brief_markdown TEXT NOT NULL,
        confidence VARCHAR(20),
        status VARCHAR(40) NOT NULL DEFAULT 'open',
        github_labels_json JSONB,
        github_issue_number INTEGER,
        github_issue_url TEXT,
        reviewed_by VARCHAR(160),
        reviewed_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_cto_findings_status_created ON cto_findings(status, created_at);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_cto_findings_category_created ON cto_findings(category, created_at);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_cto_findings_severity_created ON cto_findings(severity, created_at);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_cto_findings_cto_review_id ON cto_findings(cto_review_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_cto_findings_category ON cto_findings(category);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_cto_findings_severity ON cto_findings(severity);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_cto_findings_status ON cto_findings(status);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_cto_findings_created_at ON cto_findings(created_at);")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_cto_findings_created_at;")
    op.execute("DROP INDEX IF EXISTS ix_cto_findings_status;")
    op.execute("DROP INDEX IF EXISTS ix_cto_findings_severity;")
    op.execute("DROP INDEX IF EXISTS ix_cto_findings_category;")
    op.execute("DROP INDEX IF EXISTS ix_cto_findings_cto_review_id;")
    op.execute("DROP INDEX IF EXISTS idx_cto_findings_severity_created;")
    op.execute("DROP INDEX IF EXISTS idx_cto_findings_category_created;")
    op.execute("DROP INDEX IF EXISTS idx_cto_findings_status_created;")
    op.execute("DROP TABLE IF EXISTS cto_findings;")

    op.execute("DROP INDEX IF EXISTS ix_cto_reviews_created_at;")
    op.execute("DROP INDEX IF EXISTS ix_cto_reviews_status;")
    op.execute("DROP INDEX IF EXISTS ix_cto_reviews_review_type;")
    op.execute("DROP INDEX IF EXISTS ix_cto_reviews_environment;")
    op.execute("DROP INDEX IF EXISTS idx_cto_reviews_environment_created;")
    op.execute("DROP INDEX IF EXISTS idx_cto_reviews_status_created;")
    op.execute("DROP TABLE IF EXISTS cto_reviews;")
