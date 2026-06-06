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
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP"))
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
