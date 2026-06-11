import pytest
from fastapi import HTTPException

from app.routers import nudge


def test_dev_missing_user_number_raises_400():
    with pytest.raises(HTTPException) as exc_info:
        nudge.resolve_nudge_user_number(None, "morning", environment="development")

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail["error"] == "missing_user_number"
    assert exc_info.value.detail["environment"] == "development"


def test_dev_explicit_synthetic_user_resolves_to_query_param():
    target = nudge.resolve_nudge_user_number(
        "synthetic:executive_alex",
        "morning",
        environment="development",
    )

    assert target.user_number == "synthetic:executive_alex"
    assert target.environment == "development"
    assert target.source == "query_param"


def test_production_missing_user_number_uses_default(monkeypatch):
    monkeypatch.setattr(nudge, "DEFAULT_USER_NUMBER", "whatsapp:+15551234567")

    target = nudge.resolve_nudge_user_number(None, "morning", environment="production")

    assert target.user_number == "whatsapp:+15551234567"
    assert target.environment == "production"
    assert target.source == "default"


def test_production_explicit_user_number_overrides_default(monkeypatch):
    monkeypatch.setattr(nudge, "DEFAULT_USER_NUMBER", "whatsapp:+15551234567")

    target = nudge.resolve_nudge_user_number(
        "synthetic:executive_alex",
        "morning",
        environment="production",
    )

    assert target.user_number == "synthetic:executive_alex"
    assert target.environment == "production"
    assert target.source == "query_param"


def test_staging_missing_user_number_raises_400():
    with pytest.raises(HTTPException) as exc_info:
        nudge.resolve_nudge_user_number(None, "morning", environment="staging")

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail["error"] == "missing_user_number"
    assert exc_info.value.detail["environment"] == "staging"
