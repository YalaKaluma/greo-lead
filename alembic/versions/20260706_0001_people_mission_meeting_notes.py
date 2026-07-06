"""Add mission statements and meeting notes to people.

Revision ID: 20260706_0001
Revises: 20260620_0001
Create Date: 2026-07-06
"""

from typing import Sequence, Union

from alembic import op


revision: str = "20260706_0001"
down_revision: Union[str, None] = "20260620_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE journey_people ADD COLUMN IF NOT EXISTS mission_statement TEXT;")
    op.execute("ALTER TABLE journey_people ADD COLUMN IF NOT EXISTS meeting_notes JSONB DEFAULT '[]'::jsonb;")
    op.execute("UPDATE journey_people SET meeting_notes = '[]'::jsonb WHERE meeting_notes IS NULL;")


def downgrade() -> None:
    op.execute("ALTER TABLE journey_people DROP COLUMN IF EXISTS meeting_notes;")
    op.execute("ALTER TABLE journey_people DROP COLUMN IF EXISTS mission_statement;")
