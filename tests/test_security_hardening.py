import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.security_middleware import RateLimitMiddleware, RateLimitRule, SecurityHeadersMiddleware


class EmptyQuery:
    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return None


class EmptyDb:
    def query(self, *args, **kwargs):
        return EmptyQuery()


def test_security_headers_are_present_on_basic_api_response():
    app = FastAPI()
    app.add_middleware(SecurityHeadersMiddleware)

    @app.get("/api/ping")
    def ping():
        return {"ok": True}

    response = TestClient(app).get("/api/ping")

    assert response.status_code == 200
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
    assert response.headers["Permissions-Policy"] == "camera=(), microphone=(), geolocation=()"
    assert "default-src 'self'" in response.headers["Content-Security-Policy"]


def test_rate_limited_endpoint_returns_429_after_excessive_requests():
    app = FastAPI()
    app.add_middleware(
        RateLimitMiddleware,
        auth_limit=RateLimitRule(2, 60),
        ai_limit=RateLimitRule(2, 60),
        general_limit=RateLimitRule(2, 60),
    )

    @app.post("/api/auth/login")
    def login():
        return {"success": False}

    client = TestClient(app)

    assert client.post("/api/auth/login").status_code == 200
    assert client.post("/api/auth/login").status_code == 200
    response = client.post("/api/auth/login")

    assert response.status_code == 429
    assert response.headers["X-RateLimit-Limit"] == "2"
    assert response.headers["Retry-After"] == "60"


def test_user_cannot_read_other_users_journal_entry():
    from app.routers.journal import get_entry

    with pytest.raises(HTTPException) as exc_info:
        get_entry(entry_id=100, user_id=1, db=EmptyDb())

    assert exc_info.value.status_code == 404


def test_user_cannot_update_other_users_task():
    from app.routers.tasks import TaskUpdate, update_task

    with pytest.raises(HTTPException) as exc_info:
        update_task(task_id=100, user_number="user-a", updates=TaskUpdate(title="Nope"), db=EmptyDb())

    assert exc_info.value.status_code == 404


def test_user_cannot_delete_other_users_goal():
    from app.routers.journey import delete_goal

    with pytest.raises(HTTPException) as exc_info:
        delete_goal(goal_id=100, user_number="user-a", db=EmptyDb())

    assert exc_info.value.status_code == 404


def test_user_cannot_access_other_users_journey_belt_trial():
    from app.routers.journey import BeltTrialSubmit, submit_belt_trial_response

    payload = BeltTrialSubmit(response_text="Some reflection")
    with pytest.raises(HTTPException) as exc_info:
        submit_belt_trial_response(trial_id=100, trial_data=payload, user_number="user-a", db=EmptyDb())

    assert exc_info.value.status_code == 404


def test_user_cannot_delete_other_users_coaching_session():
    from app.routers.leadership_coaching_router import delete_session

    with pytest.raises(HTTPException) as exc_info:
        delete_session(session_id=100, user_number="user-a", db=EmptyDb())

    assert exc_info.value.status_code == 404
