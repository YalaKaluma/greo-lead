"""Add single-use password reset tokens.

Revision ID: 20260809_0001
Revises: 20260808_0005
"""

from alembic import op
import sqlalchemy as sa


revision = "20260809_0001"
down_revision = "20260808_0005"
branch_labels = None
depends_on = None


def upgrade():
    table_name = "password_reset_tokens"
    inspector = sa.inspect(op.get_bind())

    if table_name not in inspector.get_table_names():
        op.create_table(
            table_name,
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("token_hash", sa.String(length=64), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_password_reset_tokens_id", table_name, ["id"])
        op.create_index("ix_password_reset_tokens_user_id", table_name, ["user_id"])
        op.create_index(
            "ix_password_reset_tokens_token_hash",
            table_name,
            ["token_hash"],
            unique=True,
        )
        op.create_index("ix_password_reset_tokens_expires_at", table_name, ["expires_at"])
        return

    # The previous app startup could create mapped tables before Alembic ran.
    # Preserve that valid table and reconcile the indexes Alembic owns.
    expected_columns = {
        "id", "user_id", "token_hash", "created_at", "expires_at", "consumed_at"
    }
    existing_columns = {column["name"] for column in inspector.get_columns(table_name)}
    missing_columns = expected_columns - existing_columns
    if missing_columns:
        raise RuntimeError(
            f"Existing {table_name} table is incomplete; missing columns: "
            f"{', '.join(sorted(missing_columns))}"
        )

    existing_indexes = {index["name"] for index in inspector.get_indexes(table_name)}
    for index_name, columns, unique in (
        ("ix_password_reset_tokens_id", ["id"], False),
        ("ix_password_reset_tokens_user_id", ["user_id"], False),
        ("ix_password_reset_tokens_token_hash", ["token_hash"], True),
        ("ix_password_reset_tokens_expires_at", ["expires_at"], False),
    ):
        if index_name not in existing_indexes:
            op.create_index(index_name, table_name, columns, unique=unique)


def downgrade():
    op.drop_index("ix_password_reset_tokens_expires_at", table_name="password_reset_tokens")
    op.drop_index("ix_password_reset_tokens_token_hash", table_name="password_reset_tokens")
    op.drop_index("ix_password_reset_tokens_user_id", table_name="password_reset_tokens")
    op.drop_index("ix_password_reset_tokens_id", table_name="password_reset_tokens")
    op.drop_table("password_reset_tokens")
