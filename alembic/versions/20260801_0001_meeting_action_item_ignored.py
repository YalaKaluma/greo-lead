"""Add dismissed state for meeting action items.

Revision ID: 20260801_0001
Revises: 20260718_0008
"""

from alembic import op
import sqlalchemy as sa


revision = "20260801_0001"
down_revision = "20260718_0008"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "meeting_action_items",
        sa.Column("ignored_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade():
    op.drop_column("meeting_action_items", "ignored_at")
