# CI/CD and Release Process

Alfred uses a two-speed release model:

- `main` is active development and deploys to the Railway development environment.
- `prod` is stable production and deploys to the Railway production environment.

GitHub Actions runs the mandatory validation gates. Railway remains responsible for deployments.

## Required GitHub Enforcement

Protect both `main` and `prod` with GitHub rulesets or branch protection:

- require changes through pull requests;
- require branches to be current before merging;
- require successful `Lightweight checks`, Security CI jobs, and the relevant release gate;
- require code-owner review for security, migration, dependency, CI, and deployment files;
- block force pushes and branch deletion;
- apply the rules to administrators as well as collaborators.

`main` may be merged after its required development and security checks pass. `prod` additionally requires explicit human release approval. A successful CI run after a direct push is not a merge gate and is not an acceptable substitute for branch protection.

## Branch and Environment Model

| Branch | Railway environment | Database |
| --- | --- | --- |
| `main` | Development | Neon development |
| `prod` | Production | Neon production |

Confirm in Railway that development watches `main` and production watches `prod`. Do not code directly on `prod`.

## Development Workflow

Create one focused branch and pull request per independently reviewable risk unit. Merge to `main` only after all required checks pass. Railway then deploys the resulting `main` commit to development.

Security-boundary, migration, dependency, workflow, and deployment changes require review from the repository code owner in `.github/CODEOWNERS`.

Before promoting to production, run the local checks that match the active surfaces:

```bash
pytest
cd app/frontend
npm run i18n:check
npm run test
npm run build
```

## Production Release Workflow

Preferred release path:

```bash
# Open a PR from main to prod
# Wait for Production Release CI to pass
# If migrations are included, run the Production DB Migration workflow on the PR head branch
# Merge the PR
# Confirm Railway production deploys the new prod commit
```

Legacy local fallback:

```bash
git checkout main
git pull origin main
DIRECT_DATABASE_URL="postgresql://..." alembic upgrade head
```

Pushing or merging into `prod` lets Railway deploy production. GitHub Actions does not deploy.

## Alembic

Alembic is the source of truth for future schema changes. The existing `db_migrations/` directory stays as historical reference.

Alembic reads database credentials from:

1. `DIRECT_DATABASE_URL`
2. `DATABASE_URL`

Use the direct Neon connection string for migrations when possible.

Common commands:

```bash
alembic current
alembic heads
alembic revision --autogenerate -m "describe schema change"
alembic upgrade head
alembic downgrade -1
```

## Baseline

The first Alembic revision is an empty baseline. Existing production and development databases already have schema from the historical SQL migrations, so baseline them with:

```bash
alembic stamp head
```

After stamping, `alembic current` should show the baseline revision and `alembic upgrade head` should have nothing destructive to apply.

For a brand-new empty database, use the historical SQL migrations or create a fresh Alembic migration strategy before treating it as production-like.

## Production Migration Rule

Do not automatically run production migrations during Railway deploy yet.

Production migrations are manual and deliberate:

1. Confirm backup/restore readiness.
2. Run the `Production DB Migration` GitHub Actions workflow on the PR head branch/ref, usually `main`, with `confirm_backup` set to `BACKUP_DONE`.
3. Confirm the workflow reaches the expected Alembic head.

Use the local `DIRECT_DATABASE_URL="postgresql://..." alembic upgrade head` command only as a fallback when the workflow is unavailable.

Current post-baseline revisions include CTO Director persistence, `tasks.completed_at`, generic notification tables, meeting intelligence persistence, task-date consolidation into `tasks.due_date`, and sponsor-circle contribution fields. Confirm each target environment has applied the same Alembic head before comparing behavior.

## Rollback Notes

Application rollback is done by reverting or redeploying the previous known-good `prod` commit in Railway/GitHub.

Database rollback is manual. Review each Alembic migration before release and only use `alembic downgrade` if the downgrade is known to preserve required data.
