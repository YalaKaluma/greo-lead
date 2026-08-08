# Alfred / Leadership OS

Alfred is an executive operating system for leaders. It combines AI coaching, task execution, goals, projects, meeting intelligence, habits, people review, journaling, notifications, admin operations, and Journey 2.0 leadership development.

The application is a FastAPI backend with a Vite/React frontend, backed by PostgreSQL/Neon through SQLAlchemy.

## Current Documentation

- `Leadership_OS_Documentation_vCURRENT.docx` - broader product and technical overview.
- `app/README.md` - backend application map, runtime notes, and environment variables.
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
- Android app shell: Capacitor project in `app/frontend/android`
- Journey curriculum: `app/journey_trials.yaml`
- Journey subdomain prompts: `app/journey_subdomain_prompts.yaml`
- Prompt assets: `app/prompts/` and `app/nudge_prompts.yaml`
- Migrations: SQL files in `db_migrations/`
- Alembic revisions: `alembic/versions/`

## Product Surfaces

Alfred currently includes:

- Journey 2.0 belt progression, trials, readiness assessment, wheel feedback, and behavioral validation.
- Vision/Pillar/Outcome goal hierarchy, transformation roadmap waves, goal reviews, and progress reviews.
- Task execution with MTN prioritization, goal links, recurring task metadata, postpone tracking, and opportunity suggestions.
- A unified task calendar with day/week/month views, drag-and-drop scheduling, overdue handling, completed-task history, and per-day MTN totals.
- Meeting intelligence for live recording, audio upload, or pasted notes; transcription; summaries; topics; decisions; action items; leadership observations; participant matching; goal/project linking; meeting-scoped Q&A; and task creation.
- Project tracking connected to meetings, goals, tasks, and Journey context.
- Habit tracking with three-state completion, trends, daily energy check-ins, and AI habit coaching.
- People review, relationship context, review history, and synthesis.
- Journaling with reflection-depth scoring and trend views.
- In-app chat, scheduled nudges, push notifications, Gmail invitations, audio transcription, and text-to-speech.
- Browser push notifications with per-user subscriptions, preferences, delivery logs, and settings-page test sends.
- Trust & Security policy center with privacy, terms, security, GDPR/account-deletion, and cookies content available in-app and at public routes.
- Message feedback and signal classification for response quality and behavioral telemetry.
- Admin user management, feedback review, usage analytics, system health, AI briefings, Operations Director issue drafting, and CTO Director review.
- Home dashboard snapshots for activation-aware startup routing, daily MTN normalization, seven-day journal consistency, reflection depth, habits, energy, and 30-day behavioral trends.
- User settings for English/French language preference and timezone preference.
- Capacitor Android packaging for debug APK and signed Play Store AAB workflows, including Firebase-backed native push configuration.

## Local Development

Create a `.env` file with the values Alfred needs:

```env
DATABASE_URL=postgresql://...
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4o
DEFAULT_USER_NUMBER=...
APP_ENV=development
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
GMAIL_REFRESH_TOKEN=...
GMAIL_SENDER_EMAIL=...
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:admin@alfred.local
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

## Secret Scanning

Before pushing or deploying, run:

```bash
gitleaks detect --source . --redact
```

Do not commit `.env` files or runtime secrets, including `OPENAI_API_KEY`, `DATABASE_URL`, `APP_SESSION_SECRET`, `ALFRED_SCHEDULER_SECRET`, Gmail credentials, Railway secrets, or Neon credentials. GitHub Actions also runs Gitleaks as part of the CI/release checks.

## Dependency Security Scanning

Install the security tools and scan Python dependencies before release:

```bash
pip install -r requirements-security.txt
pip-audit -r requirements.txt
```

Known vulnerabilities should fail CI unless the ignore has a documented reason. Do not upgrade production dependencies blindly; run backend tests and the frontend build after any dependency change.

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

`app/main.py` calls `Base.metadata.create_all(bind=engine)` at startup so declared tables are verified. Alembic is now the source of truth for new schema changes after the baseline migration. Historical SQL migrations remain in `db_migrations/` as reference.

Use `DIRECT_DATABASE_URL` when running migrations against Neon:

```bash
alembic current
alembic heads
alembic revision --autogenerate -m "describe schema change"
alembic upgrade head
```

When adding database-backed behavior:

- Add or update SQLAlchemy models in `app/models.py`.
- Add an Alembic revision in `alembic/versions/`.
- Keep reads and writes scoped by `user_number`.
- Update the relevant README if a new product surface or endpoint appears.

The July 2026 task/meeting schema revisions consolidate task scheduling into
`tasks.due_date`, add sponsor-circle contribution fields to `journey_people`,
and persist meeting records, attendees, context notes, transcript segments,
topics, decisions, action items, leadership observations, and goal/project
links. Apply every Alembic revision through the current head before testing
these surfaces.

## Journey 2.0

Journey 2.0 is the current leadership development engine. It uses:

- A clickable wheel with five leadership domains and subdomains.
- Domain-level belt progression.
- YAML-defined belt trials and behavioral requirements.
- `journey_belt_trials` for persisted trial responses.
- `belt_assessments` for readiness scoring, wheel feedback, and promotion decisions.
- Existing `journey_*` tables for subdomain evidence.

The primary UI implementation is `app/frontend/src/components/MyLeadershipJourney.jsx`. The primary API implementation is `app/routers/journey.py`.

## Verification

Use focused checks before release or after documentation-sensitive changes:

```bash
pytest
cd app/frontend
npm run i18n:check
npm run test
npm run build
```

Current focused backend test coverage includes CTO Director, Operations Director, notifications, nudge targeting, onboarding starter goals, priority timezone behavior, security hardening, task MTN trends/history, meeting intelligence, habits, and Journey roadmap imports.

For local frontend work in this workspace, do not run `pnpm i18n:check`, `pnpm build`, `pnpm test`, or `vite build` unless explicitly requested. Prefer CI, Railway, GitHub Actions, or another known working build environment for those validation steps.
