"""Integration tests for session persistence using real DB rows and HTTP cookies."""
import time
from datetime import datetime, timedelta

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import get_db
from app.models import AuditLog, DeviceSession, User
from app.routers import auth
from app.security_dependencies import require_scheduler_or_admin
from app.security_middleware import CsrfProtectionMiddleware, RateLimitMiddleware, RateLimitRule
from app.utils.security import ACCESS_TOKEN_TTL_SECONDS, ADMIN_REAUTH_TTL_SECONDS, create_session_token, decode_session_token, hash_password
from app.utils.session_cookie import REFRESH_COOKIE_NAME, SESSION_COOKIE_NAME

PASSWORD = 'A long session test password!'
ORIGIN = {'Origin': 'https://testserver'}
NATIVE = {**ORIGIN, 'X-Alfred-Client': 'native'}


@compiles(JSONB, 'sqlite')
def _sqlite_jsonb(_type, _compiler, **_kw):
    return 'JSON'


@pytest.fixture
def system(monkeypatch):
    monkeypatch.setenv('APP_SESSION_SECRET', 'device-session-test-key-with-at-least-32-characters')
    from app.utils import session_cookie
    monkeypatch.setattr(session_cookie, 'PUBLIC_APP_URL', 'https://testserver')
    clock = [int(time.time())]
    monkeypatch.setattr(time, 'time', lambda: clock[0])
    engine = create_engine('sqlite://', poolclass=StaticPool, connect_args={'check_same_thread': False})
    for model in [User, AuditLog, DeviceSession]:
        model.__table__.create(engine)
    sessions = sessionmaker(bind=engine)
    with sessions() as db:
        db.add(User(id=1, name='session-user', phone_number='session-user', email='session@example.com',
                    password_hash=hash_password(PASSWORD), is_active=True, is_admin=True,
                    session_version=0, tour_completed=True))
        db.commit()
    app = FastAPI()
    app.add_middleware(CsrfProtectionMiddleware)
    app.include_router(auth.router, prefix='/api/auth')

    @app.get('/api/scheduler-test')
    def scheduler_test(_user=Depends(require_scheduler_or_admin)):
        return {'success': True}

    def get_test_db():
        with sessions() as db:
            yield db
    app.dependency_overrides[get_db] = get_test_db
    def client():
        return TestClient(app, base_url='https://testserver')
    yield client, sessions, clock, app
    engine.dispose()


def login(client, *, remember=True, modern=True, native=True):
    response = client.post('/api/auth/login', json={
        'username': 'session-user', 'password': PASSWORD,
        'remember_device': remember, 'session_protocol': 'device-v1' if modern else 'legacy',
    }, headers=NATIVE if native else ORIGIN)
    assert response.status_code == 200
    assert response.json()['success']
    return response


def refresh(client, token=None, native=True):
    return client.post('/api/auth/refresh', json={'refresh_token': token}, headers=NATIVE if native else ORIGIN)


def bearer(token):
    return {'Authorization': f'Bearer {token}'}


def test_admin_daily_access_survives_eight_hours_but_elevation_does_not(system):
    make, sessions, clock, _ = system
    client = make()
    first = login(client).json()
    claims = decode_session_token(first['access_token'])
    assert claims['exp'] - claims['iat'] == first['expires_in'] == ACCESS_TOKEN_TTL_SECONDS
    assert first['refresh_expires_in'] == 30 * 86400
    clock[0] += 9 * 3600
    assert client.get('/api/auth/me', headers=bearer(first['access_token'])).status_code == 401
    renewed = refresh(client, first['refresh_token'])
    assert renewed.status_code == 200
    token = renewed.json()['access_token']
    assert client.get('/api/auth/me', headers=bearer(token)).status_code == 200
    locked = client.get('/api/auth/admin-session', headers=bearer(token))
    assert locked.status_code == 403
    assert locked.json()['detail']['code'] == 'admin_reauthentication_required'
    assert client.get('/api/scheduler-test', headers=bearer(token)).status_code == 403
    assert decode_session_token(token)['auth_time'] == claims['auth_time']
    bad = client.post('/api/auth/reauthenticate', json={'password': 'wrong'}, headers={**ORIGIN, **bearer(token)})
    assert bad.status_code == 403
    unlocked = client.post('/api/auth/reauthenticate', json={'password': PASSWORD}, headers={**ORIGIN, **bearer(token)})
    assert unlocked.status_code == 200
    new_token = unlocked.json()['access_token']
    assert client.get('/api/auth/admin-session', headers=bearer(new_token)).status_code == 200
    assert client.get('/api/scheduler-test', headers=bearer(new_token)).status_code == 200
    # Reauthentication does not revive an older access token's elevated rights.
    assert client.get('/api/auth/admin-session', headers=bearer(token)).status_code == 403


def test_refresh_rotation_handles_concurrent_or_lost_responses_then_rejects_replay(system):
    make, sessions, clock, _ = system
    client = make()
    first = login(client).json()
    second = refresh(client, first['refresh_token']).json()
    assert second['refresh_token'] != first['refresh_token']
    assert refresh(client, first['refresh_token']).json()['refresh_token'] == second['refresh_token']
    with sessions() as db:
        session = db.query(DeviceSession).one()
        assert first['refresh_token'] not in (session.refresh_hash, session.previous_refresh_hash)
        assert second['refresh_token'] not in (session.refresh_hash, session.previous_refresh_hash)
    clock[0] += 61
    assert refresh(client, first['refresh_token']).status_code == 401
    assert refresh(client, second['refresh_token']).status_code == 401
    assert client.get('/api/auth/me', headers=bearer(second['access_token'])).status_code == 401


def test_guessed_refresh_does_not_revoke_a_valid_session(system):
    make, _, _, _ = system
    client = make()
    first = login(client).json()
    sid = first['refresh_token'].split('.')[0]
    assert refresh(client, sid + '.' + 'x' * 43).status_code == 401
    assert refresh(client, first['refresh_token']).status_code == 200


def test_logout_revokes_only_current_device_and_logout_all_revokes_both(system):
    make, _, _, _ = system
    a, b = make(), make()
    one, two = login(a).json(), login(b).json()
    assert a.post('/api/auth/logout', headers=ORIGIN).status_code == 200
    assert a.get('/api/auth/me', headers=bearer(one['access_token'])).status_code == 401
    assert refresh(a, one['refresh_token']).status_code == 401
    assert b.get('/api/auth/me').status_code == 200
    assert refresh(b, two['refresh_token']).status_code == 200
    three = login(a).json()
    assert b.post('/api/auth/logout-all', headers=ORIGIN).status_code == 200
    assert refresh(a, three['refresh_token']).status_code == 401
    assert a.get('/api/auth/me', headers=bearer(three['access_token'])).status_code == 401
    assert b.get('/api/auth/me').status_code == 401


def test_pre_upgrade_logout_revokes_only_that_token(system):
    make, _, _, _ = system
    a = make()
    one, two = create_session_token(1, 'session-user'), create_session_token(1, 'session-user')
    assert a.post('/api/auth/logout', headers=bearer(one)).status_code == 200
    assert a.get('/api/auth/me', headers=bearer(one)).status_code == 401
    assert a.get('/api/auth/me', headers=bearer(two)).status_code == 200


@pytest.mark.parametrize('change', ['version', 'inactive', 'password'])
def test_security_events_invalidate_access_and_refresh(system, change):
    make, sessions, _, _ = system
    client = make()
    first = login(client).json()
    if change == 'password':
        assert client.post('/api/auth/change-password', json={
            'current_password': PASSWORD, 'new_password': PASSWORD + ' changed',
        }, headers=ORIGIN).status_code == 200
    else:
        with sessions() as db:
            user = db.get(User, 1)
            if change == 'version':
                user.session_version += 1
            else:
                user.is_active = False
            db.commit()
    assert refresh(client, first['refresh_token']).status_code == 401
    assert client.get('/api/auth/me', headers=bearer(first['access_token'])).status_code == 401


def test_absolute_expiry_and_unremembered_sessions(system):
    make, _, clock, _ = system
    a, b = make(), make()
    remembered = login(a).json()
    temporary = login(b, remember=False)
    assert temporary.json()['refresh_expires_in'] == 8 * 3600
    assert all('Max-Age=' not in c for c in temporary.headers.get_list('set-cookie'))
    clock[0] += 8 * 3600
    assert refresh(b, temporary.json()['refresh_token']).status_code == 401
    renewed = refresh(a, remembered['refresh_token']).json()
    assert renewed['refresh_expires_in'] == 30 * 86400 - 8 * 3600
    clock[0] += 30 * 86400 - 8 * 3600
    assert refresh(a, renewed['refresh_token']).status_code == 401


def test_browser_refresh_cookie_is_protected_even_without_access_cookie(system):
    make, _, clock, _ = system
    client = make()
    response = login(client, native=False)
    assert 'refresh_token' not in response.json()
    assert response.headers['cache-control'] == 'no-store'
    cookies = response.headers.get_list('set-cookie')
    assert all('HttpOnly' in c and 'Secure' in c and 'SameSite=lax' in c for c in cookies)
    assert any('alfred_refresh=' in c and 'Path=/api/auth' in c for c in cookies)
    clock[0] += ACCESS_TOKEN_TTL_SECONDS + 1
    client.cookies.delete(SESSION_COOKIE_NAME)
    assert client.post('/api/auth/refresh', json={}).status_code == 403
    assert client.post('/api/auth/refresh', json={}, headers={'Origin': 'https://evil.example'}).status_code == 403
    good = refresh(client, native=False)
    assert good.status_code == 200
    assert 'refresh_token' not in good.json()
    assert client.get('/api/auth/me').status_code == 200


def test_mobile_restores_with_only_securely_stored_refresh_credential(system):
    make, _, clock, _ = system
    first = login(make()).json()
    clock[0] += 2 * 86400
    restarted = make()
    resumed = refresh(restarted, first['refresh_token'])
    assert resumed.status_code == 200
    restarted.cookies.clear()
    assert restarted.get('/api/auth/me', headers=bearer(resumed.json()['access_token'])).status_code == 200


def test_older_mobile_builds_keep_supported_expiry_and_truthful_metadata(system):
    make, _, _, _ = system
    response = login(make(), modern=False)
    claims = decode_session_token(response.json()['access_token'])
    assert response.json()['expires_in'] == claims['exp'] - claims['iat'] == 8 * 3600
    assert any('Max-Age=28800' in c and 'alfred_session=' in c for c in response.headers.get_list('set-cookie'))


def test_reauthentication_password_attempts_are_rate_limited(system):
    make, _, _, app = system
    app.add_middleware(RateLimitMiddleware, auth_limit=RateLimitRule(2, 60))
    client = make()
    login(client)
    assert client.post('/api/auth/reauthenticate', json={'password': 'wrong'}, headers=ORIGIN).status_code == 403
    assert client.post('/api/auth/reauthenticate', json={'password': 'wrong'}, headers=ORIGIN).status_code == 429


def test_onboarding_credentials_never_set_a_session_on_failure_and_temp_login_works(system):
    from app.routers.onboarding import public_router
    make, sessions, _, app = system
    app.include_router(public_router, prefix='/api/onboarding')
    with sessions() as db:
        user = db.get(User, 1)
        user.password_hash = None
        db.commit()
    client = make()
    missing = client.post('/api/onboarding/login', json={'user_id': 1, 'password': 'anything'}, headers=NATIVE)
    assert not missing.json()['success']
    assert not missing.headers.get_list('set-cookie')
    with sessions() as db:
        user = db.get(User, 1)
        user.temp_password = hash_password('CaseSensitivePass!')
        user.temp_password_expires = datetime.utcnow() + timedelta(hours=1)
        db.commit()
    signed_in = client.post('/api/onboarding/login', json={
        'user_id': 1, 'password': 'CaseSensitivePass!', 'session_protocol': 'device-v1',
    }, headers=NATIVE)
    assert signed_in.json()['success']
    assert signed_in.json()['must_change_password']
    assert signed_in.json()['remember_device'] is False
    assert signed_in.json()['refresh_expires_in'] <= 30 * 60
    assert client.get('/api/auth/me').status_code == 200
    used_again = client.post('/api/onboarding/login', json={'user_id': 1, 'password': 'CaseSensitivePass!'}, headers=NATIVE)
    assert not used_again.json()['success']
