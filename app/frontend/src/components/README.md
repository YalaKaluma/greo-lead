# Frontend Components

This folder contains the main React UI surfaces for Alfred.

## Core Screens

- `goals/MyGoals.jsx` renders Vision/Pillar/Outcome goals and coordinates goal panels, tree/list views, goal reviews, linked tasks, and the transformation roadmap.
- `MyLeadershipJourney.jsx` renders Journey 2.0: leadership wheel, clickable subdomains, belt trials, readiness assessment, trial response modal, evidence library, and subdomain add/edit modal.
- `TodoList.jsx` renders task management, filtering, completion, recurring/postpone behavior, bulk actions, task editing, MTN trends, and enrichment.
- `MyHabits.jsx` renders habit tracking, daily states, energy check-ins, history, trends, scores, heatmap, leaderboard, and habit coaching.
- `MyTeam.jsx` renders people/team surfaces and relationship review workflows.
- `MyJournal.jsx` renders journal/reflection content, journal trends, and reflection-depth details.
- `MyCoachingSessions.jsx` renders dedicated leadership coaching sessions.
- `Settings.jsx` renders user preferences for language and timezone.
- `Sidebar.jsx` controls main navigation.
- `AlfredChat.jsx` provides in-app chat access.
- `PageIntroBanner.jsx` shows a short first-visit explanation for each page.

## Shared/Focused Components

- `MessageFeedbackButton.jsx`, `MessageFeedbackModal.jsx`, and `StarRating.jsx` support message quality feedback.
- `VoiceRecorder.jsx`, `ReadAloudButton.jsx`, and backend audio endpoints support speech input/output.
- `GoalReviewBanner.jsx` surfaces active goal review state.
- `JournalDepthModal.jsx` explains journal reflection-depth scoring.
- `goals/` contains focused goal, roadmap, review, and linked-task components.
- `Habits/` contains habit analytics and coaching components.
- `TodoList/` contains task item, filter, modal, and bulk-action components.

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
