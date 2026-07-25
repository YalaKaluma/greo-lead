# CI/CD and Release Process

Alfred uses a two-speed release model:

- `main` is active development and deploys to the Railway development environment.
- `prod` is stable production and deploys to the Railway production environment.

GitHub Actions only runs checks. Railway remains responsible for deployments.

## Branch and Environment Model

| Branch | Railway environment | Database |
| --- | --- | --- |
| `main` | Development | Neon development |
| `prod` | Production | Neon production |

Confirm in Railway that development watches `main` and production watches `prod`. Do not code directly on `prod`.

## Development Workflow

```bash
git checkout main
git pull origin main
# make changes
alembic revision --autogenerate -m "describe change"
alembic upgrade head
git add .
git commit -m "Feature name"
git push origin main
```

Pushing to `main` runs the lightweight Dev CI workflow and Railway deploys development.

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
git checkout prod
git pull origin prod
git merge main
# run prod migration intentionally
alembic upgrade head
git push origin prod
git checkout main
```

Safer GitHub path:

```bash
# Open a PR from main to prod
# Wait for Production Release CI to pass
# Merge the PR
# Run or confirm the production migration intentionally
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

```bash
DIRECT_DATABASE_URL="postgresql://..." alembic upgrade head
```

Run this only after reviewing the migration and confirming backup/restore readiness.

Current post-baseline revisions include CTO Director persistence, `tasks.completed_at`, generic notification tables, meeting intelligence persistence, task-date consolidation into `tasks.due_date`, and sponsor-circle contribution fields. Confirm each target environment has applied the same Alembic head before comparing behavior.

## Rollback Notes

Application rollback is done by reverting or redeploying the previous known-good `prod` commit in Railway/GitHub.

Database rollback is manual. Review each Alembic migration before release and only use `alembic downgrade` if the downgrade is known to preserve required data.
