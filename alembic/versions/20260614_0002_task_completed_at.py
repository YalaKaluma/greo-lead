"""Add task completed_at timestamp.

Revision ID: 20260614_0002
Revises: 20260614_0001
Create Date: 2026-06-14
"""

from typing import Sequence, Union

from alembic import op


revision: str = "20260614_0002"
down_revision: Union[str, None] = "20260614_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;")
    op.execute("""
    UPDATE tasks
    SET completed_at = updated_at
    WHERE status = 'completed'
      AND completed_at IS NULL;
    """)
    op.execute("""
    CREATE INDEX IF NOT EXISTS ix_tasks_user_status_completed_at
        ON tasks(user_number, status, completed_at);
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_tasks_user_status_completed_at;")
    op.execute("ALTER TABLE tasks DROP COLUMN IF EXISTS completed_at;")
