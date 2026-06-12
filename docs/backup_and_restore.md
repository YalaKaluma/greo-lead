# Backup And Restore

Alfred production data lives in Neon/PostgreSQL and is accessed by Railway through `DATABASE_URL`. Keep exact database URLs and Neon project identifiers in Railway/Neon, not in this repository.

## Current Neon Capability Check

Confirm these values in the Neon Console before each production launch window:

- Production project: confirm in Neon.
- Production branch/database: confirm in Neon, usually `main` or `prod`.
- Backups/restore points: managed by Neon for the production branch.
- Retention window: plan-dependent; record the current window from Neon before relying on it.
- Point-in-time recovery: available only when the active Neon plan/project has PITR/restore enabled for the needed window.

If the Console does not show a usable restore window, do not run destructive migrations or bulk data changes until backup/restore readiness is resolved.

## Who Should Restore

Only the incident owner plus the Neon owner should perform production restores. A second reviewer should confirm:

- The selected restore timestamp.
- The target is a temporary restore branch first.
- Railway production `DATABASE_URL` will not be changed until manual approval.

## Safe Restore Procedure

1. Stop the damaging action, deploy, webhook, or script if it is still running.
2. Identify the last known good timestamp with timezone.
3. In Neon, create a temporary restore branch/database from production at that timestamp.
4. Create a compute endpoint for the temporary branch.
5. Connect staging or a local backend to the temporary branch only.
6. Run the DB health check:

```bash
DATABASE_URL="postgresql://..." python scripts/db_health_check.py
```

7. Verify affected user workflows in staging/local.
8. Choose either targeted repair from the restore branch or full production restore.
9. Do not point production to the restored branch until the incident owner approves.
10. After restore or repair, run the production release smoke test.

## Restore Drill Checklist

```text
1. Select restore point.
2. Restore into temporary Neon branch/database.
3. Connect staging app or local backend to restored branch.
4. Verify core tables:
   - users
   - tasks
   - journal_entries
   - journey_goals
   - journey_belt_trials
   - messages
5. Confirm sample user data is present.
6. Do not point production to restored branch until manually approved.
```

## Verification

Use `scripts/db_health_check.py` for count-only verification. It checks connectivity and prints table counts without private journal, task, or message contents.

Expected shape:

```text
users: 12
tasks: 240
journal_entries: 85
journey_goals: 46
journey_belt_trials: 9
messages: 1200
status: ok
```

Also verify:

- `/api/health` reports database connected.
- Login works against the restored branch.
- The Journey page loads.
- The task list loads.
- Journal list loads, without checking private content in logs.

## Avoiding Production Overwrite

- Never paste a restore branch URL into Railway production variables during validation.
- Name restore branches with `restore-drill-` or `incident-restore-` prefixes.
- Keep staging/local `.env` files clearly labeled.
- Before editing Railway variables, confirm the Railway environment is production and the action has explicit approval.
- Prefer targeted row repair when only a few records were affected and newer production data is valid.

## Backup Before Risky Changes

Before migrations, bulk scripts, or manual data repairs:

- Confirm the current Neon restore window.
- Record the current timestamp and timezone.
- Run `python scripts/db_health_check.py` against production and save the counts in release notes.
- Test the migration or repair on a temporary Neon branch when feasible.
- Continue only after CI has passed and the release checklist is complete.
