"""Add revocable user session version.

Revision ID: 20260808_0003
Revises: 20260808_0002
"""

from alembic import op
import sqlalchemy as sa


revision = "20260808_0003"
down_revision = "20260808_0002"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "users",
        sa.Column("session_version", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade():
    op.drop_column("users", "session_version")
