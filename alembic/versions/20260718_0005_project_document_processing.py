"""Track project document processing.

Revision ID: 20260718_0005
Revises: 20260718_0004
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260718_0005"
down_revision: Union[str, None] = "20260718_0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("project_documents", sa.Column("processing_status", sa.String(30), nullable=False, server_default="queued"))
    op.add_column("project_documents", sa.Column("processing_error", sa.Text(), nullable=True))
    op.add_column("project_documents", sa.Column("extracted_character_count", sa.Integer(), nullable=True))
    op.add_column("project_documents", sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True))
    op.execute("UPDATE project_documents SET processing_status = 'failed', processing_error = 'This file was uploaded before automatic project analysis was enabled. Retry analysis to add its context.'")


def downgrade() -> None:
    op.drop_column("project_documents", "processed_at")
    op.drop_column("project_documents", "extracted_character_count")
    op.drop_column("project_documents", "processing_error")
    op.drop_column("project_documents", "processing_status")
