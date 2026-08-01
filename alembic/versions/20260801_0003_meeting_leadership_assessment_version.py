"""Track the leadership assessment intelligence version used per meeting.

Revision ID: 20260801_0003
Revises: 20260801_0002
"""

from alembic import op
import sqlalchemy as sa


revision = "20260801_0003"
down_revision = "20260801_0002"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "meetings",
        sa.Column("leadership_assessment_version", sa.String(80), nullable=True),
    )
    op.create_index(
        "ix_meetings_leadership_assessment_version",
        "meetings",
        ["leadership_assessment_version"],
    )


def downgrade():
    op.drop_index("ix_meetings_leadership_assessment_version", table_name="meetings")
    op.drop_column("meetings", "leadership_assessment_version")
