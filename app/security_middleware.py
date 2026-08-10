from __future__ import annotations

import os
import time
from urllib.parse import urlsplit
from collections import defaultdict, deque
from dataclasses import dataclass

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, Response

from app.utils.session_cookie import SESSION_COOKIE_NAME
from app.utils.security import decode_session_token


SECURITY_HEADERS = {
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    # Allow Alfred to use the microphone on its own origin while continuing to
    # deny microphone access to embedded/cross-origin content.
    "Permissions-Policy": "camera=(), microphone=(self), geolocation=()",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
}

PRODUCTION_CSP = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: https:; "
    "connect-src 'self' https:; "
    "font-src 'self' data:; "
    "frame-ancestors 'none'; "
    "base-uri 'self'; "
    "form-action 'self'"
)

DEVELOPMENT_CSP = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: blob: https: http:; "
    "connect-src 'self' https: http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*; "
    "font-src 'self' data:; "
    "frame-ancestors 'none'; "
    "base-uri 'self'; "
    "form-action 'self'"
)


def get_content_security_policy() -> str:
    environment = (
        os.getenv("ENVIRONMENT")
        or os.getenv("RAILWAY_ENVIRONMENT_NAME")
        or os.getenv("APP_ENV")
        or "development"
    ).lower()
    if environment in {"production", "prod"}:
        return PRODUCTION_CSP
    return DEVELOPMENT_CSP


def apply_security_headers(response: Response) -> Response:
    for header, value in SECURITY_HEADERS.items():
        response.headers.setdefault(header, value)
    response.headers.setdefault("Content-Security-Policy", get_content_security_policy())
    return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        return apply_security_headers(response)


def trusted_application_origins() -> set[str]:
    origins = {
        "http://localhost",
        "https://localhost",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "capacitor://localhost",
        "ionic://localhost",
    }
    public_app_url = os.getenv("PUBLIC_APP_URL") or os.getenv("APP_URL")
    if public_app_url:
        parsed = urlsplit(public_app_url)
        if parsed.scheme in {"http", "https"} and parsed.netloc:
            origins.add(f"{parsed.scheme}://{parsed.netloc}")
    return origins


COOKIE_INDEPENDENT_AUTH_PATHS = {
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/password-recovery/request",
    "/api/auth/password-recovery/reset",
    "/api/onboarding/login",
}


def request_origin_is_trusted(request: Request, origin: str) -> bool:
    """Accept configured origins and the request's actual same-site origin."""
    normalized_origin = origin.rstrip("/")
    if normalized_origin in trusted_application_origins():
        return True

    parsed = urlsplit(normalized_origin)
    request_host = request.headers.get("host", "").strip().casefold()
    forwarded_proto = request.headers.get("x-forwarded-proto", "").split(",", 1)[0].strip()
    request_scheme = (forwarded_proto or request.url.scheme).casefold()
    return (
        parsed.scheme.casefold() in {"http", "https"}
        and parsed.scheme.casefold() == request_scheme
        and parsed.netloc.casefold() == request_host
    )


class CsrfProtectionMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        unsafe_method = request.method.upper() not in {"GET", "HEAD", "OPTIONS"}
        if unsafe_method and request.url.path in COOKIE_INDEPENDENT_AUTH_PATHS:
            # These endpoints authenticate only from their request body. An old
            # session cookie must not prevent a user from signing in again.
            return await call_next(request)
        cookie_authenticated = bool(request.cookies.get(SESSION_COOKIE_NAME))
        bearer_authenticated = request.headers.get("authorization", "").lower().startswith("bearer ")
        if unsafe_method and cookie_authenticated and not bearer_authenticated:
            origin = request.headers.get("origin", "").rstrip("/")
            if not request_origin_is_trusted(request, origin):
                return apply_security_headers(
                    JSONResponse({"detail": "Untrusted request origin"}, status_code=403)
                )
        return await call_next(request)


@dataclass(frozen=True)
class RateLimitRule:
    requests: int
    window_seconds: int = 60


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(
        self,
        app,
        auth_limit: RateLimitRule = RateLimitRule(5),
        ai_limit: RateLimitRule = RateLimitRule(20),
        general_limit: RateLimitRule = RateLimitRule(100),
    ):
        super().__init__(app)
        self.auth_limit = auth_limit
        self.ai_limit = ai_limit
        self.general_limit = general_limit
        self._buckets: dict[str, deque[float]] = defaultdict(deque)

    async def dispatch(self, request: Request, call_next):
        rule = self._rule_for_path(request.url.path)
        if rule is None:
            return await call_next(request)

        now = time.monotonic()
        key = self._rate_limit_key(request, rule)
        bucket = self._buckets[key]
        while bucket and now - bucket[0] >= rule.window_seconds:
            bucket.popleft()

        remaining = max(rule.requests - len(bucket), 0)
        if remaining <= 0:
            response = JSONResponse(
                {"detail": "Rate limit exceeded"},
                status_code=429,
            )
            response.headers["X-RateLimit-Limit"] = str(rule.requests)
            response.headers["X-RateLimit-Remaining"] = "0"
            response.headers["Retry-After"] = str(rule.window_seconds)
            return apply_security_headers(response)

        bucket.append(now)
        response = await call_next(request)
        response.headers.setdefault("X-RateLimit-Limit", str(rule.requests))
        response.headers.setdefault("X-RateLimit-Remaining", str(max(rule.requests - len(bucket), 0)))
        return response

    def _rule_for_path(self, path: str) -> RateLimitRule | None:
        if path in {
            "/api/auth/login",
            "/api/auth/register",
            "/api/auth/change-password",
            "/api/onboarding/login",
            "/api/onboarding/verify-email",
            "/api/auth/password-recovery/request",
            "/api/auth/password-recovery/reset",
        } or "reset-password" in path or "send-invitation" in path:
            return self.auth_limit
        if any(marker in path for marker in (
            "/chat",
            "/message-signals",
            "/audio/",
            "/belt-assessments/submit",
            "/belt-trials",
            "/generate-roadmap",
            "/opportunities/generate",
            "/coaching/refresh",
            "/leadership-coaching/message",
            "/priority",
        )):
            return self.ai_limit
        if path.startswith("/api/"):
            return self.general_limit
        return None

    def _rate_limit_key(self, request: Request, rule: RateLimitRule) -> str:
        client_ip = request.client.host if request.client else "unknown"
        if rule == self.auth_limit:
            identity = client_ip
            scope = "auth"
        else:
            authorization = request.headers.get("authorization", "")
            token = request.cookies.get(SESSION_COOKIE_NAME)
            if authorization.lower().startswith("bearer "):
                token = authorization.split(" ", 1)[1].strip()
            payload = decode_session_token(token) if token else None
            identity = f"user:{payload['sub']}" if payload else f"ip:{client_ip}"
            scope = "ai" if rule == self.ai_limit else "general"
        return f"{scope}:{identity}:{rule.requests}:{rule.window_seconds}"
