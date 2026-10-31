"""Revocable device sessions and rotating refresh credentials."""
from alembic import op
import sqlalchemy as sa

revision = "20261031_0001"
down_revision = "20260927_0001"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "device_sessions",
        sa.Column("id", sa.String(96), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("session_version", sa.Integer(), nullable=False),
        sa.Column("refresh_hash", sa.String(64), nullable=False),
        sa.Column("previous_refresh_hash", sa.String(64)),
        sa.Column("refresh_generation", sa.Integer(), nullable=False),
        sa.Column("rotated_at", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.Integer(), nullable=False),
        sa.Column("authenticated_at", sa.Integer(), nullable=False),
        sa.Column("revoked_at", sa.Integer()),
        sa.Column("remember_device", sa.Boolean(), nullable=False),
        sa.Column("modern_client", sa.Boolean(), nullable=False),
    )
    op.create_index("ix_device_sessions_user_id", "device_sessions", ["user_id"])


def downgrade():
    op.drop_index("ix_device_sessions_user_id", table_name="device_sessions")
    op.drop_table("device_sessions")
