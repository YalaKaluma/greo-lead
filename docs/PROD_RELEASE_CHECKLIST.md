# Production Release Checklist

Use this before a deliberate production release, typically Sunday.

- [ ] Confirm Railway development is healthy.
- [ ] Confirm the `main` branch has been tested in development.
- [ ] Review commits since the last production release.
- [ ] Review Alembic migrations included in the release.
- [ ] Confirm production backup and restore readiness.
- [ ] Open or update a PR from `main` into `prod`.
- [ ] Confirm Production Release CI passes.
- [ ] Run the production migration intentionally with the production `DIRECT_DATABASE_URL`.
- [ ] Merge or push to `prod`.
- [ ] Confirm Railway production deployment succeeds.
- [ ] Run a production smoke test, including `/api/health`.
- [ ] Review Railway production logs.
- [ ] Notify or invite users if needed.

Production migration command:

```bash
DIRECT_DATABASE_URL="postgresql://..." alembic upgrade head
```
