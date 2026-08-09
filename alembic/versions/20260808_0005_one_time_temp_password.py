"""Track one-time temporary password consumption.

Revision ID: 20260808_0005
Revises: 20260808_0004
"""

from alembic import op
import sqlalchemy as sa


revision = "20260808_0005"
down_revision = "20260808_0004"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("temp_password_consumed_at", sa.DateTime(), nullable=True))


def downgrade():
    op.drop_column("users", "temp_password_consumed_at")
