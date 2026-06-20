from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.services.notifications import (
    NotificationPayload,
    NotificationService,
    PushSubscriptionKeys,
    PushSubscriptionPayload,
)
from app.services.notifications.push_service import preference_to_dict, subscription_to_dict


router = APIRouter(prefix="/notifications", tags=["notifications"])


class PushKeysRequest(BaseModel):
    p256dh: str
    auth: str


class SubscribeRequest(BaseModel):
    user_number: str
    endpoint: str
    keys: PushKeysRequest
    browser: str | None = None
    platform: str | None = None
    device_label: str | None = None


class UnsubscribeRequest(BaseModel):
    user_number: str
    endpoint: str | None = None
    subscription_id: int | None = None


class PreferencesRequest(BaseModel):
    user_number: str
    notifications_enabled: bool | None = None
    notification_types_enabled: dict[str, bool] | None = None
    timezone: str | None = None


class TestNotificationRequest(BaseModel):
    user_number: str
    title: str = Field(default="Alfred notifications are ready", max_length=220)
    body: str = Field(default="This is a test notification from Alfred.")
    url: str | None = "/settings"
    notification_type: str | None = "test"
    source_service: str | None = "settings"
    metadata: dict[str, Any] | None = None


def _require_user(db: Session, user_number: str) -> User:
    user = db.query(User).filter((User.phone_number == user_number) | (User.email == user_number)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.post("/subscribe")
def subscribe(request: SubscribeRequest, db: Session = Depends(get_db)):
    _require_user(db, request.user_number)
    subscription = NotificationService(db).save_subscription(
        request.user_number,
        PushSubscriptionPayload(
            endpoint=request.endpoint,
            keys=PushSubscriptionKeys(p256dh=request.keys.p256dh, auth=request.keys.auth),
            browser=request.browser,
            platform=request.platform,
            device_label=request.device_label,
        ),
    )
    return {
        "status": "subscribed",
        "subscription": subscription_to_dict(subscription),
    }


@router.post("/unsubscribe")
def unsubscribe(request: UnsubscribeRequest, db: Session = Depends(get_db)):
    _require_user(db, request.user_number)
    deactivated_count = NotificationService(db).unsubscribe(
        request.user_number,
        endpoint=request.endpoint,
        subscription_id=request.subscription_id,
    )
    return {
        "status": "unsubscribed",
        "deactivated_count": deactivated_count,
    }


@router.get("/status")
def status(user_number: str, db: Session = Depends(get_db)):
    _require_user(db, user_number)
    return NotificationService(db).status(user_number)


@router.put("/preferences")
def update_preferences(request: PreferencesRequest, db: Session = Depends(get_db)):
    _require_user(db, request.user_number)
    preferences = NotificationService(db).update_preferences(
        request.user_number,
        notifications_enabled=request.notifications_enabled,
        notification_types_enabled=request.notification_types_enabled,
        timezone=request.timezone,
    )
    return {
        "status": "updated",
        "preferences": preference_to_dict(preferences),
    }


@router.post("/test")
def send_test_notification(request: TestNotificationRequest, db: Session = Depends(get_db)):
    _require_user(db, request.user_number)
    result = NotificationService(db).send(
        NotificationPayload(
            user_number=request.user_number,
            title=request.title,
            body=request.body,
            url=request.url,
            notification_type=request.notification_type,
            source_service=request.source_service,
            metadata=request.metadata,
        )
    )
    return {
        "status": "attempted",
        "result": result.to_dict(),
    }
