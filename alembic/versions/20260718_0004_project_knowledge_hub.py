"""Expand projects into strategic knowledge hubs.

Revision ID: 20260718_0004
Revises: 20260718_0003
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260718_0004"
down_revision: Union[str, None] = "20260718_0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for name, column_type in (
        ("client", sa.String(240)), ("role", sa.String(240)), ("objective", sa.Text()),
        ("timeline", sa.String(500)), ("ai_overview", sa.Text()),
        ("workplan", sa.JSON()), ("in_scope", sa.JSON()), ("out_of_scope", sa.JSON()),
        ("deliverables", sa.JSON()), ("core_team", sa.JSON()),
        ("client_stakeholders", sa.JSON()), ("risks", sa.JSON()),
    ):
        op.add_column("journey_projects", sa.Column(name, column_type, nullable=True))
    op.execute("UPDATE journey_projects SET objective = goal WHERE objective IS NULL")
    op.create_table(
        "project_documents",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("journey_projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_number", sa.String(), nullable=False),
        sa.Column("filename", sa.String(300), nullable=False),
        sa.Column("content_type", sa.String(120)),
        sa.Column("storage_key", sa.String(500), nullable=False),
        sa.Column("document_type", sa.String(80)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_project_documents_project_id", "project_documents", ["project_id"])
    op.create_index("ix_project_documents_user_number", "project_documents", ["user_number"])


def downgrade() -> None:
    op.drop_table("project_documents")
    for name in ("risks", "client_stakeholders", "core_team", "deliverables", "out_of_scope", "in_scope", "workplan", "ai_overview", "timeline", "objective", "role", "client"):
        op.drop_column("journey_projects", name)
