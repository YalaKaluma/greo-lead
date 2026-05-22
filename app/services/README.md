# Services

This folder contains Alfred's orchestration and business logic. Services are where the product's behavior should live once it becomes more than simple CRUD.

## Important Services

- `orchestrator.py` coordinates message understanding, journey context, task capture, coaching responses, and state-aware behavior.
- `state_machine.py` manages conversation modes and transitions.
- `journey_context.py` builds structured Journey memory for prompts and coaching.
- `journey_service.py` and `journey_nlp.py` help extract and store Journey signals.
- `leadership_coaching_orchestrator.py` and `leadership_coaching_service.py` power the dedicated coaching-session experience.
- `people_review_orchestrator.py` and `people_review_service.py` support relationship review workflows.
- `priority_service.py` and `priority_llm_service.py` support AI priority review and recommendation logic.
- `task_service.py` and `task_enrichment_service.py` support task creation, enrichment, and context.
- `gmail_service.py`, `message_service.py`, and `openai_service.py` wrap external communication/AI dependencies.
- `prompt_service.py` loads prompt assets.
- `morning_briefing_service.py` supports proactive briefing/nudge behavior.

## Design Intent

Services should:

- Keep routers small and predictable.
- Centralize prompt and orchestration logic.
- Make behavior easier to test independently from API transport.
- Keep database writes explicit and user-scoped.

## Journey 2.0 Notes

Journey 2.0 is not only a UI. It depends on:

- Curriculum definitions in `app/journey_trials.yaml`.
- Persisted user trial submissions in `journey_belt_trials`.
- Existing Journey evidence tables for subdomain data.
- Future service-level grading and behavioral integration logic.

The next natural service extraction would be a dedicated `journey_progress_service.py` to calculate belt readiness, behavioral evidence, and AI grading consistently outside the React component.
