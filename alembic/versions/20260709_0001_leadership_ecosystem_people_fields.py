"""Add leadership ecosystem fields to people.

Revision ID: 20260709_0001
Revises: 20260706_0001
Create Date: 2026-07-09
"""

from typing import Sequence, Union

from alembic import op


revision: str = "20260709_0001"
down_revision: Union[str, None] = "20260706_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


FIELDS = [
    ("organization", "VARCHAR"),
    ("team", "VARCHAR"),
    ("manager_name", "VARCHAR"),
    ("circle_type", "VARCHAR"),
    ("strategic_importance", "VARCHAR"),
    ("last_interaction_at", "TIMESTAMP"),
    ("next_action", "TEXT"),
    ("current_goals", "TEXT"),
    ("development_plan", "TEXT"),
    ("stretch_assignments", "TEXT"),
    ("coaching_focus", "TEXT"),
    ("performance_indicator", "VARCHAR"),
    ("potential_indicator", "VARCHAR"),
    ("stakeholder_mission", "TEXT"),
    ("stakeholder_priorities", "TEXT"),
    ("success_metrics", "TEXT"),
    ("stakeholder_strengths", "TEXT"),
    ("risks_or_pressures", "TEXT"),
    ("stakeholder_aspirations", "TEXT"),
    ("how_i_create_value", "TEXT"),
    ("mission_alignment", "TEXT"),
    ("potential_tensions", "TEXT"),
    ("relationship_strategy", "VARCHAR"),
]


def upgrade() -> None:
    for name, column_type in FIELDS:
        op.execute(f"ALTER TABLE journey_people ADD COLUMN IF NOT EXISTS {name} {column_type};")


def downgrade() -> None:
    for name, _column_type in reversed(FIELDS):
        op.execute(f"ALTER TABLE journey_people DROP COLUMN IF EXISTS {name};")
