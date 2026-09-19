"""add intelligence backfill run tracking

Revision ID: 20260919_0002
Revises: 20260919_0001
Create Date: 2026-09-19
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260919_0002"
down_revision: Union[str, None] = "20260919_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "intelligence_backfill_runs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="queued"),
        sa.Column("evidence_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("claims_created", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("source_counts", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("prompt_version", sa.String(length=80), nullable=True),
        sa.Column("model_version", sa.String(length=80), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_intelligence_backfill_runs_user_created", "intelligence_backfill_runs", ["user_id", "created_at"])
    op.create_index("idx_intelligence_backfill_runs_status", "intelligence_backfill_runs", ["status"])
    op.create_index(op.f("ix_intelligence_backfill_runs_id"), "intelligence_backfill_runs", ["id"])
    op.create_index(op.f("ix_intelligence_backfill_runs_user_id"), "intelligence_backfill_runs", ["user_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_intelligence_backfill_runs_user_id"), table_name="intelligence_backfill_runs")
    op.drop_index(op.f("ix_intelligence_backfill_runs_id"), table_name="intelligence_backfill_runs")
    op.drop_index("idx_intelligence_backfill_runs_status", table_name="intelligence_backfill_runs")
    op.drop_index("idx_intelligence_backfill_runs_user_created", table_name="intelligence_backfill_runs")
    op.drop_table("intelligence_backfill_runs")
