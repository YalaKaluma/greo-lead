import os

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

from app.models import NotificationDeliveryLog, NotificationPreference, PushSubscription
from app.services.notifications import (
    NotificationService,
    PushSubscriptionKeys,
    PushSubscriptionPayload,
)
from app.services.notifications.push_service import NotificationPayload


class FakeQuery:
    def __init__(self, items):
        self.items = items

    def filter(self, *args, **kwargs):
        return self

    def all(self):
        return list(self.items)

    def first(self):
        return self.items[0] if self.items else None


class FakeNotificationDb:
    def __init__(self):
        self.push_subscriptions = []
        self.notification_preferences = []
        self.notification_delivery_logs = []
        self.commits = 0
        self.flushes = 0
        self.refreshes = []
        self.next_id = 1

    def add(self, item):
        if getattr(item, "id", None) is None:
            item.id = self.next_id
            self.next_id += 1
        if isinstance(item, PushSubscription) and item not in self.push_subscriptions:
            self.push_subscriptions.append(item)
        if isinstance(item, NotificationPreference) and item not in self.notification_preferences:
            self.notification_preferences.append(item)
        if isinstance(item, NotificationDeliveryLog) and item not in self.notification_delivery_logs:
            self.notification_delivery_logs.append(item)

    def query(self, model):
        if model is PushSubscription:
            return FakeQuery(self.push_subscriptions)
        if model is NotificationPreference:
            return FakeQuery(self.notification_preferences)
        if model is NotificationDeliveryLog:
            return FakeQuery(self.notification_delivery_logs)
        return FakeQuery([])

    def commit(self):
        self.commits += 1

    def flush(self):
        self.flushes += 1

    def refresh(self, item):
        self.refreshes.append(item)


def subscription_payload(endpoint="https://push.example/sub-1"):
    return PushSubscriptionPayload(
        endpoint=endpoint,
        keys=PushSubscriptionKeys(p256dh="public-key", auth="auth-key"),
        browser="Chrome",
        platform="Windows",
        device_label="Work laptop",
    )


def test_save_subscription_creates_subscription_and_enables_preferences():
    db = FakeNotificationDb()
    service = NotificationService(db)

    subscription = service.save_subscription("user-1", subscription_payload())

    assert subscription.id == 1
    assert subscription.user_number == "user-1"
    assert subscription.endpoint == "https://push.example/sub-1"
    assert subscription.is_active is True
    assert db.notification_preferences[0].notifications_enabled is True
    assert db.commits == 1


def test_unsubscribe_deactivates_active_subscription():
    db = FakeNotificationDb()
    subscription = PushSubscription(
        id=10,
        user_number="user-1",
        endpoint="https://push.example/sub-1",
        p256dh_key="public-key",
        auth_key="auth-key",
        is_active=True,
    )
    db.push_subscriptions.append(subscription)

    count = NotificationService(db).unsubscribe("user-1", endpoint=subscription.endpoint)

    assert count == 1
    assert subscription.is_active is False
    assert db.commits == 1


def test_send_skips_when_preferences_disabled():
    db = FakeNotificationDb()
    db.notification_preferences.append(
        NotificationPreference(user_number="user-1", notifications_enabled=False)
    )

    result = NotificationService(db).send(
        NotificationPayload(
            user_number="user-1",
            title="Hello",
            body="Open Alfred",
            notification_type="morning_nudge",
            source_service="nudges",
        )
    )

    assert result.skipped == 1
    assert result.reason == "notifications_disabled"
    assert db.notification_delivery_logs == []


def test_send_logs_failure_when_vapid_is_not_configured():
    db = FakeNotificationDb()
    db.notification_preferences.append(
        NotificationPreference(user_number="user-1", notifications_enabled=True)
    )
    db.push_subscriptions.append(
        PushSubscription(
            id=10,
            user_number="user-1",
            endpoint="https://push.example/sub-1",
            p256dh_key="public-key",
            auth_key="auth-key",
            is_active=True,
        )
    )

    result = NotificationService(db).send(
        NotificationPayload(
            user_number="user-1",
            title="Hello",
            body="Open Alfred",
            url="/tasks",
            notification_type="morning_nudge",
            source_service="nudges",
        )
    )

    assert result.attempted == 1
    assert result.failed == 1
    assert result.reason in {"vapid_not_configured", "pywebpush_unavailable"}
    assert db.notification_delivery_logs[0].status == "failed"
    assert db.commits == 1
