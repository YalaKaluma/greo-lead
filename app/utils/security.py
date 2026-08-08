import base64
import hashlib
import hmac
import json
import os
import secrets
import time


PASSWORD_HASH_PREFIX = "pbkdf2_sha256"  # nosec B105 - algorithm marker, not a password.
PASSWORD_HASH_ITERATIONS = 260000
SESSION_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        PASSWORD_HASH_ITERATIONS,
    )
    salt_text = base64.urlsafe_b64encode(salt).decode("ascii")
    digest_text = base64.urlsafe_b64encode(digest).decode("ascii")
    return f"{PASSWORD_HASH_PREFIX}${PASSWORD_HASH_ITERATIONS}${salt_text}${digest_text}"


def verify_password(password: str, stored_value: str | None) -> bool:
    if not stored_value:
        return False

    if not stored_value.startswith(f"{PASSWORD_HASH_PREFIX}$"):
        return hmac.compare_digest(stored_value, password)

    try:
        _, iterations_text, salt_text, digest_text = stored_value.split("$", 3)
        iterations = int(iterations_text)
        salt = base64.urlsafe_b64decode(salt_text.encode("ascii"))
        expected_digest = base64.urlsafe_b64decode(digest_text.encode("ascii"))
    except (ValueError, TypeError):
        return False

    actual_digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        iterations,
    )
    return hmac.compare_digest(actual_digest, expected_digest)


def generate_temporary_password(length: int = 10) -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!#$%&*?"
    return "".join(secrets.choice(alphabet) for _ in range(length))


def _session_secret() -> bytes:
    value = os.getenv("APP_SESSION_SECRET", "").strip()
    if len(value) < 32:
        raise RuntimeError("APP_SESSION_SECRET must contain at least 32 characters")
    return value.encode("utf-8")


def _encode_token_part(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _decode_token_part(value: str) -> bytes:
    padding = "=" * ((4 - len(value) % 4) % 4)
    return base64.urlsafe_b64decode(f"{value}{padding}".encode("ascii"))


def create_session_token(user_id: int, user_number: str, session_version: int = 0) -> str:
    now = int(time.time())
    payload = {
        "sub": int(user_id),
        "usr": user_number,
        "ver": int(session_version),
        "iat": now,
        "exp": now + SESSION_TOKEN_TTL_SECONDS,
        "nonce": secrets.token_urlsafe(12),
    }
    payload_text = _encode_token_part(
        json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    )
    signature = hmac.new(_session_secret(), payload_text.encode("ascii"), hashlib.sha256).digest()
    return f"{payload_text}.{_encode_token_part(signature)}"


def decode_session_token(token: str) -> dict | None:
    try:
        payload_text, signature_text = token.split(".", 1)
        supplied_signature = _decode_token_part(signature_text)
        expected_signature = hmac.new(
            _session_secret(), payload_text.encode("ascii"), hashlib.sha256
        ).digest()
        if not hmac.compare_digest(supplied_signature, expected_signature):
            return None
        payload = json.loads(_decode_token_part(payload_text))
        if not isinstance(payload.get("sub"), int) or int(payload.get("exp", 0)) <= int(time.time()):
            return None
        return payload
    except (ValueError, TypeError, json.JSONDecodeError, RuntimeError):
        return None
