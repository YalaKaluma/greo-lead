# App Backend

This folder contains the FastAPI backend for Alfred / Leadership OS.

## What Lives Here

- `main.py` creates the FastAPI app, checks core environment variables, registers routers, configures CORS, serves the built React frontend from `static/`, exposes `/api/health`, and starts the email polling loop.
- `models.py` contains SQLAlchemy models for users, messages, tasks, opportunities, habits, Journey memory, priority review, goal reviews, leadership coaching, and settings.
- `db.py` manages the SQLAlchemy engine/session connection to Neon/PostgreSQL.
- `config.py` centralizes environment-backed settings.
- `journey_trials.yaml` is the Journey 2.0 belt curriculum source of truth.
- `journey_subdomain_prompts.yaml` stores Journey subdomain coaching/evidence prompts.
- `routers/` exposes API endpoints.
- `services/` contains orchestration and business logic used by routers, webhooks, coaching, nudges, and message handling.
- `frontend/` contains the React application source.
- `prompts/` and `nudge_prompts.yaml` hold editable prompt assets.
- `templates/` contains legacy/server-rendered templates still present in the codebase.
- `utils/` contains shared helpers such as security, task context, and message splitting.

## Runtime Behavior

On startup the backend:

- Loads `.env` through `app/config.py`.
- Verifies the presence of required database, OpenAI, Twilio, Mailgun, and default-user settings.
- Creates/verifies SQLAlchemy tables with `Base.metadata.create_all`.
- Registers API routers under `/api/...`.
- Serves built frontend assets from repository-level `static/` when present.
- Starts `app.email_poller.run_email_loop` in a daemon thread.

## Environment Variables

Core required values checked by `main.py`:

- `DATABASE_URL`
- `OPENAI_API_KEY`
- `DEFAULT_USER_NUMBER`
- `TWILIO_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_NUMBER`
- `MAILGUN_API_KEY`
- `MAILGUN_DOMAIN`
- `MAILGUN_FROM`

Additional settings loaded by `config.py`:

- `OPENAI_MODEL`, defaulting to `gpt-4o`
- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`
- `GMAIL_REFRESH_TOKEN`
- `GMAIL_SENDER_EMAIL`

Web push notifications:

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`, defaulting to `mailto:admin@alfred.local`

Generate VAPID keys locally with:

```bash
python -m pywebpush --generate-vapid-keys
```

Configure the same values in Railway before enabling production push notifications. The backend exposes generic notification endpoints at `/api/notifications/...`; nudges are the first caller, but the service is shared for future task, habit, journal, Journey, review, and admin notifications.

CTO Director review:

- `GITHUB_COPILOT_CTO_TOKEN` or `GITHUB_TOKEN`
- `GITHUB_COPILOT_CTO_URL`, defaulting to `https://models.github.ai/inference/chat/completions`
- `GITHUB_COPILOT_CTO_MODEL`, defaulting to `gpt-4o`

## Current Product Shape

Alfred combines:

- Conversational coaching through WhatsApp, email, and in-app chat.
- A React executive operating system UI.
- Journey 2.0 domains, subdomains, belts, trials, readiness assessment, and behavioral evidence.
- Vision/Pillar/Outcome goals, transformation roadmap waves, goal progress reviews, and AI-assisted opportunity suggestions.
- Task, habit, people, journal, priority review, message feedback, signal classification, audio, settings, and coaching workflows.
- Persisted language and timezone preferences used by UI and time-sensitive product logic.

## Development

Run the backend from the repository root:

```bash
uvicorn app.main:app --reload
```

Useful local endpoints:

- `/api/health` - backend and dependency health check.
- `/docs` - generated FastAPI API docs.
- `/` - built React app, when `static/index.html` exists.

## Journey 2.0 Notes

The current Journey experience is driven by both static curriculum and live user evidence:

- Curriculum: `journey_trials.yaml`
- Subdomain prompts: `journey_subdomain_prompts.yaml`
- Submitted trials: `journey_belt_trials`
- Readiness assessments: `belt_assessments`
- Subdomain evidence: existing `journey_*` tables
- Yellow Belt validation: `services/yellow_belt_validator.py`
- UI: `frontend/src/components/MyLeadershipJourney.jsx`
- API: `routers/journey.py`

Belts are tracked at the domain level. Subdomains are clickable evidence surfaces connected to existing Journey database tables.
