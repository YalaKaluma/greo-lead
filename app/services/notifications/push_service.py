from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime
import base64
import json
import logging
from typing import Any

from sqlalchemy.orm import Session

from app.config import (
    FIREBASE_PROJECT_ID,
    FIREBASE_SERVICE_ACCOUNT_B64,
    FIREBASE_SERVICE_ACCOUNT_JSON,
    VAPID_PRIVATE_KEY,
    VAPID_PUBLIC_KEY,
    VAPID_SUBJECT,
)
from app.models import NotificationDeliveryLog, NotificationPreference, PushSubscription
from app.services.timezone_service import DEFAULT_TIMEZONE

try:
    from pywebpush import WebPushException, webpush
except Exception:  # pragma: no cover - dependency may not be installed in older local envs yet
    WebPushException = None
    webpush = None

try:
    import requests
    from google.auth.transport.requests import Request as GoogleAuthRequest
    from google.oauth2 import service_account
except Exception:  # pragma: no cover - optional mobile push runtime configuration
    requests = None
    GoogleAuthRequest = None
    service_account = None


logger = logging.getLogger(__name__)


INVALID_SUBSCRIPTION_STATUS_CODES = {404, 410}
FCM_ENDPOINT_PREFIX = "fcm:"
FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging"


@dataclass
class PushSubscriptionKeys:
    p256dh: str
    auth: str


@dataclass
class PushSubscriptionPayload:
    endpoint: str
    keys: PushSubscriptionKeys
    browser: str | None = None
    platform: str | None = None
    device_label: str | None = None


@dataclass
class NotificationPayload:
    user_number: str
    title: str
    body: str
    url: str | None = None
    notification_type: str | None = None
    source_service: str | None = None
    metadata: dict[str, Any] | None = None

    def to_push_json(self) -> str:
        return json.dumps(
            {
                "title": self.title,
                "body": self.body,
                "url": self.url,
                "notification_type": self.notification_type,
                "source_service": self.source_service,
                "metadata": self.metadata or {},
            }
        )


@dataclass
class NotificationDelivery:
    subscription_id: int | None
    status: str
    error: str | None = None


@dataclass
class NotificationResult:
    attempted: int = 0
    sent: int = 0
    failed: int = 0
    skipped: int = 0
    reason: str | None = None
    deliveries: list[NotificationDelivery] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["deliveries"] = [asdict(item) for item in self.deliveries]
        return data


class NotificationService:
    def __init__(self, db: Session):
        self.db = db

    def save_subscription(self, user_number: str, payload: PushSubscriptionPayload) -> PushSubscription:
        subscription = (
            self.db.query(PushSubscription)
            .filter(PushSubscription.user_number == user_number, PushSubscription.endpoint == payload.endpoint)
            .first()
        )
        now = datetime.utcnow()
        if subscription:
            subscription.p256dh_key = payload.keys.p256dh
            subscription.auth_key = payload.keys.auth
            subscription.browser = payload.browser
            subscription.platform = payload.platform
            subscription.device_label = payload.device_label
            subscription.is_active = True
            subscription.updated_at = now
            logger.info("Updated push subscription for user=%s subscription_id=%s", user_number, subscription.id)
        else:
            subscription = PushSubscription(
                user_number=user_number,
                endpoint=payload.endpoint,
                p256dh_key=payload.keys.p256dh,
                auth_key=payload.keys.auth,
                browser=payload.browser,
                platform=payload.platform,
                device_label=payload.device_label,
                is_active=True,
            )
            self.db.add(subscription)
            logger.info("Created push subscription for user=%s", user_number)

        preferences = self.get_or_create_preferences(user_number)
        preferences.notifications_enabled = True
        preferences.updated_at = now

        self.db.commit()
        self.db.refresh(subscription)
        return subscription

    def unsubscribe(self, user_number: str, endpoint: str | None = None, subscription_id: int | None = None) -> int:
        query = self.db.query(PushSubscription).filter(PushSubscription.user_number == user_number)
        if subscription_id is not None:
            query = query.filter(PushSubscription.id == subscription_id)
        elif endpoint:
            query = query.filter(PushSubscription.endpoint == endpoint)
        else:
            query = query.filter(PushSubscription.is_active == True)

        subscriptions = query.all()
        now = datetime.utcnow()
        for subscription in subscriptions:
            subscription.is_active = False
            subscription.updated_at = now
            logger.info(
                "Deactivated push subscription for user=%s subscription_id=%s",
                user_number,
                subscription.id,
            )

        self.db.commit()
        return len(subscriptions)

    def get_or_create_preferences(self, user_number: str) -> NotificationPreference:
        preferences = (
            self.db.query(NotificationPreference)
            .filter(NotificationPreference.user_number == user_number)
            .first()
        )
        if preferences:
            return preferences

        preferences = NotificationPreference(
            user_number=user_number,
            notifications_enabled=False,
            timezone=DEFAULT_TIMEZONE,
            channels_enabled={"web_push": True},
            notification_types_enabled={},
        )
        self.db.add(preferences)
        self.db.flush()
        return preferences

    def update_preferences(
        self,
        user_number: str,
        notifications_enabled: bool | None = None,
        notification_types_enabled: dict[str, bool] | None = None,
        timezone: str | None = None,
    ) -> NotificationPreference:
        preferences = self.get_or_create_preferences(user_number)
        if notifications_enabled is not None:
            preferences.notifications_enabled = notifications_enabled
        if notification_types_enabled is not None:
            preferences.notification_types_enabled = notification_types_enabled
        if timezone is not None:
            preferences.timezone = timezone
        preferences.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(preferences)
        logger.info("Updated notification preferences for user=%s", user_number)
        return preferences

    def status(self, user_number: str) -> dict[str, Any]:
        preferences = self.get_or_create_preferences(user_number)
        subscriptions = (
            self.db.query(PushSubscription)
            .filter(PushSubscription.user_number == user_number)
            .all()
        )
        active_subscriptions = [item for item in subscriptions if item.is_active]
        return {
            "user_number": user_number,
            "configured": bool(VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY),
            "vapid_public_key": VAPID_PUBLIC_KEY,
            "native_push_configured": fcm_configured(),
            "notifications_enabled": bool(preferences.notifications_enabled),
            "active_subscription_count": len(active_subscriptions),
            "subscriptions": [subscription_to_dict(item) for item in subscriptions],
            "preferences": preference_to_dict(preferences),
        }

    def send(self, payload: NotificationPayload) -> NotificationResult:
        preferences = self.get_or_create_preferences(payload.user_number)
        if not preferences.notifications_enabled:
            logger.info("Notification blocked by preferences for user=%s", payload.user_number)
            return NotificationResult(skipped=1, reason="notifications_disabled")

        if payload.notification_type and preferences.notification_types_enabled:
            type_enabled = preferences.notification_types_enabled.get(payload.notification_type)
            if type_enabled is False:
                logger.info(
                    "Notification type blocked by preferences for user=%s type=%s",
                    payload.user_number,
                    payload.notification_type,
                )
                return NotificationResult(skipped=1, reason="notification_type_disabled")

        subscriptions = (
            self.db.query(PushSubscription)
            .filter(PushSubscription.user_number == payload.user_number, PushSubscription.is_active == True)
            .all()
        )
        if not subscriptions:
            return NotificationResult(skipped=1, reason="no_active_subscriptions")

        result = NotificationResult(attempted=len(subscriptions))
        data = payload.to_push_json()
        for subscription in subscriptions:
            try:
                logger.info(
                    "Notification send attempted user=%s subscription_id=%s source=%s type=%s",
                    payload.user_number,
                    subscription.id,
                    payload.source_service,
                    payload.notification_type,
                )
                if is_fcm_subscription(subscription):
                    send_fcm_notification(subscription, payload)
                else:
                    if not VAPID_PUBLIC_KEY or not VAPID_PRIVATE_KEY:
                        raise RuntimeError("vapid_not_configured")
                    if webpush is None:
                        raise RuntimeError("pywebpush_unavailable")
                    webpush(
                        subscription_info=subscription_to_webpush_info(subscription),
                        data=data,
                        vapid_private_key=VAPID_PRIVATE_KEY,
                        vapid_claims={"sub": VAPID_SUBJECT},
                    )
            except Exception as error:
                result.failed += 1
                self._record_failure(subscription, payload, str(error))
                if _is_invalid_subscription_error(error):
                    subscription.is_active = False
                    logger.info(
                        "Invalid push subscription deactivated user=%s subscription_id=%s",
                        payload.user_number,
                        subscription.id,
                    )
                result.deliveries.append(NotificationDelivery(subscription.id, "failed", str(error)))
            else:
                result.sent += 1
                self._record_success(subscription, payload)
                result.deliveries.append(NotificationDelivery(subscription.id, "sent"))

        self.db.commit()
        return result

    def _record_success(self, subscription: PushSubscription, payload: NotificationPayload) -> None:
        now = datetime.utcnow()
        subscription.last_success_at = now
        subscription.failure_count = 0
        subscription.updated_at = now
        self.db.add(
            NotificationDeliveryLog(
                user_number=payload.user_number,
                subscription_id=subscription.id,
                notification_type=payload.notification_type,
                source_service=payload.source_service,
                title=payload.title,
                body=payload.body,
                target_url=payload.url,
                status="sent",
                metadata_json=payload.metadata or {},
            )
        )
        logger.info("Notification send success user=%s subscription_id=%s", payload.user_number, subscription.id)

    def _record_failure(self, subscription: PushSubscription, payload: NotificationPayload, error: str) -> None:
        now = datetime.utcnow()
        subscription.last_failure_at = now
        subscription.failure_count = (subscription.failure_count or 0) + 1
        subscription.updated_at = now
        self.db.add(
            NotificationDeliveryLog(
                user_number=payload.user_number,
                subscription_id=subscription.id,
                notification_type=payload.notification_type,
                source_service=payload.source_service,
                title=payload.title,
                body=payload.body,
                target_url=payload.url,
                status="failed",
                error_message=error[:500],
                metadata_json=payload.metadata or {},
            )
        )
        logger.warning(
            "Notification send failure user=%s subscription_id=%s error=%s",
            payload.user_number,
            subscription.id,
            error,
        )


def _is_invalid_subscription_error(error: Exception) -> bool:
    response = getattr(error, "response", None)
    status_code = getattr(response, "status_code", None)
    return status_code in INVALID_SUBSCRIPTION_STATUS_CODES


def is_fcm_subscription(subscription: PushSubscription) -> bool:
    return str(subscription.endpoint or "").startswith(FCM_ENDPOINT_PREFIX)


def fcm_configured() -> bool:
    return bool(_firebase_credentials_info() and _firebase_project_id())


def send_fcm_notification(subscription: PushSubscription, payload: NotificationPayload) -> None:
    if requests is None or service_account is None or GoogleAuthRequest is None:
        raise RuntimeError("firebase_dependencies_unavailable")

    credentials_info = _firebase_credentials_info()
    project_id = _firebase_project_id(credentials_info)
    if not credentials_info or not project_id:
        raise RuntimeError("firebase_not_configured")

    token = str(subscription.endpoint or "").removeprefix(FCM_ENDPOINT_PREFIX)
    if not token:
        raise RuntimeError("missing_fcm_token")

    credentials = service_account.Credentials.from_service_account_info(
        credentials_info,
        scopes=[FCM_SCOPE],
    )
    credentials.refresh(GoogleAuthRequest())

    response = requests.post(
        f"https://fcm.googleapis.com/v1/projects/{project_id}/messages:send",
        headers={
            "Authorization": f"Bearer {credentials.token}",
            "Content-Type": "application/json; charset=UTF-8",
        },
        json={
            "message": {
                "token": token,
                "notification": {
                    "title": payload.title,
                    "body": payload.body or "",
                },
                "data": {
                    "url": payload.url or "/",
                    "notification_type": payload.notification_type or "general",
                    "source_service": payload.source_service or "alfred",
                    "metadata": json.dumps(payload.metadata or {}),
                },
                "android": {
                    "notification": {}
                },
            }
        },
        timeout=10,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"fcm_error_{response.status_code}: {response.text[:400]}")


def _firebase_credentials_info() -> dict[str, Any] | None:
    raw = FIREBASE_SERVICE_ACCOUNT_JSON
    if not raw and FIREBASE_SERVICE_ACCOUNT_B64:
        try:
            raw = base64.b64decode(FIREBASE_SERVICE_ACCOUNT_B64).decode("utf-8")
        except Exception as error:
            logger.warning("Could not decode FIREBASE_SERVICE_ACCOUNT_B64: %s", error)
            return None
    if not raw:
        return None
    try:
        return json.loads(raw)
    except Exception as error:
        logger.warning("Could not parse Firebase service account JSON: %s", error)
        return None


def _firebase_project_id(credentials_info: dict[str, Any] | None = None) -> str | None:
    return FIREBASE_PROJECT_ID or (credentials_info or {}).get("project_id")


def subscription_to_webpush_info(subscription: PushSubscription) -> dict[str, Any]:
    return {
        "endpoint": subscription.endpoint,
        "keys": {
            "p256dh": subscription.p256dh_key,
            "auth": subscription.auth_key,
        },
    }


def subscription_to_dict(subscription: PushSubscription) -> dict[str, Any]:
    return {
        "id": subscription.id,
        "browser": subscription.browser,
        "platform": subscription.platform,
        "device_label": subscription.device_label,
        "channel": "native_app" if is_fcm_subscription(subscription) else "web_push",
        "is_active": subscription.is_active,
        "created_at": _iso(subscription.created_at),
        "updated_at": _iso(subscription.updated_at),
        "last_success_at": _iso(subscription.last_success_at),
        "last_failure_at": _iso(subscription.last_failure_at),
        "failure_count": subscription.failure_count or 0,
    }


def preference_to_dict(preferences: NotificationPreference) -> dict[str, Any]:
    return {
        "notifications_enabled": bool(preferences.notifications_enabled),
        "quiet_hours_enabled": bool(preferences.quiet_hours_enabled),
        "quiet_hours_start": preferences.quiet_hours_start,
        "quiet_hours_end": preferences.quiet_hours_end,
        "timezone": preferences.timezone,
        "channels_enabled": preferences.channels_enabled or {"web_push": True},
        "notification_types_enabled": preferences.notification_types_enabled or {},
    }


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def save_push_subscription(db: Session, user_number: str, payload: PushSubscriptionPayload) -> PushSubscription:
    return NotificationService(db).save_subscription(user_number, payload)


def unsubscribe_push_subscription(
    db: Session,
    user_number: str,
    endpoint: str | None = None,
    subscription_id: int | None = None,
) -> int:
    return NotificationService(db).unsubscribe(user_number, endpoint=endpoint, subscription_id=subscription_id)


def get_notification_preferences(db: Session, user_number: str) -> NotificationPreference:
    return NotificationService(db).get_or_create_preferences(user_number)


def update_notification_preferences(
    db: Session,
    user_number: str,
    notifications_enabled: bool | None = None,
    notification_types_enabled: dict[str, bool] | None = None,
    timezone: str | None = None,
) -> NotificationPreference:
    return NotificationService(db).update_preferences(
        user_number,
        notifications_enabled=notifications_enabled,
        notification_types_enabled=notification_types_enabled,
        timezone=timezone,
    )


def send_notification(
    db: Session,
    user_number: str,
    title: str,
    body: str,
    url: str | None = None,
    notification_type: str | None = None,
    source_service: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> NotificationResult:
    return NotificationService(db).send(
        NotificationPayload(
            user_number=user_number,
            title=title,
            body=body,
            url=url,
            notification_type=notification_type,
            source_service=source_service,
            metadata=metadata,
        )
    )
