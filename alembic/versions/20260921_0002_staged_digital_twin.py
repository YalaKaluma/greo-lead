"""Add gated Digital Twin stages and Executive World entities.

Revision ID: 20260921_0002
Revises: 20260921_0001
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260921_0002"
down_revision = "20260921_0001"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "intelligence_twin_stages",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("stage_key", sa.String(length=40), nullable=False),
        sa.Column("stage_order", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="locked"),
        sa.Column("progress_percent", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("progress_current", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("progress_total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("output_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("metrics_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("activity_log", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("run_reference", sa.String(length=120), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("failure_reference", sa.String(length=40), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "stage_key", name="uq_intelligence_twin_stage_user_key"),
    )
    op.create_index("idx_intelligence_twin_stages_user_order", "intelligence_twin_stages", ["user_id", "stage_order"])
    op.create_index("idx_intelligence_twin_stages_status", "intelligence_twin_stages", ["status"])
    op.create_index(op.f("ix_intelligence_twin_stages_id"), "intelligence_twin_stages", ["id"])
    op.create_index(op.f("ix_intelligence_twin_stages_user_id"), "intelligence_twin_stages", ["user_id"])
    op.create_index(op.f("ix_intelligence_twin_stages_stage_key"), "intelligence_twin_stages", ["stage_key"])

    op.create_table(
        "intelligence_world_entities",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("entity_type", sa.String(length=40), nullable=False),
        sa.Column("normalized_name", sa.String(length=240), nullable=False),
        sa.Column("display_name", sa.String(length=240), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=40), nullable=True),
        sa.Column("confidence_score", sa.Float(), nullable=False, server_default="0"),
        sa.Column("evidence_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("emotional_stance", sa.String(length=40), nullable=True),
        sa.Column("emotional_intensity", sa.Float(), nullable=True),
        sa.Column("metadata_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "entity_type", "normalized_name", name="uq_intelligence_world_entity_user_type_name"),
    )
    op.create_index("idx_intelligence_world_entities_user_type", "intelligence_world_entities", ["user_id", "entity_type"])
    op.create_index(op.f("ix_intelligence_world_entities_id"), "intelligence_world_entities", ["id"])
    op.create_index(op.f("ix_intelligence_world_entities_user_id"), "intelligence_world_entities", ["user_id"])
    op.create_index(op.f("ix_intelligence_world_entities_entity_type"), "intelligence_world_entities", ["entity_type"])

    op.create_table(
        "intelligence_world_relationships",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("source_entity_id", sa.Integer(), nullable=False),
        sa.Column("target_entity_id", sa.Integer(), nullable=False),
        sa.Column("relationship_type", sa.String(length=40), nullable=False, server_default="associated_with"),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("confidence_score", sa.Float(), nullable=False, server_default="0"),
        sa.Column("evidence_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("metadata_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["source_entity_id"], ["intelligence_world_entities.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["target_entity_id"], ["intelligence_world_entities.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "source_entity_id", "target_entity_id", "relationship_type", name="uq_intelligence_world_relationship_edge"),
    )
    op.create_index("idx_intelligence_world_relationships_user", "intelligence_world_relationships", ["user_id"])
    op.create_index(op.f("ix_intelligence_world_relationships_id"), "intelligence_world_relationships", ["id"])
    op.create_index(op.f("ix_intelligence_world_relationships_user_id"), "intelligence_world_relationships", ["user_id"])


def downgrade():
    op.drop_table("intelligence_world_relationships")
    op.drop_table("intelligence_world_entities")
    op.drop_table("intelligence_twin_stages")
