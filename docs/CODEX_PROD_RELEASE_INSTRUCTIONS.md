# Codex Production Release Instructions

Use this file whenever the user asks Codex to release Alfred to production.

## Required User Signal

Proceed only when the user explicitly asks for a production release or production deploy.

Before merging to production, confirm the user has completed a Neon production backup. If they have not said so, ask them to back up Neon first.

Suggested user brief:

```text
Please release Alfred to production. I backed up Neon. Promote latest main to prod safely: open/merge a main -> prod PR, wait for CI, confirm Railway deploy, and verify /api/health shows 200, ok, database connected, and the new commit. Do not force-push. Flag anything you cannot verify, especially migrations and authenticated smoke tests.
```

## Production Model

- `main` is active development and deploys to Railway development.
- `prod` is stable production and deploys to Railway production.
- GitHub Actions runs checks.
- Railway performs deployment after `prod` changes.
- Do not force-push or overwrite `prod`.
- Do not bypass GitHub CI unless the user explicitly accepts the risk.

## Standard Release Flow

1. Check the working tree and branch state.

```bash
git status --short --branch
git branch --all --verbose --no-abbrev
git log --oneline --decorate --max-count=8 --all
```

2. Review the documented release process.

```bash
cat docs/PROD_RELEASE_CHECKLIST.md
cat docs/CI_CD_AND_RELEASE_PROCESS.md
cat PROD_READINESS_RUNBOOK.md
```

3. Confirm the release range.

```bash
git log --oneline --decorate origin/prod..main
git diff --stat origin/prod..main
```

If local Git metadata is blocked or stale, use the GitHub connector to compare `main` and `prod`.

4. Run local checks when the local environment supports them.

Backend:

```bash
pytest
```

Frontend:

```bash
cd app/frontend
npm run i18n:check
npm run test
npm run build
```

If local checks cannot run because tooling is missing or blocked, do not hide it. Continue only if GitHub CI will run the equivalent checks.

5. Confirm Alembic state.

```bash
alembic heads
alembic current
```

Production migrations are manual and deliberate. If a migration is required, run it only with the production Neon direct connection string and only after backup readiness is confirmed:

```bash
DIRECT_DATABASE_URL="postgresql://..." alembic upgrade head
```

Never print database URLs or secrets.

6. Open a GitHub PR from `main` into `prod`.

- Title: `Production release: promote main to prod`
- Base: `prod`
- Head: `main`
- Include notes about backup, local checks, migration status, and post-deploy verification.

7. Wait for GitHub CI to pass.

Required checks usually include:

- Production Release CI
- backend tests
- frontend tests
- frontend build
- i18n check
- secret scan / Gitleaks
- Bandit
- pip-audit

If any check fails, stop and fix or report the failure. Do not merge a failing release PR without explicit user approval.

8. Merge the PR only when it is mergeable and CI is green.

Use a normal merge commit unless the user or repo policy says otherwise.

9. Verify Railway production deployment.

Check the merge commit status. Railway should move from pending to success.

Then verify production health:

```text
https://greo-lead-production.up.railway.app/api/health
```

The response must show:

- HTTP 200
- `status` is `ok`
- `database` is `connected`
- `deployment.commit` matches the new `prod` merge commit

If PowerShell or curl has local TLS issues, use another available HTTP client such as Node `fetch`.

10. Report the result to the user.

Include:

- PR URL and number
- merged production commit SHA
- Railway deployment status
- `/api/health` result
- anything not verified, especially production migrations or authenticated smoke tests

## Smoke Test Reminder

After deploy, recommend an authenticated smoke test for:

- Home
- Goals
- Tasks
- Task calendar and MTN history
- Meetings, including processing status and meeting Q&A
- Journey
- Journal
- Habits
- Settings
- notification status
- admin System Health

## Important Guardrails

- Never force-push `prod`.
- Never expose secrets.
- Never assume a migration ran unless verified.
- Never claim authenticated smoke tests passed unless actually performed.
- Leave unrelated local files and user changes alone.
- If `main` and `prod` diverge, use a PR and mergeability checks rather than overwriting `prod`.
