"""Store task-level MTN score corrections.

Revision ID: 20260808_0001
Revises: 20260802_0001
"""

from alembic import op
import sqlalchemy as sa


revision = "20260808_0001"
down_revision = "20260802_0001"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "task_mtn_feedback",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("score_id", sa.Integer(), sa.ForeignKey("task_priority_scores.id", ondelete="CASCADE"), nullable=False),
        sa.Column("task_id", sa.Integer(), sa.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_number", sa.String(), nullable=False),
        sa.Column("original_score", sa.Numeric(3, 2), nullable=False),
        sa.Column("adjusted_score", sa.Numeric(3, 2), nullable=False),
        sa.Column("selected_tag", sa.String(), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("feedback", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("rating BETWEEN 1 AND 5", name="ck_task_mtn_feedback_rating"),
        sa.CheckConstraint("adjusted_score BETWEEN 0 AND 1", name="ck_task_mtn_feedback_adjusted_score"),
    )
    op.create_index("ix_task_mtn_feedback_score_id", "task_mtn_feedback", ["score_id"])
    op.create_index("ix_task_mtn_feedback_task_id", "task_mtn_feedback", ["task_id"])
    op.create_index("ix_task_mtn_feedback_user_number", "task_mtn_feedback", ["user_number"])


def downgrade():
    op.drop_table("task_mtn_feedback")
