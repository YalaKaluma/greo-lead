"""Add generic notification tables.

Revision ID: 20260620_0001
Revises: 20260614_0002
Create Date: 2026-06-20
"""

from typing import Sequence, Union

from alembic import op


revision: str = "20260620_0001"
down_revision: Union[str, None] = "20260614_0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
    CREATE TABLE IF NOT EXISTS push_subscriptions (
        id SERIAL PRIMARY KEY,
        user_number VARCHAR(160) NOT NULL,
        endpoint TEXT NOT NULL,
        p256dh_key TEXT NOT NULL,
        auth_key TEXT NOT NULL,
        browser VARCHAR(120),
        platform VARCHAR(120),
        device_label VARCHAR(160),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        last_success_at TIMESTAMP,
        last_failure_at TIMESTAMP,
        failure_count INTEGER NOT NULL DEFAULT 0,
        CONSTRAINT uq_push_subscriptions_user_endpoint UNIQUE (user_number, endpoint)
    );
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_push_subscriptions_id ON push_subscriptions(id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_push_subscriptions_user_number ON push_subscriptions(user_number);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_push_subscriptions_is_active ON push_subscriptions(is_active);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_active ON push_subscriptions(user_number, is_active);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON push_subscriptions(endpoint);")

    op.execute("""
    CREATE TABLE IF NOT EXISTS notification_preferences (
        id SERIAL PRIMARY KEY,
        user_number VARCHAR(160) NOT NULL,
        notifications_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        quiet_hours_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        quiet_hours_start VARCHAR(5),
        quiet_hours_end VARCHAR(5),
        timezone VARCHAR(64),
        channels_enabled JSONB,
        notification_types_enabled JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_notification_preferences_user UNIQUE (user_number)
    );
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_notification_preferences_id ON notification_preferences(id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_notification_preferences_user_number ON notification_preferences(user_number);")

    op.execute("""
    CREATE TABLE IF NOT EXISTS notification_delivery_logs (
        id SERIAL PRIMARY KEY,
        user_number VARCHAR(160) NOT NULL,
        subscription_id INTEGER REFERENCES push_subscriptions(id) ON DELETE SET NULL,
        notification_type VARCHAR(120),
        source_service VARCHAR(120),
        title VARCHAR(220) NOT NULL,
        body TEXT,
        target_url TEXT,
        status VARCHAR(40) NOT NULL,
        error_message TEXT,
        metadata_json JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_notification_delivery_logs_id ON notification_delivery_logs(id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_notification_delivery_logs_user_number ON notification_delivery_logs(user_number);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_notification_delivery_logs_subscription_id ON notification_delivery_logs(subscription_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_notification_delivery_logs_notification_type ON notification_delivery_logs(notification_type);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_notification_delivery_logs_source_service ON notification_delivery_logs(source_service);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_notification_delivery_logs_status ON notification_delivery_logs(status);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_notification_delivery_logs_created_at ON notification_delivery_logs(created_at);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_notification_delivery_logs_user_created ON notification_delivery_logs(user_number, created_at);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_notification_delivery_logs_subscription_created ON notification_delivery_logs(subscription_id, created_at);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_notification_delivery_logs_source_type ON notification_delivery_logs(source_service, notification_type);")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_notification_delivery_logs_source_type;")
    op.execute("DROP INDEX IF EXISTS idx_notification_delivery_logs_subscription_created;")
    op.execute("DROP INDEX IF EXISTS idx_notification_delivery_logs_user_created;")
    op.execute("DROP INDEX IF EXISTS ix_notification_delivery_logs_created_at;")
    op.execute("DROP INDEX IF EXISTS ix_notification_delivery_logs_status;")
    op.execute("DROP INDEX IF EXISTS ix_notification_delivery_logs_source_service;")
    op.execute("DROP INDEX IF EXISTS ix_notification_delivery_logs_notification_type;")
    op.execute("DROP INDEX IF EXISTS ix_notification_delivery_logs_subscription_id;")
    op.execute("DROP INDEX IF EXISTS ix_notification_delivery_logs_user_number;")
    op.execute("DROP INDEX IF EXISTS ix_notification_delivery_logs_id;")
    op.execute("DROP TABLE IF EXISTS notification_delivery_logs;")

    op.execute("DROP INDEX IF EXISTS ix_notification_preferences_user_number;")
    op.execute("DROP INDEX IF EXISTS ix_notification_preferences_id;")
    op.execute("DROP TABLE IF EXISTS notification_preferences;")

    op.execute("DROP INDEX IF EXISTS idx_push_subscriptions_endpoint;")
    op.execute("DROP INDEX IF EXISTS idx_push_subscriptions_user_active;")
    op.execute("DROP INDEX IF EXISTS ix_push_subscriptions_is_active;")
    op.execute("DROP INDEX IF EXISTS ix_push_subscriptions_user_number;")
    op.execute("DROP INDEX IF EXISTS ix_push_subscriptions_id;")
    op.execute("DROP TABLE IF EXISTS push_subscriptions;")
