"""Add account-deletion lifecycle timestamps.

Revision ID: 20260802_0001
Revises: 20260801_0004
"""

from alembic import op
import sqlalchemy as sa


revision = "20260802_0001"
down_revision = "20260801_0004"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "users",
        sa.Column("account_deletion_requested_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("account_deletion_scheduled_for", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "idx_users_account_deletion_scheduled",
        "users",
        ["account_deletion_scheduled_for"],
        postgresql_where=sa.text("account_deletion_scheduled_for IS NOT NULL"),
    )


def downgrade():
    op.drop_index("idx_users_account_deletion_scheduled", table_name="users")
    op.drop_column("users", "account_deletion_scheduled_for")
    op.drop_column("users", "account_deletion_requested_at")
