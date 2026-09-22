"""Split Digital Twin construction into six narrow, gated stages.

Revision ID: 20260921_0003
Revises: 20260921_0002
"""

from alembic import op


revision = "20260921_0003"
down_revision = "20260921_0002"
branch_labels = None
depends_on = None


def upgrade():
    # The former Executive World step mixed entity definition with relationships.
    # Preserve Stage 1, replace every later stage with the new explicit sequence.
    op.execute("DELETE FROM intelligence_twin_stages WHERE stage_order > 1")
    op.execute("DELETE FROM intelligence_world_relationships")
    op.execute("DELETE FROM intelligence_world_entities")
    op.execute(
        """
        UPDATE intelligence_twin_stages
        SET status = 'ready', progress_percent = 0, progress_current = 0,
            progress_total = 0, output_json = NULL, metrics_json = NULL,
            activity_log = NULL, error_message = NULL, failure_reference = NULL,
            started_at = NULL, completed_at = NULL
        WHERE stage_key = 'evidence_foundation'
        """
    )
    op.execute(
        """
        INSERT INTO intelligence_twin_stages (user_id, stage_key, stage_order, status)
        SELECT u.id, stages.stage_key, stages.stage_order,
               'locked'
        FROM users u
        CROSS JOIN (VALUES
            ('entity_directory', 2),
            ('executive_world', 3),
            ('behavioral_profile', 4),
            ('dynamic_state', 5),
            ('twin_assembly', 6)
        ) AS stages(stage_key, stage_order)
        ON CONFLICT (user_id, stage_key) DO NOTHING
        """
    )


def downgrade():
    op.execute("DELETE FROM intelligence_twin_stages WHERE stage_order > 1")
    op.execute(
        """
        INSERT INTO intelligence_twin_stages (user_id, stage_key, stage_order, status)
        SELECT u.id, stages.stage_key, stages.stage_order,
               CASE
                   WHEN stages.stage_order = 2 AND foundation.status = 'completed' THEN 'ready'
                   ELSE 'locked'
               END
        FROM users u
        CROSS JOIN (VALUES
            ('executive_world', 2),
            ('behavioral_profile', 3),
            ('dynamic_state', 4)
        ) AS stages(stage_key, stage_order)
        LEFT JOIN intelligence_twin_stages foundation
          ON foundation.user_id = u.id AND foundation.stage_key = 'evidence_foundation'
        ON CONFLICT (user_id, stage_key) DO NOTHING
        """
    )
