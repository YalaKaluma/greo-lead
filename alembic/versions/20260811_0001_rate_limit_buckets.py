"""Add shared rate-limit buckets.

Revision ID: 20260811_0001
Revises: 20260809_0001
"""

from alembic import op
import sqlalchemy as sa


revision = "20260811_0001"
down_revision = "20260809_0001"
branch_labels = None
depends_on = None


def upgrade():
    inspector = sa.inspect(op.get_bind())
    if "rate_limit_buckets" not in inspector.get_table_names():
        op.create_table(
            "rate_limit_buckets",
            sa.Column("bucket_key", sa.String(length=255), nullable=False),
            sa.Column("window_started_at", sa.Integer(), nullable=False),
            sa.Column("request_count", sa.Integer(), nullable=False),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.PrimaryKeyConstraint("bucket_key"),
        )
        op.create_index(
            "idx_rate_limit_buckets_updated_at",
            "rate_limit_buckets",
            ["updated_at"],
        )


def downgrade():
    inspector = sa.inspect(op.get_bind())
    if "rate_limit_buckets" in inspector.get_table_names():
        op.drop_index("idx_rate_limit_buckets_updated_at", table_name="rate_limit_buckets")
        op.drop_table("rate_limit_buckets")
