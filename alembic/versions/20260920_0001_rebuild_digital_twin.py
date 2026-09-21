"""Replace the legacy belief model with Digital Twin snapshots.

Revision ID: 20260920_0001
Revises: 20260919_0006

The migration is intentionally non-destructive. Each authenticated user's old
derived intelligence is cleared only when they start their first v1 rebuild.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260920_0001"
down_revision = "20260919_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "intelligence_twin_snapshots",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("core_twin", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("prompt_version", sa.String(length=80), nullable=False),
        sa.Column("model_version", sa.String(length=80), nullable=False),
        sa.Column("is_current", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_intelligence_twin_snapshots_id"), "intelligence_twin_snapshots", ["id"])
    op.create_index(op.f("ix_intelligence_twin_snapshots_user_id"), "intelligence_twin_snapshots", ["user_id"])
    op.create_index(op.f("ix_intelligence_twin_snapshots_is_current"), "intelligence_twin_snapshots", ["is_current"])
    op.create_index(
        "idx_intelligence_twin_snapshots_user_current",
        "intelligence_twin_snapshots",
        ["user_id", "is_current"],
    )
    op.create_index(
        "idx_intelligence_twin_snapshots_user_created",
        "intelligence_twin_snapshots",
        ["user_id", "created_at"],
    )
def downgrade() -> None:
    op.drop_index("idx_intelligence_twin_snapshots_user_created", table_name="intelligence_twin_snapshots")
    op.drop_index("idx_intelligence_twin_snapshots_user_current", table_name="intelligence_twin_snapshots")
    op.drop_index(op.f("ix_intelligence_twin_snapshots_is_current"), table_name="intelligence_twin_snapshots")
    op.drop_index(op.f("ix_intelligence_twin_snapshots_user_id"), table_name="intelligence_twin_snapshots")
    op.drop_index(op.f("ix_intelligence_twin_snapshots_id"), table_name="intelligence_twin_snapshots")
    op.drop_table("intelligence_twin_snapshots")
