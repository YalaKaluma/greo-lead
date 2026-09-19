"""Add the evidence-backed Alfred Intelligence Core.

Revision ID: 20260919_0001
Revises: 20260811_0001
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260919_0001"
down_revision = "20260811_0001"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "intelligence_evidence",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("user_number", sa.String(), nullable=True),
        sa.Column("source_type", sa.String(length=40), nullable=False),
        sa.Column("source_id", sa.String(length=120), nullable=False),
        sa.Column("evidence_key", sa.String(length=120), nullable=False, server_default="primary"),
        sa.Column("evidence_type", sa.String(length=40), nullable=False, server_default="observation"),
        sa.Column("excerpt", sa.Text(), nullable=True),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "source_type",
            "source_id",
            "evidence_key",
            name="uq_intelligence_evidence_source_key",
        ),
    )
    op.create_index("idx_intelligence_evidence_user_occurred", "intelligence_evidence", ["user_id", "occurred_at"])
    op.create_index("idx_intelligence_evidence_user_source", "intelligence_evidence", ["user_id", "source_type"])
    op.create_index(op.f("ix_intelligence_evidence_user_id"), "intelligence_evidence", ["user_id"])
    op.create_index(op.f("ix_intelligence_evidence_user_number"), "intelligence_evidence", ["user_number"])
    op.create_index(op.f("ix_intelligence_evidence_source_type"), "intelligence_evidence", ["source_type"])
    op.create_index(op.f("ix_intelligence_evidence_evidence_type"), "intelligence_evidence", ["evidence_type"])
    op.create_index(op.f("ix_intelligence_evidence_occurred_at"), "intelligence_evidence", ["occurred_at"])

    op.create_table(
        "intelligence_claims",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("user_number", sa.String(), nullable=True),
        sa.Column("claim_type", sa.String(length=40), nullable=False),
        sa.Column("subject_type", sa.String(length=40), nullable=True),
        sa.Column("subject_id", sa.String(length=120), nullable=True),
        sa.Column("statement", sa.Text(), nullable=False),
        sa.Column("epistemic_status", sa.String(length=40), nullable=False, server_default="hypothesis"),
        sa.Column("confidence_score", sa.Float(), nullable=False, server_default="0"),
        sa.Column("review_status", sa.String(length=30), nullable=False, server_default="active"),
        sa.Column("valid_from", sa.DateTime(timezone=True), nullable=True),
        sa.Column("valid_to", sa.DateTime(timezone=True), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("contradicted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("superseded_by_id", sa.Integer(), nullable=True),
        sa.Column("metadata_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "confidence_score >= 0 AND confidence_score <= 1",
            name="ck_intelligence_claim_confidence",
        ),
        sa.ForeignKeyConstraint(["superseded_by_id"], ["intelligence_claims.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_intelligence_claims_user_status", "intelligence_claims", ["user_id", "review_status"])
    op.create_index("idx_intelligence_claims_user_type", "intelligence_claims", ["user_id", "claim_type"])
    op.create_index("idx_intelligence_claims_user_updated", "intelligence_claims", ["user_id", "updated_at"])
    for column in ("user_id", "user_number", "claim_type", "subject_type", "subject_id", "epistemic_status", "review_status"):
        op.create_index(op.f(f"ix_intelligence_claims_{column}"), "intelligence_claims", [column])

    op.create_table(
        "intelligence_claim_evidence",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("claim_id", sa.Integer(), nullable=False),
        sa.Column("evidence_id", sa.Integer(), nullable=False),
        sa.Column("relationship_type", sa.String(length=20), nullable=False, server_default="supports"),
        sa.Column("relevance_score", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["claim_id"], ["intelligence_claims.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["evidence_id"], ["intelligence_evidence.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("claim_id", "evidence_id", name="uq_intelligence_claim_evidence"),
    )
    op.create_index("idx_intelligence_claim_evidence_claim", "intelligence_claim_evidence", ["claim_id"])
    op.create_index("idx_intelligence_claim_evidence_evidence", "intelligence_claim_evidence", ["evidence_id"])


def downgrade():
    op.drop_table("intelligence_claim_evidence")
    op.drop_table("intelligence_claims")
    op.drop_table("intelligence_evidence")
