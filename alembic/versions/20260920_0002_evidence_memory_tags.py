"""Add normalized tags for raw intelligence evidence.

Revision ID: 20260920_0002
Revises: 20260920_0001
"""

from alembic import op
import sqlalchemy as sa


revision = "20260920_0002"
down_revision = "20260920_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "intelligence_memory_tags",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("tag_type", sa.String(length=30), nullable=False),
        sa.Column("normalized_value", sa.String(length=240), nullable=False),
        sa.Column("display_value", sa.String(length=240), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "tag_type", "normalized_value", name="uq_intelligence_memory_tag"),
    )
    op.create_index(op.f("ix_intelligence_memory_tags_id"), "intelligence_memory_tags", ["id"])
    op.create_index(op.f("ix_intelligence_memory_tags_user_id"), "intelligence_memory_tags", ["user_id"])
    op.create_index(op.f("ix_intelligence_memory_tags_tag_type"), "intelligence_memory_tags", ["tag_type"])
    op.create_index("idx_intelligence_memory_tags_user_type", "intelligence_memory_tags", ["user_id", "tag_type"])

    op.create_table(
        "intelligence_evidence_tags",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("evidence_id", sa.Integer(), nullable=False),
        sa.Column("tag_id", sa.Integer(), nullable=False),
        sa.Column("confidence_score", sa.Float(), nullable=False, server_default="1"),
        sa.Column("source", sa.String(length=30), nullable=False, server_default="automatic"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["evidence_id"], ["intelligence_evidence.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tag_id"], ["intelligence_memory_tags.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("evidence_id", "tag_id", name="uq_intelligence_evidence_tag"),
    )
    op.create_index(op.f("ix_intelligence_evidence_tags_id"), "intelligence_evidence_tags", ["id"])
    op.create_index("idx_intelligence_evidence_tags_evidence", "intelligence_evidence_tags", ["evidence_id"])
    op.create_index("idx_intelligence_evidence_tags_tag", "intelligence_evidence_tags", ["tag_id"])


def downgrade() -> None:
    op.drop_table("intelligence_evidence_tags")
    op.drop_table("intelligence_memory_tags")
