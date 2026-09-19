"""Add longitudinal pattern dossiers and partial analysis windows.

Revision ID: 20260919_0006
Revises: 20260919_0005
"""

from alembic import op
import sqlalchemy as sa


revision = "20260919_0006"
down_revision = "20260919_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for name, column in (
        ("pattern_key", sa.Column("pattern_key", sa.String(length=120), nullable=True)),
        ("pattern_title", sa.Column("pattern_title", sa.String(length=240), nullable=True)),
        ("interpretation", sa.Column("interpretation", sa.Text(), nullable=True)),
        ("trajectory", sa.Column("trajectory", sa.String(length=30), nullable=True)),
        ("context_summary", sa.Column("context_summary", sa.Text(), nullable=True)),
        ("alternative_explanation", sa.Column("alternative_explanation", sa.Text(), nullable=True)),
        ("coaching_implication", sa.Column("coaching_implication", sa.Text(), nullable=True)),
        ("first_seen_at", sa.Column("first_seen_at", sa.DateTime(timezone=True), nullable=True)),
        ("last_seen_at", sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True)),
    ):
        op.add_column("intelligence_claims", column)
    op.create_index(op.f("ix_intelligence_claims_pattern_key"), "intelligence_claims", ["pattern_key"])
    op.create_index(op.f("ix_intelligence_claims_trajectory"), "intelligence_claims", ["trajectory"])

    op.add_column("intelligence_claim_evidence", sa.Column("rationale", sa.Text(), nullable=True))
    op.add_column(
        "intelligence_claim_evidence",
        sa.Column("independence_group", sa.String(length=120), nullable=True),
    )

    op.create_table(
        "intelligence_claim_contexts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("claim_id", sa.Integer(), nullable=False),
        sa.Column("context_type", sa.String(length=40), nullable=False),
        sa.Column("label", sa.String(length=240), nullable=False),
        sa.Column("applicability", sa.String(length=30), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["claim_id"], ["intelligence_claims.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_intelligence_claim_contexts_claim", "intelligence_claim_contexts", ["claim_id"])
    op.create_index("idx_intelligence_claim_contexts_type", "intelligence_claim_contexts", ["context_type"])
    op.create_index(op.f("ix_intelligence_claim_contexts_id"), "intelligence_claim_contexts", ["id"])

    op.create_table(
        "intelligence_pattern_feedback",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("claim_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("verdict", sa.String(length=30), nullable=False),
        sa.Column("correction_text", sa.Text(), nullable=True),
        sa.Column("context_note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["claim_id"], ["intelligence_claims.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_intelligence_pattern_feedback_claim", "intelligence_pattern_feedback", ["claim_id"])
    op.create_index("idx_intelligence_pattern_feedback_user", "intelligence_pattern_feedback", ["user_id"])
    op.create_index(op.f("ix_intelligence_pattern_feedback_id"), "intelligence_pattern_feedback", ["id"])
    op.create_index(op.f("ix_intelligence_pattern_feedback_user_id"), "intelligence_pattern_feedback", ["user_id"])

    op.add_column("intelligence_backfill_runs", sa.Column("window_weeks", sa.Integer(), nullable=True))
    op.add_column("intelligence_backfill_runs", sa.Column("window_start", sa.DateTime(timezone=True), nullable=True))
    op.add_column("intelligence_backfill_runs", sa.Column("window_end", sa.DateTime(timezone=True), nullable=True))
    op.execute(
        sa.text(
            """
            UPDATE intelligence_claims
            SET statement = regexp_replace(statement, '^Alfred([[:space:]]+)', 'The user\\1', 'i')
            WHERE statement ~* '^Alfred[[:space:]]+(is|has|shows|demonstrates|tends|appears|may|often|consistently)'
            """
        )
    )


def downgrade() -> None:
    op.drop_column("intelligence_backfill_runs", "window_end")
    op.drop_column("intelligence_backfill_runs", "window_start")
    op.drop_column("intelligence_backfill_runs", "window_weeks")
    op.drop_index(op.f("ix_intelligence_pattern_feedback_user_id"), table_name="intelligence_pattern_feedback")
    op.drop_index(op.f("ix_intelligence_pattern_feedback_id"), table_name="intelligence_pattern_feedback")
    op.drop_index("idx_intelligence_pattern_feedback_user", table_name="intelligence_pattern_feedback")
    op.drop_index("idx_intelligence_pattern_feedback_claim", table_name="intelligence_pattern_feedback")
    op.drop_table("intelligence_pattern_feedback")
    op.drop_index(op.f("ix_intelligence_claim_contexts_id"), table_name="intelligence_claim_contexts")
    op.drop_index("idx_intelligence_claim_contexts_type", table_name="intelligence_claim_contexts")
    op.drop_index("idx_intelligence_claim_contexts_claim", table_name="intelligence_claim_contexts")
    op.drop_table("intelligence_claim_contexts")
    op.drop_column("intelligence_claim_evidence", "independence_group")
    op.drop_column("intelligence_claim_evidence", "rationale")
    op.drop_index(op.f("ix_intelligence_claims_trajectory"), table_name="intelligence_claims")
    op.drop_index(op.f("ix_intelligence_claims_pattern_key"), table_name="intelligence_claims")
    for name in (
        "last_seen_at", "first_seen_at", "coaching_implication", "alternative_explanation",
        "context_summary", "trajectory", "interpretation", "pattern_title", "pattern_key",
    ):
        op.drop_column("intelligence_claims", name)
