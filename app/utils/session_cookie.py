from urllib.parse import urlsplit

from fastapi import Response

from app.config import PUBLIC_APP_URL
from app.utils.security import SESSION_TOKEN_TTL_SECONDS


SESSION_COOKIE_NAME = "alfred_session"
REFRESH_COOKIE_NAME = "alfred_refresh"


def _secure_cookie() -> bool:
    return urlsplit(PUBLIC_APP_URL or "").scheme.lower() == "https"


def set_session_cookie(response: Response, token: str, *, max_age: int | None = SESSION_TOKEN_TTL_SECONDS) -> None:
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=max_age,
        httponly=True,
        secure=_secure_cookie(),
        samesite="lax",
        path="/",
    )


def set_refresh_cookie(response: Response, token: str, *, max_age: int | None) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE_NAME, value=token, max_age=max_age,
        httponly=True, secure=_secure_cookie(), samesite="lax", path="/api/auth",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=REFRESH_COOKIE_NAME, httponly=True, secure=_secure_cookie(),
        samesite="lax", path="/api/auth",
    )
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        httponly=True,
        secure=_secure_cookie(),
        samesite="lax",
        path="/",
    )
