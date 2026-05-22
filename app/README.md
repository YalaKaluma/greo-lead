# App Backend

This folder contains the FastAPI backend for Alfred / Leadership OS.

## What Lives Here

- `main.py` wires the application together, registers routers, configures CORS, and serves the built React frontend from `static`.
- `models.py` contains the SQLAlchemy models for users, messages, tasks, habits, Journey memory, priority review, goal reviews, and leadership coaching.
- `db.py` manages the database session connection to Neon/PostgreSQL.
- `config.py` centralizes environment-backed settings.
- `journey_trials.yaml` is the source of truth for Journey 2.0 belt curriculum, trial prompts, real-world exercises, and behavioral evidence requirements.
- `routers/` exposes API endpoints.
- `services/` contains orchestration and business logic used by routers, webhooks, coaching, priority review, nudges, and message handling.
- `frontend/` contains the React application source.
- `prompts/` and `nudge_prompts.yaml` hold prompt assets that are intentionally editable without changing Python code.

## Current Product Shape

Alfred combines:

- Conversational coaching through WhatsApp, email, and in-app chat.
- A React executive operating system UI.
- Journey 2.0, a leadership development system using domains, subdomains, belts, trials, and behavioral evidence.
- Task, habit, goal, people, journal, priority review, and coaching workflows.

## Journey 2.0 Notes

The current Journey experience is driven by both static curriculum and live user evidence:

- Curriculum: `journey_trials.yaml`
- Submitted trials: `journey_belt_trials`
- Subdomain evidence: existing `journey_*` tables
- UI: `frontend/src/components/MyLeadershipJourney.jsx`
- API: `routers/journey.py`

Belts are tracked at the domain level. Subdomains are clickable evidence surfaces connected to existing Journey database tables.
