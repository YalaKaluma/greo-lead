"""Persist explainability receipts for emails and meetings.

Revision ID: 20260921_0001
Revises: 20260920_0002
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260921_0001"
down_revision = "20260920_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("messages", sa.Column("context_receipt", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column("meetings", sa.Column("context_receipt", postgresql.JSONB(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    op.drop_column("meetings", "context_receipt")
    op.drop_column("messages", "context_receipt")
