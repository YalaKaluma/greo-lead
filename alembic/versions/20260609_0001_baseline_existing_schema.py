"""Baseline existing production schema.

Revision ID: 20260609_0001
Revises:
Create Date: 2026-06-09

This baseline is intentionally empty. Production already has the schema from
the historical SQL files in db_migrations/, so existing databases should be
stamped to this revision with `alembic stamp head`.
"""

from typing import Sequence, Union

revision: str = "20260609_0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
