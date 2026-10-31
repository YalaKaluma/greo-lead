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
- `task_service.py`, `task_enrichment_service.py`, and `task_mtn_trend_service.py` support task creation, enrichment, prioritization context, MTN trends, bounded completed-task history, and sorting behavior.
- `meeting_intelligence_service.py` orchestrates meeting transcription, structured analysis, automatic high-confidence people/goal/project matching, staged persistence, retry-safe transcript reuse, and leadership observations. Core summaries, decisions and reconciled actions are committed before coaching. A processing checkpoint in the existing context receipt lets Retry resume coaching/enrichment without rebuilding core rows; reviewed coaching is also committed before enrichment. Invalid structured supplement output is retried once and truncated coaching is rejected. Empty transcriptions receive one normalized diarization retry without the optional voice reference; an empty result remains a visible failure.
- `meeting_task_extraction_service.py` independently extracts explicit, evidence-backed commitments so action items are not diluted by summarization.
- `meeting_chat_service.py` answers meeting-scoped questions from the selected transcript, summary, decisions, and stored context.
- `habits/habit_trend_service.py` and `habit_coaching_service.py` support habit analytics and coaching reviews.
- `journal_reflection_depth_service.py` scores and backfills journal reflection depth.
- `goal_progress_review_service.py` and `vision_progress_review_service.py` generate goal and vision review summaries.
- `opportunity/` contains context building, generation, scoring, selection, feedback, and service entry points for opportunity suggestions.
- `message_service.py` and `message_signal_classifier.py` support message history and signal classification.
- `intelligence_core_service.py` stores source-backed evidence separately from claims, compiles confidence-aware longitudinal context, preserves default behavior for cold-start users, and supports user confirmation/correction of Alfred's model.
- `intelligence_backfill_service.py` ingests a signed-in user's historical Alfred data idempotently, distinguishes primary evidence from AI-derived or context-only material, and synthesizes inspectable longitudinal beliefs in a durable background run.
- `intelligence_twin_pipeline_service.py` builds the Digital Twin through six persisted, gated stages: entity discovery, canonical entity definition, Executive World mapping, longitudinal behavioral profiling, current dynamic state, and final Full/Core Twin assembly. Stage outputs and AI checkpoints remain reviewable and resumable.
- `intelligence_tag_review_service.py` provides the authenticated, read-only Stage 1 audit: source coverage, normalized tag statistics, quality filters, and paginated links back to original evidence.
- `gmail_service.py` and `audio_service.py` wrap external Gmail/audio dependencies.
- `morning_briefing_service.py` supports proactive briefing/nudge behavior.
- `onboarding_service.py` supports onboarding data extraction and setup.
- `users.py` contains user lookup and preference helpers.
- `home_dashboard_service.py` builds and refreshes activation-aware home dashboard snapshots.
- `intro_cards.py` supports page intro card state/content.
- `notifications/push_service.py` and the notification service package manage web push subscriptions, preferences, delivery attempts, and logs.
- `admin_system_health_service.py`, `admin_ai_briefing_service.py`, and `admin_bootstrap.py` support admin health, AI briefings, and admin schema/seed behavior.
- `operations_director/` turns health events into reviewable issue drafts and GitHub-ready briefs.
- `cto_director/` runs architecture, security, maintainability, test coverage, and release-readiness reviews.
- `github/` wraps GitHub repository and issue operations used by admin review flows.
- `audit_log_service.py` records audit events for sensitive admin and operational actions.

## Design Intent

Services should:

- Keep routers small and predictable.
- Centralize prompt and orchestration logic.
- Make behavior easier to test independently from API transport.
- Keep database writes explicit and user-scoped.
- Own calculations that must stay consistent across UI surfaces, webhooks, and chat.
- Keep operational review outputs sanitized before storing, displaying, or sending to GitHub.
- Keep meeting processing stages observable, retry transient database writes only, and keep public failure messages free of secrets and raw provider errors.

## Journey 2.0 Notes

Journey 2.0 depends on:

- Curriculum definitions in `app/journey_trials.yaml`.
- Subdomain prompts in `app/journey_subdomain_prompts.yaml`.
- Persisted user trial submissions in `journey_belt_trials`.
- Readiness and promotion records in `belt_assessments`.
- Existing Journey evidence tables for subdomain data.
- Service-level validation in `yellow_belt_validator.py`.

The next natural service extraction would be a dedicated Journey progress service to calculate belt readiness, behavioral evidence, and AI grading consistently outside the React component and oversized router.


### Resumable meeting processing

`meeting_pipeline_state.py` stores chunk and stage checkpoints in the existing
`Meeting.context_receipt.processing_pipeline` JSON. `meeting_stage_service.py`
commits each participant/project/goal/summary/action stage before advancing.
`meeting_job_service.py` polls queued/transcribing/analyzing meetings on startup
and every 15 seconds; failed jobs require an explicit Retry. Two workers run by
default (`MEETING_WORKERS`, bounded 1–4). PostgreSQL transaction advisory locks
serialize each meeting across workers and pooled Neon connections. A separate
lock-only transaction is kept alive; business data uses short transactions.
Lock loss prevents the old worker from writing further stage results.

Transcription defaults to five-minute chunks (`MEETING_TRANSCRIPTION_CHUNK_SECONDS`,
60–600 seconds). Completed chunks and partial transcript segments are committed
immediately, keyed by the original audio SHA-256 and chunk size. Partial transcripts
are displayed but never sent to analysis as complete. Per-request speaker labels
are namespaced by chunk; only explicit voice-reference `Me` labels span chunks.
Transient diarization failures fall back to plain transcription, marking speakers
unknown and showing a user-facing warning. Calls use bounded timeouts/retries.

Retries reuse saved stages and preserve reviewed suggestions, manual participant
matches, and handled/linked actions. Explicit reassessment starts new stage outputs.
Changing transcript/context invalidates downstream stage caches. Replacing audio
invalidates transcription and downstream checkpoints. No Alembic migration is needed.

Recordings must live on persistent storage. Set `MEETING_STORAGE_DIR=/data/meetings`
and mount a Railway volume at `/data`; the volume mount path is also recognized
automatically. Temporary local storage remains a local fallback; Railway environments must
configure a persistent mount before relying on restart recovery. A local volume requires a single application replica; use shared object
storage before scaling replicas. Missing historical audio cannot be reconstructed
from its old storage path; completed saved transcripts remain usable.
