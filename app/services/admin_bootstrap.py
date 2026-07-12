import logging

from sqlalchemy import text

from app.config import DEFAULT_USER_NUMBER
from app.db import engine


logger = logging.getLogger(__name__)


def ensure_admin_schema_and_seed() -> None:
    """
    Keep Phase 1 admin rollout recoverable on existing databases.

    SQLAlchemy create_all creates missing tables, but it does not add new
    columns to existing tables. This makes the admin fields available and then
    promotes one existing user only when the platform has no admins yet.
    """
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS profession VARCHAR"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS temp_password VARCHAR"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS temp_password_expires TIMESTAMP"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_step VARCHAR DEFAULT 'INITIAL'"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_data JSONB"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status VARCHAR DEFAULT 'TRIAL'"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_start_date TIMESTAMP"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_end_date TIMESTAMP"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_end_date TIMESTAMP"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS tour_completed BOOLEAN DEFAULT FALSE"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS tour_current_step VARCHAR"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS language_preference VARCHAR(10) NOT NULL DEFAULT 'en'"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone_preference VARCHAR(64) NOT NULL DEFAULT 'America/New_York'"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS tour_completed_steps JSONB"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP DEFAULT NOW()"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()"))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS admin_audit_logs (
                id SERIAL PRIMARY KEY,
                admin_user_id INTEGER NOT NULL REFERENCES users(id),
                target_user_id INTEGER NULL REFERENCES users(id),
                action VARCHAR NOT NULL,
                metadata JSONB,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin_user ON admin_audit_logs(admin_user_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_target_user ON admin_audit_logs(target_user_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action ON admin_audit_logs(action)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON admin_audit_logs(created_at)"))
        conn.execute(text("ALTER TABLE message_feedback ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'New'"))
        conn.execute(text("ALTER TABLE message_feedback ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP"))
        conn.execute(text("ALTER TABLE message_feedback ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_message_feedback_status ON message_feedback(status)"))
        conn.execute(text("ALTER TABLE task_priority_decisions ADD COLUMN IF NOT EXISTS admin_review_status VARCHAR(20) NOT NULL DEFAULT 'New'"))
        conn.execute(text("ALTER TABLE task_priority_decisions ADD COLUMN IF NOT EXISTS admin_reviewed_at TIMESTAMP"))
        conn.execute(text("ALTER TABLE task_priority_decisions ADD COLUMN IF NOT EXISTS admin_resolved_at TIMESTAMP"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_task_priority_decisions_admin_review_status ON task_priority_decisions(admin_review_status)"))
        conn.execute(text("ALTER TABLE journey_people ADD COLUMN IF NOT EXISTS mission_statement TEXT"))
        conn.execute(text("ALTER TABLE journey_people ADD COLUMN IF NOT EXISTS meeting_notes JSONB DEFAULT '[]'::jsonb"))
        conn.execute(text("UPDATE journey_people SET meeting_notes = '[]'::jsonb WHERE meeting_notes IS NULL"))
        for column_sql in [
            "organization VARCHAR",
            "team VARCHAR",
            "manager_name VARCHAR",
            "circle_type VARCHAR",
            "strategic_importance VARCHAR",
            "last_interaction_at TIMESTAMP",
            "next_action TEXT",
            "current_goals TEXT",
            "development_plan TEXT",
            "stretch_assignments TEXT",
            "coaching_focus TEXT",
            "performance_indicator VARCHAR",
            "potential_indicator VARCHAR",
            "stakeholder_mission TEXT",
            "stakeholder_priorities TEXT",
            "success_metrics TEXT",
            "stakeholder_strengths TEXT",
            "risks_or_pressures TEXT",
            "stakeholder_aspirations TEXT",
            "how_i_create_value TEXT",
            "mission_alignment TEXT",
            "potential_tensions TEXT",
            "relationship_strategy VARCHAR",
        ]:
            conn.execute(text(f"ALTER TABLE journey_people ADD COLUMN IF NOT EXISTS {column_sql}"))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS usage_events (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                event_type VARCHAR(80) NOT NULL,
                page VARCHAR(80),
                feature VARCHAR(120),
                metadata_json JSONB,
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_usage_events_user_created ON usage_events(user_id, created_at)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_usage_events_type_created ON usage_events(event_type, created_at)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_usage_events_page_created ON usage_events(page, created_at)"))
        conn.execute(text("""
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
            )
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_system_health_events_type_created ON system_health_events(event_type, created_at)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_system_health_events_status_created ON system_health_events(status_code, created_at)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_system_health_events_path_created ON system_health_events(path, created_at)"))
        conn.execute(text("ALTER TABLE system_health_events ADD COLUMN IF NOT EXISTS environment VARCHAR(80)"))
        conn.execute(text("ALTER TABLE system_health_events ADD COLUMN IF NOT EXISTS category VARCHAR(80)"))
        conn.execute(text("ALTER TABLE system_health_events ADD COLUMN IF NOT EXISTS details_json JSONB"))
        conn.execute(text("ALTER TABLE system_health_events ADD COLUMN IF NOT EXISTS stack_trace TEXT"))
        conn.execute(text("ALTER TABLE system_health_events ADD COLUMN IF NOT EXISTS endpoint VARCHAR(240)"))
        conn.execute(text("ALTER TABLE system_health_events ADD COLUMN IF NOT EXISTS user_number VARCHAR(80)"))
        conn.execute(text("ALTER TABLE system_health_events ADD COLUMN IF NOT EXISTS request_id VARCHAR(120)"))
        conn.execute(text("ALTER TABLE system_health_events ADD COLUMN IF NOT EXISTS release_version VARCHAR(120)"))
        conn.execute(text("ALTER TABLE system_health_events ADD COLUMN IF NOT EXISTS job_name VARCHAR(120)"))
        conn.execute(text("ALTER TABLE system_health_events ADD COLUMN IF NOT EXISTS dedupe_key VARCHAR(500)"))
        conn.execute(text("ALTER TABLE system_health_events ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMP NOT NULL DEFAULT NOW()"))
        conn.execute(text("ALTER TABLE system_health_events ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP NOT NULL DEFAULT NOW()"))
        conn.execute(text("ALTER TABLE system_health_events ADD COLUMN IF NOT EXISTS occurrence_count INTEGER NOT NULL DEFAULT 1"))
        conn.execute(text("ALTER TABLE system_health_events ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP"))
        conn.execute(text("ALTER TABLE system_health_events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW()"))
        conn.execute(text("UPDATE system_health_events SET category = COALESCE(category, event_type), endpoint = COALESCE(endpoint, path), first_seen_at = COALESCE(first_seen_at, created_at, NOW()), last_seen_at = COALESCE(last_seen_at, created_at, NOW()), updated_at = COALESCE(updated_at, created_at, NOW())"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_system_health_events_dedupe ON system_health_events(dedupe_key)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_system_health_events_category_last_seen ON system_health_events(category, last_seen_at)"))
        conn.execute(text("""
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
            )
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_operations_issue_drafts_status_created ON operations_issue_drafts(status, created_at)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_operations_issue_drafts_category_created ON operations_issue_drafts(category, created_at)"))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS admin_ai_briefings (
                id SERIAL PRIMARY KEY,
                briefing_type VARCHAR(40) NOT NULL,
                admin_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                title VARCHAR(160) NOT NULL,
                summary_text TEXT NOT NULL,
                top_recommendations JSONB,
                source_snapshot JSONB,
                model VARCHAR(80),
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_admin_ai_briefings_type_created ON admin_ai_briefings(briefing_type, created_at)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_admin_ai_briefings_admin_created ON admin_ai_briefings(admin_user_id, created_at)"))
        conn.execute(text("ALTER TABLE admin_ai_briefings ADD COLUMN IF NOT EXISTS codex_brief TEXT"))

        admin_count = conn.execute(text("SELECT COUNT(*) FROM users WHERE is_admin = TRUE")).scalar() or 0
        if admin_count > 0:
            return

        promoted = 0
        if DEFAULT_USER_NUMBER:
            result = conn.execute(
                text("""
                    UPDATE users
                    SET is_admin = TRUE, is_active = TRUE
                    WHERE phone_number = :identifier OR email = :identifier
                """),
                {"identifier": DEFAULT_USER_NUMBER},
            )
            promoted = result.rowcount or 0

        if promoted == 0:
            result = conn.execute(text("""
                UPDATE users
                SET is_admin = TRUE, is_active = TRUE
                WHERE id = (
                    SELECT id
                    FROM users
                    ORDER BY created_at ASC NULLS LAST, id ASC
                    LIMIT 1
                )
            """))
            promoted = result.rowcount or 0

        if promoted:
            logger.info("Admin bootstrap promoted an initial admin user.")
        else:
            logger.warning("Admin bootstrap found no users to promote.")
