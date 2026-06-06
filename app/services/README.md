# Services

This folder contains Alfred's orchestration and business logic. Services are where product behavior should live once it becomes more than simple CRUD.

## Important Services

- `orchestrator.py` coordinates message understanding, Journey context, task capture, coaching responses, and state-aware behavior.
- `state_machine.py` manages conversation modes and transitions.
- `intent_service.py` classifies user intent for orchestration.
- `openai_service.py` centralizes simple OpenAI response generation.
- `prompt_service.py` loads editable prompt assets.
- `language.py` handles response-language instructions and language preference helpers.
- `timezone_service.py` normalizes user timezones and supports timezone-aware dates.
- `journey_context.py` builds structured Journey memory for prompts and coaching.
- `journey_service.py` and `journey_nlp.py` extract and store Journey signals.
- `yellow_belt_validator.py` validates Yellow Belt readiness requirements.
- `leadership_coaching_orchestrator.py` and `leadership_coaching_service.py` power dedicated coaching sessions.
- `people_review_orchestrator.py` and `people_review_service.py` support relationship review workflows.
- `priority_service.py` and `priority_llm_service.py` support AI priority review, recommendations, decisions, and learning insights.
- `task_service.py`, `task_enrichment_service.py`, and `task_mtn_trend_service.py` support task creation, enrichment, prioritization context, MTN trends, and sorting behavior.
- `habits/habit_trend_service.py` and `habit_coaching_service.py` support habit analytics and coaching reviews.
- `journal_reflection_depth_service.py` scores and backfills journal reflection depth.
- `goal_progress_review_service.py` and `vision_progress_review_service.py` generate goal and vision review summaries.
- `opportunity/` contains context building, generation, scoring, selection, feedback, and service entry points for opportunity suggestions.
- `message_service.py` and `message_signal_classifier.py` support message history and signal classification.
- `gmail_service.py` and `audio_service.py` wrap external Gmail/audio dependencies.
- `morning_briefing_service.py` supports proactive briefing/nudge behavior.
- `onboarding_service.py` supports onboarding data extraction and setup.
- `users.py` contains user lookup and preference helpers.

## Design Intent

Services should:

- Keep routers small and predictable.
- Centralize prompt and orchestration logic.
- Make behavior easier to test independently from API transport.
- Keep database writes explicit and user-scoped.
- Own calculations that must stay consistent across UI surfaces, webhooks, and chat.

## Journey 2.0 Notes

Journey 2.0 depends on:

- Curriculum definitions in `app/journey_trials.yaml`.
- Subdomain prompts in `app/journey_subdomain_prompts.yaml`.
- Persisted user trial submissions in `journey_belt_trials`.
- Readiness and promotion records in `belt_assessments`.
- Existing Journey evidence tables for subdomain data.
- Service-level validation in `yellow_belt_validator.py`.

The next natural service extraction would be a dedicated Journey progress service to calculate belt readiness, behavioral evidence, and AI grading consistently outside the React component and oversized router.
