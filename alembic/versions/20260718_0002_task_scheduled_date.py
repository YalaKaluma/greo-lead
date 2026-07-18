"""Separate task scheduling from optional deadlines.

Revision ID: 20260718_0002
Revises: 20260718_0001
Create Date: 2026-07-18
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260718_0002"
down_revision: Union[str, None] = "20260718_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("scheduled_date", sa.Date(), nullable=True))
    op.create_index(
        "ix_tasks_user_scheduled_date",
        "tasks",
        ["user_number", "scheduled_date"],
    )


def downgrade() -> None:
    op.drop_index("ix_tasks_user_scheduled_date", table_name="tasks")
    op.drop_column("tasks", "scheduled_date")
