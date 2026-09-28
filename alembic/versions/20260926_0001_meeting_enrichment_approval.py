"""Add user-approved meeting enrichment suggestions.

Revision ID: 20260926_0001
Revises: 20260921_0003
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260926_0001"
down_revision = "20260921_0003"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "meeting_enrichment_suggestions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("meeting_id", sa.Integer(), nullable=False),
        sa.Column("suggestion_type", sa.String(length=50), nullable=False),
        sa.Column("action", sa.String(length=30), nullable=False, server_default="create"),
        sa.Column("target_id", sa.Integer(), nullable=True),
        sa.Column("speaker_label", sa.String(length=80), nullable=True),
        sa.Column("title", sa.String(length=240), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("rationale", sa.Text(), nullable=True),
        sa.Column("evidence_excerpt", sa.Text(), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("fingerprint", sa.String(length=64), nullable=False),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["meeting_id"], ["meetings.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("meeting_id", "fingerprint", name="uq_meeting_enrichment_fingerprint"),
    )
    op.create_index("idx_meeting_enrichment_status", "meeting_enrichment_suggestions", ["meeting_id", "status"])
    op.create_index(op.f("ix_meeting_enrichment_suggestions_meeting_id"), "meeting_enrichment_suggestions", ["meeting_id"])
    op.create_index(op.f("ix_meeting_enrichment_suggestions_status"), "meeting_enrichment_suggestions", ["status"])
    op.create_index(op.f("ix_meeting_enrichment_suggestions_suggestion_type"), "meeting_enrichment_suggestions", ["suggestion_type"])


def downgrade():
    op.drop_index(op.f("ix_meeting_enrichment_suggestions_suggestion_type"), table_name="meeting_enrichment_suggestions")
    op.drop_index(op.f("ix_meeting_enrichment_suggestions_status"), table_name="meeting_enrichment_suggestions")
    op.drop_index(op.f("ix_meeting_enrichment_suggestions_meeting_id"), table_name="meeting_enrichment_suggestions")
    op.drop_index("idx_meeting_enrichment_status", table_name="meeting_enrichment_suggestions")
    op.drop_table("meeting_enrichment_suggestions")
