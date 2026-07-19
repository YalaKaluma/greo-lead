"""Add sponsor-circle contribution plot fields.

Revision ID: 20260718_0008
Revises: 20260718_0007
"""

from alembic import op
import sqlalchemy as sa


revision = "20260718_0008"
down_revision = "20260718_0007"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("journey_people", sa.Column("current_contribution", sa.Integer(), nullable=True))
    op.add_column("journey_people", sa.Column("potential_contribution", sa.Integer(), nullable=True))


def downgrade():
    op.drop_column("journey_people", "potential_contribution")
    op.drop_column("journey_people", "current_contribution")
