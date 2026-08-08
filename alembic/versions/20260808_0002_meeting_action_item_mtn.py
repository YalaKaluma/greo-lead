"""Store MTN scoring on meeting action items.

Revision ID: 20260808_0002
Revises: 20260808_0001
"""

from alembic import op
import sqlalchemy as sa


revision = "20260808_0002"
down_revision = "20260808_0001"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("meeting_action_items", sa.Column("notes", sa.Text(), nullable=True))
    op.add_column("meeting_action_items", sa.Column("priority", sa.String(length=20), nullable=True))
    op.add_column("meeting_action_items", sa.Column("delegated_to", sa.String(length=200), nullable=True))
    op.add_column("meeting_action_items", sa.Column("goal_id", sa.Integer(), nullable=True))
    op.add_column("meeting_action_items", sa.Column("goal_override_set", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_foreign_key("fk_meeting_action_items_goal_id", "meeting_action_items", "journey_goals", ["goal_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_meeting_action_items_goal_id", "meeting_action_items", ["goal_id"])
    op.add_column("meeting_action_items", sa.Column("mtn_score", sa.Numeric(), nullable=True))
    op.add_column("meeting_action_items", sa.Column("mtn_reason", sa.Text(), nullable=True))
    op.add_column("meeting_action_items", sa.Column("mtn_risk_if_ignored", sa.Text(), nullable=True))
    op.add_column("meeting_action_items", sa.Column("mtn_scored_at", sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column("meeting_action_items", "mtn_scored_at")
    op.drop_column("meeting_action_items", "mtn_risk_if_ignored")
    op.drop_column("meeting_action_items", "mtn_reason")
    op.drop_column("meeting_action_items", "mtn_score")
    op.drop_index("ix_meeting_action_items_goal_id", table_name="meeting_action_items")
    op.drop_constraint("fk_meeting_action_items_goal_id", "meeting_action_items", type_="foreignkey")
    op.drop_column("meeting_action_items", "goal_override_set")
    op.drop_column("meeting_action_items", "goal_id")
    op.drop_column("meeting_action_items", "delegated_to")
    op.drop_column("meeting_action_items", "priority")
    op.drop_column("meeting_action_items", "notes")
