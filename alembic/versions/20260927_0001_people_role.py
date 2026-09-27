"""Separate professional role from relationship to the user."""
from alembic import op
import sqlalchemy as sa

revision = "20260927_0001"
down_revision = "20260926_0001"
branch_labels = None
depends_on = None

def upgrade():
    if "role" not in {c["name"] for c in sa.inspect(op.get_bind()).get_columns("journey_people")}:
        op.add_column("journey_people", sa.Column("role", sa.String(), nullable=True))

def downgrade():
    op.drop_column("journey_people", "role")
