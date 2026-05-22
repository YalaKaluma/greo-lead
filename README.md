# Alfred / Leadership OS

Alfred is an executive operating system that combines AI coaching, task execution, goals, habits, people review, journaling, and Journey 2.0 leadership development.

## Current Documentation

- `Leadership_OS_Documentation_v6_CURRENT.docx` - current product and technical overview.
- `app/README.md` - backend application map.
- `app/routers/README.md` - API router map.
- `app/services/README.md` - orchestration and service-layer map.
- `app/frontend/src/components/README.md` - React component map.
- `db_migrations/README.md` - database migration notes.

## Main Runtime Shape

- Backend: FastAPI in `app/main.py`
- Database: Neon/PostgreSQL via SQLAlchemy models in `app/models.py`
- Frontend: Vite React app in `app/frontend`
- Built frontend: served from `static`
- Journey curriculum: `app/journey_trials.yaml`
- Migrations: `db_migrations`

## Journey 2.0

Journey 2.0 is the current leadership development engine. It uses:

- A clickable wheel with five leadership domains and subdomains.
- Domain-level belt progression.
- YAML-defined belt trials and behavioral requirements.
- `journey_belt_trials` for persisted trial responses.
- Existing `journey_*` tables for subdomain evidence.

The primary UI implementation is `app/frontend/src/components/MyLeadershipJourney.jsx`.
