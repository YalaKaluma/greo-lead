# App Backend

This folder contains the FastAPI backend for Alfred / Leadership OS.

## What Lives Here

- `main.py` creates the FastAPI app, checks core environment variables, registers routers, configures CORS, serves the built React frontend from `static/`, exposes `/api/health`, and starts the email polling loop.
- `models.py` contains SQLAlchemy models for users, messages, tasks, projects, meeting intelligence, opportunities, habits, Journey memory, priority review, goal reviews, leadership coaching, settings, notifications, usage, admin operations, CTO review, and system health.
- `db.py` manages the SQLAlchemy engine/session connection to Neon/PostgreSQL.
- `config.py` centralizes environment-backed settings.
- `journey_trials.yaml` is the Journey 2.0 belt curriculum source of truth.
- `journey_subdomain_prompts.yaml` stores Journey subdomain coaching/evidence prompts.
- `routers/` exposes API endpoints.
- `services/` contains orchestration and business logic used by routers, webhooks, coaching, nudges, and message handling.
- `frontend/` contains the React application source.
- `frontend/android/` contains the Capacitor Android shell that packages the built React bundle for APK/AAB workflows.
- `prompts/` and `nudge_prompts.yaml` hold editable prompt assets.
- `templates/` contains legacy/server-rendered templates still present in the codebase.
- `utils/` contains shared helpers such as security, task context, and message splitting.

## Runtime Behavior

On startup the backend:

- Loads `.env` through `app/config.py`.
- Verifies the presence of required database, OpenAI, Twilio, Mailgun, and default-user settings.
- Creates/verifies SQLAlchemy tables with `Base.metadata.create_all`.
- Ensures admin schema and seed data are present through `ensure_admin_schema_and_seed`.
- Registers API routers under `/api/...`.
- Serves built frontend assets from repository-level `static/` when present.
- Starts `app.email_poller.run_email_loop` in a daemon thread.
- Records slow or failing API requests as system health events for admin review.

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

Installed Android push notifications:

- `FIREBASE_SERVICE_ACCOUNT_JSON` or `FIREBASE_SERVICE_ACCOUNT_B64`
- `FIREBASE_PROJECT_ID`, optional when it is already present in the service account JSON

Use Firebase credentials in Railway when the installed Android app should receive native notifications. Browser/PWA notifications continue to use the VAPID Web Push path.

CTO Director review:

- `GITHUB_COPILOT_CTO_TOKEN` or `GITHUB_TOKEN`
- `GITHUB_COPILOT_CTO_URL`, defaulting to `https://models.github.ai/inference/chat/completions`
- `GITHUB_COPILOT_CTO_MODEL`, defaulting to `gpt-4o`

GitHub issue creation from Operations Director and CTO Director findings:

- `GITHUB_TOKEN` or a service token with repository issue permissions.
- Repository settings are resolved by the GitHub helper services in `app/services/github/`.

## Current Product Shape

Alfred combines:

- Conversational coaching through WhatsApp, email, and in-app chat.
- A React executive operating system UI.
- Journey 2.0 domains, subdomains, belts, trials, readiness assessment, and behavioral evidence.
- Vision/Pillar/Outcome goals, transformation roadmap waves, goal progress reviews, and AI-assisted opportunity suggestions.
- Task, habit, people, journal, priority review, message feedback, signal classification, audio, settings, and coaching workflows.
- Meeting capture from live recording, uploaded audio, or notes, followed by transcription, structured analysis, leadership coaching, participant matching, goal/project linking, meeting Q&A, and task conversion.
- A task calendar and MTN history API that use `tasks.due_date` as the single scheduling field and `completed_at` for completed-task history.
- Home dashboard snapshots that route activated users to Home and new users toward goals.
- Browser push notification subscriptions, preferences, delivery logs, and settings-page test notifications.
- Trust & Security policy surfaces for privacy, terms, security, GDPR/account deletion, and cookies, available in-app and through public routes.
- Capacitor Android packaging for debug APK and signed Play Store AAB workflows, including Firebase-backed installed-app notifications.
- Admin surfaces for user management, feedback review, usage analytics, system health, AI briefings, Operations Director drafts, and CTO Director findings.
- Persisted language and timezone preferences used by UI and time-sensitive product logic.

Meeting processing is asynchronous and stage-aware. The service reuses saved
transcripts on retry, separates summary analysis, action-item extraction, and
leadership coaching, retries transient database writes, and stores a
user-facing failure reference without exposing technical details.

## Development

Run the backend from the repository root:

```bash
uvicorn app.main:app --reload
```

Useful local endpoints:

- `/api/health` - backend and dependency health check.
- `/docs` - generated FastAPI API docs.
- `/` - built React app, when `static/index.html` exists.

Useful local checks:

```bash
pytest
```

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
