"""Harden email verification codes and attempts.

Revision ID: 20260808_0004
Revises: 20260808_0003
"""

from alembic import op
import sqlalchemy as sa


revision = "20260808_0004"
down_revision = "20260808_0003"
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column(
        "email_verifications",
        "verification_code",
        existing_type=sa.String(length=6),
        type_=sa.String(length=255),
        existing_nullable=False,
    )
    op.add_column(
        "email_verifications",
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade():
    op.drop_column("email_verifications", "attempt_count")
    op.alter_column(
        "email_verifications",
        "verification_code",
        existing_type=sa.String(length=255),
        type_=sa.String(length=6),
        existing_nullable=False,
    )
