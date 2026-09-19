"""Make Executive Model backfills resumable and detect stalled workers.

Revision ID: 20260919_0005
Revises: 20260919_0004
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260919_0005"
down_revision = "20260919_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "intelligence_backfill_runs",
        sa.Column("heartbeat_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "intelligence_backfill_runs",
        sa.Column("checkpoint_data", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column(
        "intelligence_backfill_runs",
        sa.Column("activity_log", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.execute(
        sa.text(
            """
            UPDATE intelligence_backfill_runs
            SET status = 'failed',
                error_message = 'The model update stopped before it completed. Retry to resume safely; your source data was not changed.',
                failure_stage = 'worker_interrupted',
                progress_stage = 'failed',
                completed_at = now()
            WHERE status IN ('queued', 'ingesting', 'synthesizing')
            """
        )
    )


def downgrade() -> None:
    op.drop_column("intelligence_backfill_runs", "activity_log")
    op.drop_column("intelligence_backfill_runs", "checkpoint_data")
    op.drop_column("intelligence_backfill_runs", "heartbeat_at")
