# Frontend

This folder contains Alfred's Vite/React frontend.

## Structure

- `src/App.jsx` owns top-level page routing and passes API/user context into page components.
- `src/main.jsx` is the React entry point.
- `src/config.js` resolves the API base URL.
- `src/i18n/` contains language and timezone context.
- `src/utils/` contains frontend helpers such as goal taxonomy and timezone-aware task date logic.
- `src/components/` contains main product screens and shared UI components.
- `public/` contains frontend static assets.
- `vite.config.js`, `tailwind.config.js`, and `postcss.config.js` configure the frontend build.

## Main Screens

- Home
- My Vision & Goals
- My Journey / Journey 2.0
- My Tasks
- My Habits
- My Team
- My Coaching Sessions
- My Journal
- Alfred in-app chat
- Settings for language and timezone

Admin-only surfaces are exposed through the authenticated app shell and backend admin endpoints, including user management, feedback review, usage analytics, system health, Operations Director, CTO Director, and AI briefings.

## Internationalization And Timezone

The frontend language/timezone layer lives in `src/i18n/`.

- `src/i18n/en.json` and `src/i18n/fr.json` hold stable translation keys.
- `src/i18n/LanguageContext.jsx` loads the current user's backend language and timezone settings, falls back to `localStorage`, and updates visible labels immediately.
- `src/components/Settings.jsx` lets users choose English/French and a timezone.
- API calls that generate Alfred responses include the selected language so new chat and coaching content follows the user's preference.
- Task, habit, notification, and dashboard helpers use timezone-aware logic so "today", overdue, streaks, trends, energy check-ins, and notification timing align with the user's preference.

Existing chat history and user-generated content are not translated retroactively.

## Translation Coverage Rule

All user-facing frontend text must use the i18n translation system.

Before opening a PR, run:

```bash
npm run i18n:check
```

Every English key must have a valid French translation. CI will fail if French translation coverage is incomplete, if French values are empty, or if placeholder values such as `TODO`, `TBD`, `TRANSLATE`, or `MISSING` are present.

When adding a new page or component, do not hardcode user-facing text directly in JSX. Add the key to both English and French translation files and use the translation helper/context in the component.

## Journey 2.0 Frontend Notes

`src/components/MyLeadershipJourney.jsx` is currently the largest and most important frontend surface. It handles:

- Leadership wheel rendering.
- Clickable domain and subdomain navigation.
- Belt status and trial progression.
- Readiness assessment and promotion flows.
- Evidence library under the wheel.
- Reflection and real-world trial submission modal.
- Subdomain add/edit/delete modal connected to Journey API endpoints.

## Notifications

The Settings surface manages browser push notification status, preferences, and test sends through `/api/notifications/...`. Production push requires VAPID keys on the backend and HTTPS-capable deployment.

## Development

Expected local commands when Node/npm are available:

```bash
npm install
npm run dev
npm run i18n:check
npm run test
npm run build
```

The production build is served by the FastAPI backend from the repository-level `static/` directory.
