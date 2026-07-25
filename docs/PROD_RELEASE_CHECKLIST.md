# Production Release Checklist

Use this before a deliberate production release, typically Sunday.

- [ ] Confirm Railway development is healthy.
- [ ] Confirm the `main` branch has been tested in development.
- [ ] Review commits since the last production release.
- [ ] Review Alembic migrations included in the release.
- [ ] Confirm production backup and restore readiness.
- [ ] Open or update a PR from `main` into `prod`.
- [ ] Confirm Production Release CI passes.
- [ ] Confirm backend tests, frontend tests, i18n check, frontend build, Gitleaks, Bandit, and pip-audit have passed or have documented exceptions.
- [ ] Run the production migration intentionally with the production `DIRECT_DATABASE_URL`.
- [ ] Merge or push to `prod`.
- [ ] Confirm Railway production deployment succeeds.
- [ ] Run a production smoke test, including `/api/health`.
- [ ] Smoke test Home, Goals, Tasks (list and calendar), Meetings, Journey, Journal, Habits, Settings, notifications status, and admin System Health.
- [ ] Build/upload/test Play Store internal testing app if this release includes Android.
- [ ] Review Railway production logs.
- [ ] Notify or invite users if needed.

## Android Production App

- [ ] Confirm this release should include a Play Store app update.
- [ ] Confirm production app identity:
  - App name: Alfred
  - Package ID: com.AlfredTheChiefOfStaff.myapp
  - API URL: production Railway URL
- [ ] Confirm dev identity remains separate:
  - App name: Alfred (dev)
  - Package ID: com.AlfredTheChiefOfStaff.myapp.dev
  - API URL: Railway development URL
- [ ] Confirm the package ID matches the Play Console app before uploading; Android package IDs cannot be changed after Play publication.
- [ ] Confirm app icon, splash screen, and display name are production-ready.
- [ ] Confirm mobile notifications are either intentionally deferred or fully configured for production.
- [ ] Build signed production Android App Bundle (`.aab`) in GitHub Actions.
- [ ] Upload `.aab` to Play Console internal testing.
- [ ] Complete or review Play Console requirements:
  - Store listing
  - Screenshots
  - Privacy policy
  - Data safety form
  - App access instructions if login is required
- [ ] Install the Play internal testing build from Google Play.
- [ ] Smoke test the Play-installed app against production.
- [ ] Confirm no dev API, dev app name, or dev package ID is present in the Play build.
- [ ] Promote release track only after production backend smoke tests pass.

## Production Migration Command

```bash
DIRECT_DATABASE_URL="postgresql://..." alembic upgrade head
