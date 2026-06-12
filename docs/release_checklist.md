# Release Checklist

Use this checklist before every production release to `prod`.

## Before Release

- [ ] Confirm Security CI passed for backend tests, frontend build, Bandit, pip-audit, and Gitleaks.
- [ ] Confirm migrations were reviewed and are safe to run.
- [ ] Confirm Neon backup/restore window is available.
- [ ] Confirm rollback plan and restore decision owner.
- [ ] Confirm no secrets were committed.
- [ ] Confirm frontend build succeeds.
- [ ] Confirm staging smoke test passed.
- [ ] Confirm `scripts/db_health_check.py` can run against the intended database without exposing private content.

## Smoke Test Endpoints And Pages

- [ ] `GET /api/health`
- [ ] `POST /api/auth/login`
- [ ] `GET /api/tasks?user_number=<test-user>`
- [ ] `GET /api/journey/goals?user_number=<test-user>`
- [ ] `GET /api/journal?user_id=<test-user-id>`
- [ ] Settings page
- [ ] Journey page
- [ ] Journal page
- [ ] Task list

## After Release

- [ ] Check Railway deployment logs.
- [ ] Check `/api/health`.
- [ ] Check login.
- [ ] Check task list.
- [ ] Check Journey page.
- [ ] Check journal page.
- [ ] Check Alfred System Health or error logs.
- [ ] Confirm no unexpected authentication, database, OpenAI, or email errors.

## Emergency Rollback

1. Revert or roll back the Railway deployment.
2. Restore database only if data corruption occurred.
3. Do not restore database for frontend-only issues.
4. Document the incident in release notes.
5. Run smoke tests after rollback or restore.
