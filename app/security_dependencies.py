"""Reusable authorization dependencies for privileged non-user surfaces."""

from __future__ import annotations

import hmac
import os

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.routers.auth import require_authenticated_user


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
        if getattr(user, "is_admin", False):
            return user
        raise HTTPException(status_code=403, detail="Administrator access required")

    raise HTTPException(status_code=401, detail="Scheduler or administrator authentication required")
