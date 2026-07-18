"""Add persistent habit ordering.

Revision ID: 20260718_0001
Revises: 20260709_0001
Create Date: 2026-07-18
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260718_0001"
down_revision: Union[str, None] = "20260709_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("habits", sa.Column("sort_order", sa.Integer(), nullable=True))
    op.execute(
        """
        WITH ranked_habits AS (
            SELECT id,
                   ROW_NUMBER() OVER (
                       PARTITION BY user_number
                       ORDER BY created_at ASC NULLS LAST, id ASC
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
    op.create_index("ix_habits_user_sort_order", "habits", ["user_number", "sort_order"])


def downgrade() -> None:
    op.drop_index("ix_habits_user_sort_order", table_name="habits")
    op.drop_column("habits", "sort_order")
