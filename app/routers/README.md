# API Routers

This folder contains FastAPI routers. Routers should stay thin: validate request/response shape, call the relevant service or model operation, and return API-safe data.

## Registered Routers

`app/main.py` registers these active routers:

- `auth.py` under `/api/auth` for login, logout, and current-user lookup.
- `onboarding.py` under `/api/onboarding` for onboarding login, email verification, tour progress, and onboarding data processing.
- `journal.py` under `/api/journal/journal` for journal CRUD and trends. The nested path comes from both `main.py` and `journal.py` adding a journal prefix.
- `webhook.py` under `/api` for WhatsApp and email webhooks.
- `webhook_brain.py` under `/api/brain` for alternate brain webhook flows.
- `tasks.py` under `/api/tasks` for tasks, filters, MTN trends, reordering, recurring metadata, postpone behavior, and enrichment.
- `nudge.py` under `/api` for morning/evening/weekly nudges, batch sends, config reload, logs, and health.
- `journey.py` under `/api/journey` for Journey 2.0, goals, roadmap waves, people reviews, and Journey evidence.
- `messages.py` under `/api` for message history.
- `waitlist.py` under `/api` for waitlist signup.
- `habits.py` under `/api/habits` for habit CRUD, daily tracking, energy check-ins, trends, history, and coaching refresh.
- `chat.py` under `/api` for in-app chat, goal review chat controls, nudges, welcome, and notifications.
- `settings.py` under `/api` for language, timezone, and journal reflection-depth backfill.
- `audio.py` under `/api/audio` for transcription and speech.
- `message_feedback.py` under `/api` for message feedback capture.
- `message_signals.py` under `/api/message-signals` for signal classification and backfill.
- `opportunities.py` under `/api/opportunities` for opportunity generation and accept/decline actions.
- `priority.py` under `/api/priority` for priority review, recommendations, decisions, feedback, apply actions, history, and learning insights.
- `leadership_coaching_router.py` under `/api/leadership-coaching` for dedicated coaching sessions.

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
- Prefer response models for API stability.
- Avoid putting long orchestration logic in routers; move it into `services/` when behavior grows.
- When adding a database-backed UI feature, update `models.py`, add a migration in `db_migrations/`, and expose the narrowest API endpoint needed.
