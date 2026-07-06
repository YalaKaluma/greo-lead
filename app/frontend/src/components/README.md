# Frontend Components

This folder contains the main React UI surfaces for Alfred.

## Core Screens

- `Home.jsx` renders the activation-aware dashboard snapshot and helps route users into the right next workflow.
- `goals/MyGoals.jsx` renders Vision/Pillar/Outcome goals and coordinates goal panels, tree/list views, goal reviews, linked tasks, and the transformation roadmap.
- `MyLeadershipJourney.jsx` renders Journey 2.0: leadership wheel, clickable subdomains, belt trials, readiness assessment, trial response modal, evidence library, and subdomain add/edit modal.
- `TodoList.jsx` coordinates task data, filters, task mutations, and page-level orchestration while focused TodoList modules render list, modal, trend, and action surfaces.
- `MyHabits.jsx` renders habit tracking, daily states, energy check-ins, history, trends, scores, heatmap, leaderboard, and habit coaching.
- `MyTeam.jsx` renders people/team surfaces and relationship review workflows.
- `MyJournal.jsx` renders journal/reflection content, journal trends, and reflection-depth details.
- `MyCoachingSessions.jsx` renders dedicated leadership coaching sessions.
- `Settings.jsx` renders user preferences for language and timezone.
- Settings also hosts notification subscription, preference, status, and test-send controls.
- Settings includes a Privacy & Data tab that links users to the public account deletion flow.
- `Sidebar.jsx` controls main navigation.
- `TrustSecurity.jsx` renders the privacy, terms, security, GDPR/account-deletion, and cookies policy center in authenticated and public modes.
- `AlfredChat.jsx` provides in-app chat access.
- `PageIntroBanner.jsx` shows a short first-visit explanation for each page.

## Shared/Focused Components

- `MessageFeedbackButton.jsx`, `MessageFeedbackModal.jsx`, and `StarRating.jsx` support message quality feedback.
- `VoiceRecorder.jsx`, `ReadAloudButton.jsx`, and backend audio endpoints support speech input/output.
- `GoalReviewBanner.jsx` surfaces active goal review state.
- `JournalDepthModal.jsx` explains journal reflection-depth scoring.
- Admin-related panels in the app shell connect to backend admin endpoints for users, feedback, usage, system health, Operations Director, CTO Director, and AI briefings.
- `goals/` contains focused goal, roadmap, review, and linked-task components.
- `Habits/` contains habit analytics and coaching components.
- `TodoList/` contains task item, task-list, filter, modal, bulk-action, page-control, and MTN trend components.

## TodoList Component Structure

`TodoList.jsx` currently owns:

- task/filter/goal/MTN trend data loading from backend endpoints
- task add/update/delete/complete/reorder operations
- overdue-to-today and non-Top-10 defer operations
- top-level filter, tab, modal, and selection orchestration
- priority integration through `usePriority`

Focused TodoList support modules currently own:

- `TodoList/TaskListPanel.jsx`: list rendering, empty states, drag/drop container, and task item wiring
- `TodoList/PageControls.jsx`: header actions, tabs, selection bar, follow-up/defer/opportunity modal UI, and column headers
- `TodoList/MtnTrends.jsx`: MTN needle, trends tab, chart, heatmap, breakdown modal, and trends error boundary
- `hooks/useTodoInteractions.js`: opportunity, follow-up, and selection interaction state
- `utils/todoListLogic.js`: task filtering, visible score resolution, and sort order logic
- `utils/todoMtnTrends.js`: MTN benchmark, chart, heatmap, and trend payload helpers
- `utils/todoDateLogic.js`: shared calendar/date formatting helpers used by task follow-up and MTN trend views

## Journey 2.0 Component Structure

`MyLeadershipJourney.jsx` currently owns:

- Domain and subdomain configuration.
- Belt color/status rendering.
- Trial config loading from `/api/journey/trial-config`.
- Belt-trial persistence through `/api/journey/belt-trials`.
- Readiness assessment and promotion flows through `/api/journey/belt-assessments`.
- Validation-rule display through `/api/journey/validation/...`.
- Subdomain evidence loading from existing Journey endpoints.
- A clickable SVG wheel with center hub, domain ring, subdomain ring, and belt-color status.
- A unified belt-trials panel for all domains.
- Evidence library under the wheel.

## Frontend Conventions

- Prefer backend-connected UI over static mock state.
- Keep user-facing Journey text premium, reflective, and supportive.
- Avoid duplicating product logic in multiple components when a shared helper can keep behavior aligned.
- For Journey progression, remember that belts are domain-level, while subdomains are evidence/navigation surfaces.
- Use the language/timezone context rather than duplicating local preference state.
