# Alfred / Leadership OS

Alfred is an executive operating system for leaders. It combines AI coaching, task execution, goals, habits, people review, journaling, message intelligence, and Journey 2.0 leadership development.

The application is a FastAPI backend with a Vite/React frontend, backed by PostgreSQL/Neon through SQLAlchemy.

## Current Documentation

- `Leadership_OS_Documentation_v6_CURRENT.docx` - broader product and technical overview.
- `app/README.md` - backend application map and runtime notes.
- `app/routers/README.md` - API router map.
- `app/services/README.md` - orchestration and service-layer map.
- `app/frontend/README.md` - frontend setup and UI map.
- `app/frontend/src/components/README.md` - React component map.
- `db_migrations/README.md` - database migration notes.

## Runtime Shape

- Backend: FastAPI in `app/main.py`
- Database: Neon/PostgreSQL via SQLAlchemy models in `app/models.py`
- Frontend source: Vite React app in `app/frontend`
- Built frontend: served by FastAPI from repository-level `static/`
- Journey curriculum: `app/journey_trials.yaml`
- Journey subdomain prompts: `app/journey_subdomain_prompts.yaml`
- Prompt assets: `app/prompts/` and `app/nudge_prompts.yaml`
- Migrations: SQL files in `db_migrations/`

## Product Surfaces

Alfred currently includes:

- Journey 2.0 belt progression, trials, readiness assessment, wheel feedback, and behavioral validation.
- Vision/Pillar/Outcome goal hierarchy, transformation roadmap waves, goal reviews, and progress reviews.
- Task execution with MTN prioritization, goal links, recurring task metadata, postpone tracking, and opportunity suggestions.
- Habit tracking with three-state completion, trends, daily energy check-ins, and AI habit coaching.
- People review, relationship context, review history, and synthesis.
- Journaling with reflection-depth scoring and trend views.
- In-app chat, WhatsApp, email, nudges, audio transcription, and text-to-speech.
- Message feedback and signal classification for response quality and behavioral telemetry.
- User settings for English/French language preference and timezone preference.

## Local Development

Create a `.env` file with the values Alfred needs:

```env
DATABASE_URL=postgresql://...
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4o
DEFAULT_USER_NUMBER=...
APP_ENV=development
TWILIO_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_NUMBER=...
MAILGUN_API_KEY=...
MAILGUN_DOMAIN=...
MAILGUN_FROM=...
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
GMAIL_REFRESH_TOKEN=...
GMAIL_SENDER_EMAIL=...
```

Install and run the backend:

```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Install and run the frontend:

```bash
cd app/frontend
npm install
npm run dev
```

Build the frontend for FastAPI static serving:

```bash
cd app/frontend
npm run build
```

The backend exposes `/api/health` for runtime checks and `/docs` for FastAPI's generated API documentation.

## Nudge Cron Jobs

Cron URLs stay environment-level. When no `user_number` is supplied, each endpoint sends a tailored nudge to every active user in that environment:

```text
https://<prod-domain>/api/nudge/morning
```

Development and staging use the same clean endpoint against their own Railway/database environment:

```text
https://<dev-domain>/api/nudge/morning
https://<staging-domain>/api/nudge/morning
```

Add `user_number` only for a manual single-user test:

```text
https://<dev-domain>/api/nudge/morning?user_number=synthetic%3Aexecutive_alex
```

Set `APP_ENV`, `ENVIRONMENT`, or `RAILWAY_ENVIRONMENT_NAME` to `production`, `development`, or `staging` so logs clearly show which environment is sending nudges.

## Database

`app/main.py` calls `Base.metadata.create_all(bind=engine)` at startup so declared tables are verified. Schema changes should still be captured as explicit SQL migrations in `db_migrations/` so Neon environments can be updated intentionally.

When adding database-backed behavior:

- Add or update SQLAlchemy models in `app/models.py`.
- Add an idempotent migration in `db_migrations/`.
- Keep reads and writes scoped by `user_number`.
- Update the relevant README if a new product surface or endpoint appears.

## Journey 2.0

Journey 2.0 is the current leadership development engine. It uses:

- A clickable wheel with five leadership domains and subdomains.
- Domain-level belt progression.
- YAML-defined belt trials and behavioral requirements.
- `journey_belt_trials` for persisted trial responses.
- `belt_assessments` for readiness scoring, wheel feedback, and promotion decisions.
- Existing `journey_*` tables for subdomain evidence.

The primary UI implementation is `app/frontend/src/components/MyLeadershipJourney.jsx`. The primary API implementation is `app/routers/journey.py`.
