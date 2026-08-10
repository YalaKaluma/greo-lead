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
    table_name = "task_mtn_feedback"
    inspector = sa.inspect(op.get_bind())

    if table_name not in inspector.get_table_names():
        op.create_table(
            table_name,
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
        op.create_index("ix_task_mtn_feedback_score_id", table_name, ["score_id"])
        op.create_index("ix_task_mtn_feedback_task_id", table_name, ["task_id"])
        op.create_index("ix_task_mtn_feedback_user_number", table_name, ["user_number"])
        return

    # Older deployments created this model through Base.metadata.create_all()
    # before Alembic owned the table. Reconcile that valid existing table
    # without deleting its production-derived data.
    expected_columns = {
        "id", "score_id", "task_id", "user_number", "original_score",
        "adjusted_score", "selected_tag", "rating", "feedback", "created_at",
    }
    existing_columns = {column["name"] for column in inspector.get_columns(table_name)}
    missing_columns = expected_columns - existing_columns
    if missing_columns:
        raise RuntimeError(
            f"Existing {table_name} table is incomplete; missing columns: "
            f"{', '.join(sorted(missing_columns))}"
        )

    existing_indexes = {index["name"] for index in inspector.get_indexes(table_name)}
    for index_name, columns in (
        ("ix_task_mtn_feedback_score_id", ["score_id"]),
        ("ix_task_mtn_feedback_task_id", ["task_id"]),
        ("ix_task_mtn_feedback_user_number", ["user_number"]),
    ):
        if index_name not in existing_indexes:
            op.create_index(index_name, table_name, columns)

    existing_checks = {
        constraint["name"]
        for constraint in inspector.get_check_constraints(table_name)
        if constraint.get("name")
    }
    if "ck_task_mtn_feedback_rating" not in existing_checks:
        op.create_check_constraint(
            "ck_task_mtn_feedback_rating", table_name, "rating BETWEEN 1 AND 5"
        )
    if "ck_task_mtn_feedback_adjusted_score" not in existing_checks:
        op.create_check_constraint(
            "ck_task_mtn_feedback_adjusted_score",
            table_name,
            "adjusted_score BETWEEN 0 AND 1",
        )


def downgrade():
    op.drop_table("task_mtn_feedback")
