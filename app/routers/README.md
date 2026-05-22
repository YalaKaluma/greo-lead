# API Routers

This folder contains FastAPI routers. Routers should stay thin: validate request/response shape, call the relevant service or model operation, and return API-safe data.

## Main Routers

- `journey.py` manages Journey memory, Journey 2.0 trial config, belt-trial submissions, subdomain evidence CRUD, people reviews, and goal reviews.
- `tasks.py` manages tasks, filters, updates, completion toggles, and task enrichment.
- `habits.py` manages habit CRUD, three-state daily tracking, streaks, history, and retroactive day updates.
- `priority.py` manages AI-powered priority review runs, decisions, recommendations, and learning insights.
- `leadership_coaching_router.py` exposes leadership coaching sessions, messages, history, stats, and active-session state.
- `chat.py`, `webhook.py`, and `webhook_brain.py` handle conversational entry points.
- `onboarding.py`, `auth.py`, `signup.py`, and `waitlist.py` support account and onboarding flows.
- `journal.py`, `messages.py`, `feedback.py`, and `dashboard.py` expose supporting product surfaces.

## Journey 2.0 API Surface

Important endpoints in `journey.py`:

- `GET /api/journey/trial-config` loads `app/journey_trials.yaml`.
- `GET /api/journey/belt-trials` loads persisted belt-trial work for a user.
- `POST /api/journey/belt-trials` starts or saves a trial.
- `PUT /api/journey/belt-trials/{trial_id}` updates an existing trial response/status.
- Subdomain CRUD endpoints such as `/values`, `/goals`, `/team-composition`, `/energy-sources`, `/execution-systems`, and `/development-areas` power clickable wheel subdomains.

## Conventions

- Keep user isolation explicit with `user_number` filters.
- Prefer response models for API stability.
- Avoid putting long orchestration logic in routers; move it into `services/` when behavior grows.
- When adding a database-backed UI feature, update `models.py`, add a migration in `db_migrations/`, and expose the narrowest API endpoint needed.
