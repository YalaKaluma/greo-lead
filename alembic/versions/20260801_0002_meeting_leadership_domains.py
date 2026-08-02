"""Add five-domain meeting leadership assessments.

Revision ID: 20260801_0002
Revises: 20260801_0001
"""

from alembic import op
import sqlalchemy as sa


revision = "20260801_0002"
down_revision = "20260801_0001"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "meeting_leadership_domain_assessments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("meeting_id", sa.Integer(), sa.ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("domain", sa.String(80), nullable=False),
        sa.Column("score", sa.Integer(), nullable=True),
        sa.Column("feedback", sa.Text(), nullable=False),
        sa.Column("evidence_excerpt", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("meeting_id", "domain", name="uq_meeting_leadership_domain"),
        sa.CheckConstraint("score IS NULL OR score BETWEEN 1 AND 5", name="ck_meeting_leadership_domain_score"),
    )
    op.create_index(
        "ix_meeting_leadership_domain_assessments_meeting_id",
        "meeting_leadership_domain_assessments",
        ["meeting_id"],
    )


def downgrade():
    op.drop_table("meeting_leadership_domain_assessments")
