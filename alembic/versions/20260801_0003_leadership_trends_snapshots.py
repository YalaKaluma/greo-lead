"""Store generated leadership trends snapshots.

Revision ID: 20260801_0003
Revises: 20260801_0002
"""

from alembic import op
import sqlalchemy as sa


revision = "20260801_0003"
down_revision = "20260801_0002"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "leadership_trends_snapshots",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_number", sa.String(), nullable=False),
        sa.Column("period_days", sa.Integer(), nullable=False, server_default="90"),
        sa.Column("result_payload", sa.JSON(), nullable=False),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_number", name="uq_leadership_trends_snapshot_user"),
    )
    op.create_index(
        "ix_leadership_trends_snapshots_user_number",
        "leadership_trends_snapshots",
        ["user_number"],
        unique=True,
    )


def downgrade():
    op.drop_table("leadership_trends_snapshots")
