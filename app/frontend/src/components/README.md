# Frontend Components

This folder contains the main React UI surfaces for Alfred.

## Core Screens

- `MyLeadershipJourney.jsx` renders Journey 2.0: leadership wheel, clickable subdomains, belt trials, trial response modal, evidence library, and subdomain add/edit modal.
- `TodoList.jsx` renders task management, filtering, completion, and task editing.
- `MyHabits.jsx` renders habits and history.
- `MyTeam.jsx` renders people/team surfaces and relationship workflows.
- `MyJournal.jsx` renders journal/reflection content.
- `MyCoachingSessions.jsx` renders dedicated leadership coaching sessions.
- `Sidebar.jsx` controls main navigation.
- `AlfredChat.jsx` provides in-app chat access.
- `AutoTour.jsx` and `TourOverlay.jsx` support guided onboarding.

## Journey 2.0 Component Structure

`MyLeadershipJourney.jsx` currently owns:

- Domain and subdomain configuration.
- Belt color/status rendering.
- Trial config loading from `/api/journey/trial-config`.
- Belt-trial persistence through `/api/journey/belt-trials`.
- Subdomain evidence loading from existing Journey endpoints.
- A clickable SVG wheel with center hub, domain ring, subdomain ring, and thin belt-color ring.
- A unified belt-trials panel for all domains.
- Evidence library under the wheel.

## Frontend Conventions

- Prefer backend-connected UI over static mock state.
- Keep user-facing Journey text premium, reflective, and supportive.
- Avoid duplicating product logic in multiple components when a shared helper can keep behavior aligned.
- For Journey progression, remember that belts are domain-level, while subdomains are evidence/navigation surfaces.
