"""Evolve longitudinal beliefs into an incremental Executive Model.

Revision ID: 20260919_0003
Revises: 20260919_0002
"""

from alembic import op
import sqlalchemy as sa


revision = "20260919_0003"
down_revision = "20260919_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("intelligence_evidence", sa.Column("content_hash", sa.String(length=64), nullable=True))
    op.add_column("intelligence_evidence", sa.Column("synthesized_content_hash", sa.String(length=64), nullable=True))
    op.add_column("intelligence_evidence", sa.Column("synthesized_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "intelligence_evidence",
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index(op.f("ix_intelligence_evidence_content_hash"), "intelligence_evidence", ["content_hash"])

    op.add_column(
        "intelligence_claims",
        sa.Column("object_type", sa.String(length=40), nullable=False, server_default="attribute"),
    )
    op.add_column("intelligence_claims", sa.Column("scope", sa.String(length=80), nullable=True))
    op.add_column(
        "intelligence_claims",
        sa.Column("stability", sa.String(length=30), nullable=False, server_default="recurring"),
    )
    op.create_index(op.f("ix_intelligence_claims_object_type"), "intelligence_claims", ["object_type"])
    op.create_index(op.f("ix_intelligence_claims_scope"), "intelligence_claims", ["scope"])
    op.create_index(op.f("ix_intelligence_claims_stability"), "intelligence_claims", ["stability"])

    op.add_column(
        "intelligence_backfill_runs",
        sa.Column("processing_mode", sa.String(length=20), nullable=False, server_default="incremental"),
    )
    op.add_column(
        "intelligence_backfill_runs",
        sa.Column("new_evidence_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "intelligence_backfill_runs",
        sa.Column("changed_evidence_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "intelligence_backfill_runs",
        sa.Column("unchanged_evidence_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("intelligence_backfill_runs", sa.Column("failure_stage", sa.String(length=40), nullable=True))
    op.add_column("intelligence_backfill_runs", sa.Column("failure_reference", sa.String(length=40), nullable=True))


def downgrade() -> None:
    op.drop_column("intelligence_backfill_runs", "failure_reference")
    op.drop_column("intelligence_backfill_runs", "failure_stage")
    op.drop_column("intelligence_backfill_runs", "unchanged_evidence_count")
    op.drop_column("intelligence_backfill_runs", "changed_evidence_count")
    op.drop_column("intelligence_backfill_runs", "new_evidence_count")
    op.drop_column("intelligence_backfill_runs", "processing_mode")

    op.drop_index(op.f("ix_intelligence_claims_stability"), table_name="intelligence_claims")
    op.drop_index(op.f("ix_intelligence_claims_scope"), table_name="intelligence_claims")
    op.drop_index(op.f("ix_intelligence_claims_object_type"), table_name="intelligence_claims")
    op.drop_column("intelligence_claims", "stability")
    op.drop_column("intelligence_claims", "scope")
    op.drop_column("intelligence_claims", "object_type")

    op.drop_index(op.f("ix_intelligence_evidence_content_hash"), table_name="intelligence_evidence")
    op.drop_column("intelligence_evidence", "updated_at")
    op.drop_column("intelligence_evidence", "synthesized_at")
    op.drop_column("intelligence_evidence", "synthesized_content_hash")
    op.drop_column("intelligence_evidence", "content_hash")
