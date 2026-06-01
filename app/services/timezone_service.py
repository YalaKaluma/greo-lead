from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy.orm import Session

from app.models import User

DEFAULT_TIMEZONE = "America/New_York"


def normalize_timezone(timezone_name: str | None) -> str:
    if not timezone_name:
        return DEFAULT_TIMEZONE

    try:
        ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        return DEFAULT_TIMEZONE

    return timezone_name


def get_user_timezone(db: Session, user_number: str) -> str:
    user = db.query(User).filter(User.phone_number == user_number).first()
    if not user:
        return DEFAULT_TIMEZONE

    return normalize_timezone(getattr(user, "timezone_preference", None))


def today_for_timezone(timezone_name: str | None):
    return datetime.now(ZoneInfo(normalize_timezone(timezone_name))).date()
