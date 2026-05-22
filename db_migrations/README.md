# Database Migrations

This folder contains SQL migrations for Neon/PostgreSQL.

## Current Journey 2.0 Migrations

- `2026-05-22_create_journey_belt_trials.sql` creates the `journey_belt_trials` table used to persist reflection, real-world, and behavioral integration trial work.
- `2026-05-22_shift_journey_belt_trials_to_current_belt.sql` migrates earlier trial rows so `target_belt` represents the user's current belt trial row rather than the belt being earned next.

## Migration Conventions

- Keep migrations idempotent where practical.
- Name files with date plus a concise action.
- Preserve user data; avoid destructive changes unless there is an explicit backup/recovery path.
- Add indexes for user-scoped reads and uniqueness constraints where the UI assumes one active row.

## Journey 2.0 Data Model Notes

Journey 2.0 uses existing Journey tables for subdomain evidence and `journey_belt_trials` for advancement work.

The curriculum itself is not stored in Neon yet. It lives in `app/journey_trials.yaml` so trial content can be tested and revised without schema changes.
