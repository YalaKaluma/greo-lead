"""Add live meeting context and personal voice enrollment.

Revision ID: 20260718_0006
Revises: 20260718_0005
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260718_0006"
down_revision: Union[str, None] = "20260718_0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("voice_reference_data_url", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("voice_reference_mime_type", sa.String(120), nullable=True))
    op.add_column("users", sa.Column("voice_reference_consented_at", sa.DateTime(timezone=True), nullable=True))
    op.create_table(
        "meeting_attendees",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("meeting_id", sa.Integer(), sa.ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("person_id", sa.Integer(), sa.ForeignKey("journey_people.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("meeting_id", "person_id", name="uq_meeting_attendee_person"),
    )
    op.create_index("ix_meeting_attendees_meeting_id", "meeting_attendees", ["meeting_id"])
    op.create_index("ix_meeting_attendees_person_id", "meeting_attendees", ["person_id"])
    op.create_table(
        "meeting_context_notes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("meeting_id", sa.Integer(), sa.ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("elapsed_seconds", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("note_text", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_meeting_context_notes_meeting_id", "meeting_context_notes", ["meeting_id"])


def downgrade() -> None:
    op.drop_table("meeting_context_notes")
    op.drop_table("meeting_attendees")
    op.drop_column("users", "voice_reference_consented_at")
    op.drop_column("users", "voice_reference_mime_type")
    op.drop_column("users", "voice_reference_data_url")
