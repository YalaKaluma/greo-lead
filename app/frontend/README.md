# Frontend

This folder contains Alfred's Vite/React frontend.

## Structure

- `src/App.jsx` owns top-level page routing and passes API/user context into page components.
- `src/main.jsx` is the React entry point.
- `src/components/` contains main product screens and shared UI components.
- `src/components/README.md` describes the component map.
- `public/` contains static frontend assets.
- `vite.config.js`, `tailwind.config.js`, and `postcss.config.js` configure the frontend build.

## Main Screens

- My Vision & Goals
- My Journey / Journey 2.0
- My Tasks
- My Habits
- My Team
- My Coaching Sessions
- My Journal
- Alfred in-app chat

## Journey 2.0 Frontend Notes

`src/components/MyLeadershipJourney.jsx` is currently the largest and most important frontend surface. It handles:

- Leadership wheel rendering.
- Clickable domain and subdomain navigation.
- Belt status and trial progression.
- Evidence library under the wheel.
- Reflection and real-world trial submission modal.
- Subdomain add/edit/delete modal connected to Journey API endpoints.

## Development

Expected local commands when Node/npm are available:

```bash
npm install
npm run dev
npm run build
```

The production build is served by the FastAPI backend from the repository-level `static/` directory.
