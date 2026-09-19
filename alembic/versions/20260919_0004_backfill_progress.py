"""Add observable progress to Executive Model updates.

Revision ID: 20260919_0004
Revises: 20260919_0003
"""

from alembic import op
import sqlalchemy as sa


revision = "20260919_0004"
down_revision = "20260919_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "intelligence_backfill_runs",
        sa.Column("progress_percent", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "intelligence_backfill_runs",
        sa.Column("progress_stage", sa.String(length=40), nullable=False, server_default="queued"),
    )
    op.add_column(
        "intelligence_backfill_runs",
        sa.Column("progress_current", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "intelligence_backfill_runs",
        sa.Column("progress_total", sa.Integer(), nullable=False, server_default="0"),
    )
    op.execute(
        sa.text(
            """
            UPDATE intelligence_backfill_runs
            SET status = 'failed',
                error_message = 'The model update was interrupted by a deployment. Your source data was not changed; start the update again.',
                failure_stage = 'deployment_interrupted',
                progress_stage = 'failed',
                completed_at = now()
            WHERE status IN ('queued', 'ingesting', 'synthesizing')
            """
        )
    )


def downgrade() -> None:
    op.drop_column("intelligence_backfill_runs", "progress_total")
    op.drop_column("intelligence_backfill_runs", "progress_current")
    op.drop_column("intelligence_backfill_runs", "progress_stage")
    op.drop_column("intelligence_backfill_runs", "progress_percent")
