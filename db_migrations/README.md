# Database Migrations

This folder contains the historical SQL migrations for Neon/PostgreSQL.

New production schema changes should be added as Alembic revisions in `alembic/versions/` and released with `alembic upgrade head`. `app/main.py` verifies SQLAlchemy tables at startup, but Alembic is the release source of truth for schema evolution after the `20260609_0001` baseline.

## Migration History

- `2026-05-22_create_journey_belt_trials.sql` creates `journey_belt_trials` for persisted reflection, real-world, and behavioral integration trial work.
- `2026-05-22_shift_journey_belt_trials_to_current_belt.sql` migrates trial rows so `target_belt` represents the user's current belt trial row.
- `2026-05-22_add_goal_sort_order.sql` adds goal ordering support.
- `2026-05-23_create_message_feedback.sql` creates message feedback capture.
- `2026-05-23_create_opportunity_suggestions.sql` creates opportunity suggestion persistence.
- `2026-05-23_create_transformation_roadmap.sql` creates roadmap waves and wave-goal links.
- `2026-05-23_mtn_feedback_and_task_sort.sql` persists task ordering and MTN feedback indexes.
- `2026-05-23_refactor_goal_levels_to_vision_pillar_outcome.sql` refactors goals into Vision/Pillar/Outcome hierarchy.
- `2026-05-23_rollback_goal_level_refactor.sql` provides rollback support for the goal hierarchy refactor.
- `2026-05-24_add_wave_goal_status.sql` adds wave-goal status.
- `2026-05-24_create_belt_assessments.sql` creates readiness assessment persistence.
- `2026-05-25_add_wheel_feedback_to_belt_assessments.sql` adds wheel feedback to assessments.
- `2026-05-25_allow_not_started_wave_goal_status.sql` allows `not_started` wave-goal status.
- `2026-05-25_create_message_signal_flags.sql` creates message signal telemetry.
- `2026-05-28_add_people_strengths_growth_aspirations.sql` enriches people review context.
- `2026-05-31_add_user_language_preference.sql` adds user language preference.
- `2026-05-31_create_habit_coaching_reviews.sql` creates habit coaching review persistence.
- `2026-05-31_create_vision_progress_reviews.sql` creates vision progress review persistence.
- `2026-06-01_add_user_timezone_preference.sql` adds user timezone preference.
- `2026-06-04_add_reflection_depth_scoring.sql` adds journal reflection-depth scoring fields.
- `2026-06-05_add_message_conversation_type.sql` adds message conversation typing.
- `2026-06-05_add_recurring_tasks.sql` adds recurring task metadata.
- `2026-06-05_create_journey_goal_values.sql` creates goal-value relationship data.
- `2026-06-06_add_task_postpone_tracking.sql` adds task postpone tracking.
- `2026-06-06_create_daily_energy_checkins.sql` creates daily habit energy check-ins.
- `2026-06-06_admin_user_management.sql` adds admin role/status fields and admin audit logging.
- `2026-06-06_admin_feedback_review.sql` adds admin review status fields to message feedback.
- `2026-06-07_add_user_auth_registration_fields.sql` backfills user auth, onboarding, trial, and tour fields required by self-serve registration.
- `2026-06-08_add_synthetic_user_flags.sql` adds synthetic-user markers and lookup index.
- `2026-06-09_resync_production_schema.sql` converges production schema drift, backfills procrastination pattern reason/strategy fields, and removes legacy duplicate columns.
- `alembic/versions/20260614_0001_cto_director.py` adds CTO Director reviews and findings. This is the first post-baseline Alembic-managed migration.
- `alembic/versions/20260614_0002_task_completed_at.py` adds `tasks.completed_at`, backfills completed tasks from `updated_at`, and indexes user/status/completion lookups.
- `alembic/versions/20260620_0001_notifications.py` adds generic push notification subscriptions, preferences, and delivery logs.
- The July 2026 Alembic chain adds project and meeting-intelligence persistence, live-meeting attendee/context records, and supporting meeting indexes.
- `alembic/versions/20260801_0002_meeting_leadership_domains.py` stores evidence-backed five-domain feedback for new and historical meetings.
- `alembic/versions/20260718_0007_consolidate_task_date.py` migrates calendar scheduling into the required `tasks.due_date` field and removes the duplicate `scheduled_date` column.
- `alembic/versions/20260718_0008_circle_plot_fields.py` adds current and potential contribution values used by the My Team sponsor-circle plot.

## Migration Conventions

- Run Alembic against Neon with `DIRECT_DATABASE_URL` when possible. `DATABASE_URL` remains the runtime connection string used by the app.
- Keep migrations idempotent where practical.
- Name files with date plus a concise action.
- Preserve user data; avoid destructive changes unless there is an explicit backup/recovery path.
- Add indexes for user-scoped reads and uniqueness constraints where the UI assumes one active row.
- Keep model changes in `app/models.py` aligned with each migration.

## Journey 2.0 Data Model Notes

Journey 2.0 uses existing Journey tables for subdomain evidence, `journey_belt_trials` for advancement work, and `belt_assessments` for readiness scoring and promotion decisions.

The curriculum itself is not stored in Neon yet. It lives in `app/journey_trials.yaml` so trial content can be tested and revised without schema changes.
