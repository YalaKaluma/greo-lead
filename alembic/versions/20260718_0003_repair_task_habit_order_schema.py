"""Repair task scheduling and habit ordering schema drift.

Revision ID: 20260718_0003
Revises: 20260718_0002
Create Date: 2026-07-18
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260718_0003"
down_revision: Union[str, None] = "20260718_0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_names(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    return {column["name"] for column in inspector.get_columns(table_name)}


def _index_names(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    return {index["name"] for index in inspector.get_indexes(table_name)}


def upgrade() -> None:
    if "scheduled_date" not in _column_names("tasks"):
        op.add_column("tasks", sa.Column("scheduled_date", sa.Date(), nullable=True))
    if "ix_tasks_user_scheduled_date" not in _index_names("tasks"):
        op.create_index(
            "ix_tasks_user_scheduled_date",
            "tasks",
            ["user_number", "scheduled_date"],
        )

    if "sort_order" not in _column_names("habits"):
        op.add_column("habits", sa.Column("sort_order", sa.Integer(), nullable=True))
    op.execute(
        """
        WITH ranked_habits AS (
            SELECT id,
                   ROW_NUMBER() OVER (
                       PARTITION BY user_number
                       ORDER BY sort_order ASC NULLS LAST,
                                created_at ASC NULLS LAST,
                                id ASC
                   ) - 1 AS position
            FROM habits
            WHERE is_active = TRUE
        )
        UPDATE habits
        SET sort_order = ranked_habits.position
        FROM ranked_habits
        WHERE habits.id = ranked_habits.id
        """
    )
    if "ix_habits_user_sort_order" not in _index_names("habits"):
        op.create_index(
            "ix_habits_user_sort_order",
            "habits",
            ["user_number", "sort_order"],
        )


def downgrade() -> None:
    # This revision repairs drift introduced before it. Downgrading must not
    # remove columns owned by the original 0001 and 0002 revisions.
    pass
