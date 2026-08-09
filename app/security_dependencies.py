"""Reusable authorization dependencies for privileged non-user surfaces."""

from __future__ import annotations

import hmac
import os

from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.routers.auth import require_authenticated_user, user_requires_password_change


def _user_identifiers(user: User) -> set[str]:
    return {
        str(value).strip().casefold()
        for value in (user.id, user.phone_number, user.email)
        if value is not None and str(value).strip()
    }


def ensure_user_identity(user: User, claimed_identity: str | int) -> None:
    if str(claimed_identity).strip().casefold() not in _user_identifiers(user):
        raise HTTPException(status_code=403, detail="Request identity does not match authenticated user")


async def require_authenticated_identity(
    request: Request,
    user: User = Depends(require_authenticated_user),
) -> User:
    """Reject caller-controlled identities that do not match the signed-in user."""

    if user_requires_password_change(user):
        raise HTTPException(status_code=403, detail="Password change required")

    allowed = _user_identifiers(user)
    claimed: list[str] = []
    for key in ("user_number", "user_id"):
        claimed.extend(request.query_params.getlist(key))

        path_value = request.path_params.get(key)
        if path_value is not None:
            claimed.append(str(path_value))

    # Some legacy clients supplied identity in headers. Treat those values as
    # untrusted claims too; authentication always comes from the bearer token.
    for header_name in ("x-user-number", "x-user-id"):
        header_value = request.headers.get(header_name)
        if header_value is not None:
            claimed.append(header_value)

    content_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    if content_type == "application/json":
        try:
            payload = await request.json()
        except (ValueError, UnicodeDecodeError):
            payload = None
        if isinstance(payload, dict):
            for key in ("user_number", "user_id"):
                if payload.get(key) is not None:
                    claimed.append(str(payload[key]))

    if any(not value.strip() or value.strip().casefold() not in allowed for value in claimed):
        raise HTTPException(status_code=403, detail="Request identity does not match authenticated user")
    return user


def require_scheduler_or_admin(
    authorization: str | None = Header(default=None),
    scheduler_secret: str | None = Header(default=None, alias="X-Alfred-Scheduler-Secret"),
    db: Session = Depends(get_db),
) -> User | None:
    """Allow a dedicated scheduler credential or an authenticated administrator."""

    expected = os.getenv("ALFRED_SCHEDULER_SECRET", "").strip()
    supplied = (scheduler_secret or "").strip()
    if expected and len(expected) >= 32 and supplied and hmac.compare_digest(supplied, expected):
        return None

    if authorization:
        user = require_authenticated_user(authorization=authorization, db=db)
        if user_requires_password_change(user):
            raise HTTPException(status_code=403, detail="Password change required")
        if getattr(user, "is_admin", False):
            return user
        raise HTTPException(status_code=403, detail="Administrator access required")

    raise HTTPException(status_code=401, detail="Scheduler or administrator authentication required")
