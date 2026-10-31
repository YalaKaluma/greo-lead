"""Device-scoped revocation, bounded persistence, and rotating refresh tokens."""
import hashlib
import hmac
import secrets
import time

from fastapi import HTTPException, Response
from sqlalchemy.orm import Session

from app.models import DeviceSession, User
from app.utils.security import (
    ACCESS_TOKEN_TTL_SECONDS, ADMIN_SESSION_TOKEN_TTL_SECONDS, SESSION_TOKEN_TTL_SECONDS,
    create_session_token, next_refresh_secret,
)
from app.utils.session_cookie import set_refresh_cookie, set_session_cookie

REFRESH_GRACE_SECONDS = 60


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def session_is_valid(session: DeviceSession | None, user: User, now: int) -> bool:
    return bool(
        session and session.user_id == user.id and session.revoked_at is None
        and session.expires_at > now
        and session.session_version == int(user.session_version or 0)
        and user.is_active
    )


def session_response(user: User, session: DeviceSession, response: Response, *,
                     refresh_token: str | None = None, native: bool = False) -> dict:
    now = int(time.time())
    remaining = max(0, session.expires_at - now)
    ttl = min(ACCESS_TOKEN_TTL_SECONDS, remaining) if session.modern_client else remaining
    token = create_session_token(
        user.id, user.phone_number, session.session_version, ttl_seconds=ttl,
        session_id=session.id, auth_time=session.authenticated_at,
    )
    set_session_cookie(response, token, max_age=ttl if session.remember_device else None)
    if refresh_token:
        set_refresh_cookie(response, refresh_token, max_age=remaining if session.remember_device else None)
    response.headers["Cache-Control"] = "no-store"
    result = {
        "access_token": token, "token_type": "bearer",  # nosec B105 - protocol label
        "expires_in": ttl, "refresh_expires_in": remaining,
        "remember_device": session.remember_device,
    }
    if native and refresh_token:
        result["refresh_token"] = refresh_token
    return result


def create_device_session(db: Session, user: User, response: Response, *,
                          remember: bool, modern: bool, native: bool = False) -> dict:
    now = int(time.time())
    # Older installed apps have no refresh transport. Preserve their bounded
    # access lifetime until rebuilt; new clients always use short access tokens.
    lifetime = SESSION_TOKEN_TTL_SECONDS if remember else ADMIN_SESSION_TOKEN_TTL_SECONDS
    if not modern and user.is_admin:
        lifetime = min(lifetime, ADMIN_SESSION_TOKEN_TTL_SECONDS)
    if user.temp_password and not user.password_hash:
        lifetime = min(lifetime, 30 * 60)
        remember = False
    sid = secrets.token_urlsafe(32)
    secret = secrets.token_urlsafe(32)
    raw = f"{sid}.{secret}"
    session = DeviceSession(
        id=sid, user_id=user.id, session_version=int(user.session_version or 0),
        refresh_hash=token_hash(raw), previous_refresh_hash=None, refresh_generation=0,
        created_at=now, rotated_at=now, expires_at=now + lifetime,
        authenticated_at=now, revoked_at=None, remember_device=remember, modern_client=modern,
    )
    db.add(session)
    db.commit()
    return session_response(user, session, response, refresh_token=raw, native=native)


def rotate_session(db: Session, raw: str, response: Response, *, native: bool = False) -> dict:
    try:
        sid, secret = raw.split(".", 1)
    except ValueError:
        raise HTTPException(status_code=401, detail="Session expired or invalid") from None
    if len(sid) != 43 or len(secret) != 43:
        raise HTTPException(status_code=401, detail="Session expired or invalid")
    session = db.query(DeviceSession).filter(DeviceSession.id == sid).with_for_update().first()
    user = db.query(User).filter(User.id == session.user_id).first() if session else None
    now = int(time.time())
    if not user or not session_is_valid(session, user, now):
        raise HTTPException(status_code=401, detail="Session expired or invalid")
    supplied_hash = token_hash(raw)
    if hmac.compare_digest(supplied_hash, session.refresh_hash):
        session.previous_refresh_hash = session.refresh_hash
        session.refresh_generation += 1
        raw = f"{sid}.{next_refresh_secret(sid, session.refresh_generation, secret)}"
        session.refresh_hash = token_hash(raw)
        session.rotated_at = now
    elif session.previous_refresh_hash and hmac.compare_digest(supplied_hash, session.previous_refresh_hash):
        if now - session.rotated_at > REFRESH_GRACE_SECONDS:
            session.revoked_at = now
            db.commit()
            raise HTTPException(status_code=401, detail="Session expired or invalid")
        # Concurrent tabs and a retry after a lost response get the same successor.
        raw = f"{sid}.{next_refresh_secret(sid, session.refresh_generation, secret)}"
        if not hmac.compare_digest(token_hash(raw), session.refresh_hash):
            raise HTTPException(status_code=401, detail="Session expired or invalid")
    else:
        # An arbitrary guess must not be able to revoke a known session ID.
        raise HTTPException(status_code=401, detail="Session expired or invalid")
    db.commit()
    return session_response(user, session, response, refresh_token=raw, native=native)


def revoke_token_session(db: Session, user: User, payload: dict, token: str) -> None:
    now = int(time.time())
    sid = payload.get("sid")
    if sid:
        session = db.query(DeviceSession).filter(DeviceSession.id == sid, DeviceSession.user_id == user.id).with_for_update().first()
        if session:
            session.revoked_at = now
    else:
        # Pre-upgrade tokens lack a device ID. A hashed tombstone revokes only
        # this token, without unexpectedly logging the user's other devices out.
        sid = "legacy:" + token_hash(token)
        if db.get(DeviceSession, sid) is None:
            db.add(DeviceSession(
                id=sid, user_id=user.id, session_version=int(user.session_version or 0),
                refresh_hash="", refresh_generation=0, rotated_at=now, created_at=now,
                expires_at=int(payload["exp"]), authenticated_at=int(payload["iat"]),
                revoked_at=now, remember_device=False, modern_client=False,
            ))
    db.commit()
