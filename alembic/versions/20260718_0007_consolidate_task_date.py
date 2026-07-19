"""Consolidate task scheduling into the due date.

Revision ID: 20260718_0007
Revises: 20260718_0006
Create Date: 2026-07-18
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260718_0007"
down_revision: Union[str, None] = "20260718_0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Keep each task on the day currently shown in the calendar. For tasks
    # created before scheduled_date existed, retain the existing due date.
    op.execute(
        """
        UPDATE tasks
        SET due_date = COALESCE(
            scheduled_date::timestamp,
            due_date,
            created_at,
            CURRENT_TIMESTAMP
        )
        """
    )
    op.alter_column(
        "tasks",
        "due_date",
        existing_type=sa.DateTime(),
        nullable=False,
        server_default=sa.text("CURRENT_DATE"),
    )
    op.drop_index("ix_tasks_user_scheduled_date", table_name="tasks")
    op.drop_column("tasks", "scheduled_date")


def downgrade() -> None:
    op.add_column("tasks", sa.Column("scheduled_date", sa.Date(), nullable=True))
    op.execute("UPDATE tasks SET scheduled_date = due_date::date")
    op.create_index(
        "ix_tasks_user_scheduled_date",
        "tasks",
        ["user_number", "scheduled_date"],
    )
    op.alter_column(
        "tasks",
        "due_date",
        existing_type=sa.DateTime(),
        nullable=True,
        server_default=None,
    )
