# API Routers

This folder contains FastAPI routers. Routers should stay thin: validate request/response shape, call the relevant service or model operation, and return API-safe data.

## Registered Routers

`app/main.py` registers these active routers:

- `auth.py` under `/api/auth` for login, logout, and current-user lookup.
- `onboarding.py` under `/api/onboarding` for onboarding login, email verification, tour progress, and onboarding data processing.
- `journal.py` under `/api/journal/journal` for journal CRUD and trends. The nested path comes from both `main.py` and `journal.py` adding a journal prefix.
- `webhook.py` under `/api` for WhatsApp and email webhooks.
- `webhook_brain.py` under `/api/brain` for alternate brain webhook flows.
- `tasks.py` under `/api/tasks` for tasks, filters, MTN trends and history, calendar scheduling through `due_date`, reordering, recurring metadata, postpone behavior, follow-ups, and enrichment.
- `nudge.py` under `/api` for morning/evening/weekly nudges, batch sends, config reload, logs, and health.
- `journey.py` under `/api/journey` for Journey 2.0, goals, roadmap waves, people reviews, and Journey evidence.
- `messages.py` under `/api` for message history.
- `waitlist.py` under `/api` for waitlist signup.
- `habits.py` under `/api/habits` for habit CRUD, daily tracking, energy check-ins, trends, history, and coaching refresh.
- `chat.py` under `/api` for in-app chat, goal review chat controls, nudges, welcome, and notifications.
- `settings.py` under `/api` for language, timezone, and journal reflection-depth backfill.
- `notifications.py` under `/api/notifications` for push subscription management, notification preferences, status, and test sends.
- `admin.py` under `/api/admin` for admin auth-gated user management, feedback review, usage/system summaries, and AI briefings.
- `admin_operations.py` under `/api/admin` for Operations Director health-event review, issue drafts, approval/status changes, chat, and GitHub issue creation.
- `admin_cto.py` under `/api/admin` for CTO Director reviews, findings, executive summaries, status changes, and GitHub issue creation.
- `audio.py` under `/api/audio` for transcription and speech.
- `meetings.py` under `/api/meetings` for live meeting drafts, attendee/context capture, audio upload, notes, processing retries, participant matching, goal/project links, recording access, action-item conversion, meeting Q&A, editing, and deletion.
- `projects.py` under `/api/projects` for user-scoped project data used by task, Journey, and meeting workflows.
- `message_feedback.py` under `/api` for message feedback capture.
- `message_signals.py` under `/api/message-signals` for signal classification and backfill.
- `opportunities.py` under `/api/opportunities` for opportunity generation and accept/decline actions.
- `priority.py` under `/api/priority` for priority review, recommendations, decisions, feedback, apply actions, history, and learning insights.
- `usage.py` under `/api` for usage event capture.
- `home.py` under `/api/home` for activation-aware dashboard snapshots and manual refresh.
- `leadership_coaching_router.py` under `/api/leadership-coaching` for dedicated coaching sessions.

## Admin And Operational API Surface

- `/api/admin/users` and related admin endpoints manage users, roles, active status, password resets, and audit logging.
- `/api/admin/system-health` and Operations Director endpoints turn recorded runtime events into reviewable operational signals.
- `/api/admin/cto/...` runs and stores architecture/release-readiness reviews with findings that can become GitHub issues.
- `/api/notifications/...` stores push subscriptions, updates preferences, reports status, and sends test notifications.
- `/api/home/dashboard` returns or refreshes a stored dashboard snapshot used by the frontend startup route.

## Meeting And Task Calendar API Surface

- `GET /api/meetings` and `GET /api/meetings/{meeting_id}` list and load meeting intelligence.
- `POST /api/meetings/drafts`, `PUT /api/meetings/{meeting_id}/live-attendees`, and `POST /api/meetings/{meeting_id}/context-notes` support live capture.
- `POST /api/meetings/upload` and `POST /api/meetings/notes` queue audio- or notes-based processing; `POST /api/meetings/{meeting_id}/retry` safely reuses a saved transcript when available.
- `POST /api/meetings/{meeting_id}/ask` answers questions using only the selected meeting and its stored context.
- `POST /api/meetings/action-items/{action_item_id}/task` turns an extracted commitment into the user's own task or a follow-up task.
- `GET /api/tasks/mtn-history` returns bounded, timezone-aware completed-task facts for calendar views; `GET /api/tasks/mtn-trends` includes the contributing task list for each day.

## Journey 2.0 API Surface

Important endpoints in `journey.py`:

- `GET /api/journey/trial-config` loads `app/journey_trials.yaml`.
- `GET /api/journey/subdomain-prompts` loads `app/journey_subdomain_prompts.yaml`.
- `GET /api/journey/validation/{belt}` and `GET /api/journey/validation/{belt}/{dimension_id}` expose belt validation rules.
- `GET /api/journey/belt-readiness/status` returns readiness status.
- `GET /api/journey/belt-assessments/latest` and `GET /api/journey/belt-assessments` read assessment history.
- `POST /api/journey/belt-assessments/submit` submits readiness assessment data.
- `POST /api/journey/belt-assessments/{assessment_id}/accept-promotion` persists promotion acceptance.
- `GET /api/journey/belt-trials` loads persisted belt-trial work for a user.
- `POST /api/journey/belt-trials` starts or saves a trial.
- `PUT /api/journey/belt-trials/{trial_id}` updates an existing trial response/status.
- Subdomain CRUD endpoints such as `/values`, `/goals`, `/team-composition`, `/energy-sources`, `/execution-systems`, and `/development-areas` power clickable wheel subdomains.
- Vision roadmap endpoints under `/visions/{vision_id}/...` and `/waves/{wave_id}/...` power transformation roadmap views.
- People review endpoints under `/people/...` support review candidates, active reviews, review history, and synthesis.

## Conventions

- Keep user isolation explicit with `user_number` filters.
- Keep admin-only endpoints behind `require_admin`.
- Prefer response models for API stability.
- Avoid putting long orchestration logic in routers; move it into `services/` when behavior grows.
- When adding a database-backed UI feature, update `models.py`, add a migration in `db_migrations/`, and expose the narrowest API endpoint needed.
