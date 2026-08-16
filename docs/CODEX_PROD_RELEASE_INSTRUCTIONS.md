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
- `Production Release CI` is the pre-deploy gate Railway may wait for.
- `Production Smoke Verification` is the post-deploy smoke check. It must not be a required pre-deploy check in Railway, because it verifies the deployment after Railway has activated it.
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

4. Remind the user about production-only account and configuration steps.

Before the next production deployment, explicitly remind the user to handle these production-only items:

- Set GitHub `PRODUCTION_APP_URL` and Railway production `PUBLIC_APP_URL`. These are production-specific and cannot meaningfully be tested in development.
- Update production cron jobs to `POST`. Do this immediately before or after deploying the new code to avoid a short compatibility mismatch. Use the existing production scheduler secret; do not copy the development secret.
- Verify historical credentials, disable Twilio/Mailgun, and review Neon security. These are account/provider controls, not application deployments, and must be handled directly in the relevant production accounts.

5. Run local checks when the local environment supports them.

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

6. Confirm Alembic state.

```bash
alembic heads
alembic current
```

Production migrations are manual and deliberate. If a migration is required, prefer the `Production DB Migration` GitHub Actions workflow so the production Neon direct connection string stays in GitHub Secrets.

Use:

- Workflow file: `.github/workflows/production-db-migration.yml`
- Branch/ref: the PR head branch, usually `main`, before merging to `prod`
- `confirm_backup`: `BACKUP_DONE`
- `target_revision`: `head`

Wait for the workflow to finish and confirm it reports the expected Alembic revision after migration.

If the workflow is unavailable, run the migration only with the production Neon direct connection string and only after backup readiness is confirmed:

```bash
DIRECT_DATABASE_URL="postgresql://..." alembic upgrade head
```

Never print database URLs or secrets.

7. Open a GitHub PR from `main` into `prod`.

- Title: `Production release: promote main to prod`
- Base: `prod`
- Head: `main`
- Include notes about backup, local checks, migration status, and post-deploy verification.

8. Wait for GitHub CI to pass.

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

9. If the release includes Alembic migrations, run the `Production DB Migration` workflow before merging.

Use the PR head branch/ref so the workflow has the migration files that are about to be released. Do not merge if the migration workflow fails or cannot be verified.

10. Merge the PR only when it is mergeable, CI is green, and required production migrations are complete.

Use a normal merge commit unless the user or repo policy says otherwise.

11. Verify Railway production deployment.

Check the merge commit status. Railway should move from pending to success.

If Railway shows a skipped deployment with `CI check suite failed`, confirm Railway is waiting only for pre-deploy gates such as `Production Release CI` and `Security CI`. Railway must not wait for the post-deploy `Production Smoke Verification` workflow, or it will create a circular dependency.

Then verify production health:

```text
https://greo-lead-production.up.railway.app/api/health
```

The response must show:

- HTTP 200
- `status` is `ok`
- `database` is `connected`
- `commit` matches the new `prod` merge commit

If PowerShell or curl has local TLS issues, use another available HTTP client such as Node `fetch`.

12. Confirm post-deploy smoke verification.

The `Production Smoke Verification` workflow runs independently from the pre-deploy gate. It can be triggered by Railway deployment success events, by its scheduled backstop, or manually with:

- Workflow file: `.github/workflows/production-smoke.yml`
- Expected commit: the merged `prod` commit SHA
- Production URL: usually leave blank so the workflow uses GitHub `PRODUCTION_APP_URL`

Wait for it to verify:

- the production URL uses HTTPS
- `/api/health` is healthy
- `/api/health.commit` matches the expected `prod` commit
- invalid login attempts are rejected
- invalid scheduler credentials are rejected

13. Trigger the Android AAB workflow for Play Store upload.

Run the `Android AAB` GitHub Actions workflow on the `prod` branch after production health is verified.

Use:

- Workflow file: `.github/workflows/android-aab.yml`
- Branch: `prod`
- `api_url`: `https://greo-lead-production.up.railway.app`

Wait for the workflow to finish. If it succeeds, report the workflow run URL and artifact name `alfred-release-aab`. If Codex cannot trigger the workflow because the available GitHub connector lacks workflow-dispatch support or the browser/CLI is not authenticated, report that clearly and ask the user to either sign in to GitHub in the browser or provide an authenticated workflow-dispatch route.

14. Report the result to the user.

Include:

- PR URL and number
- merged production commit SHA
- Railway deployment status
- `/api/health` result
- production migration workflow status if migrations were included
- Android AAB workflow status and artifact availability
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
