"""Central password policy used by registration and password changes."""

from __future__ import annotations


MIN_PASSWORD_LENGTH = 12
MAX_PASSWORD_LENGTH = 128
COMMON_PASSWORDS = {
    "123456789012",
    "password1234",
    "qwerty123456",
    "letmein123456",
    "alfred123456",
}


def password_policy_error(password: str) -> str | None:
    if len(password) < MIN_PASSWORD_LENGTH:
        return f"Password must be at least {MIN_PASSWORD_LENGTH} characters"
    if len(password) > MAX_PASSWORD_LENGTH:
        return f"Password must be no more than {MAX_PASSWORD_LENGTH} characters"
    if password.casefold() in COMMON_PASSWORDS:
        return "Choose a less common password"
    return None
