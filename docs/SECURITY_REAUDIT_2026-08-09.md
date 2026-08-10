# Alfred Security Re-audit

**Assessment date:** 2026-08-09  
**Repository state:** `main` at `c08568589c2f26cb432dde5d21eb8594416693c3`  
**Baseline:** `docs/SECURITY_AUDIT_2026-08-08.md`  
**Assessment type:** Read-only source, configuration, test, and CI review after remediation phases 1–3

## Executive summary

The emergency account-takeover paths identified in the original audit have been materially reduced. Alfred now has authenticated-by-default private routers, authenticated administrator checks, a dedicated scheduler credential, a disabled legacy password-setting endpoint, revocable session versions, stronger password and verification controls, and single-use email password recovery. CI now exercises route classification, negative authorization cases, Bandit, dependency audit, and secret scanning.

The application should not yet be considered fully remediated or penetration-test ready. The centralized compatibility guard still validates caller identities only in query parameters and JSON bodies; it does not prove ownership for every path parameter, form field, header, or object-only lookup. Several original high-risk areas remain substantially unchanged: sensitive OK let s logging and raw errors, incomplete erasure, static path containment, parser resource exhaustion, and non-reproducible dependencies. Recent Railway failures also confirmed that application startup and Alembic can both mutate schema, leaving migration history and physical schema out of sync.

### Current finding disposition

| Status | Count | Meaning |
|---|---:|---|
| Resolved in code | 2 | Original exploit path is closed by current code and tests. |
| Removed in code; provider verification required | 1 | Repository entry point is gone, but external configuration must be checked. |
| Partially resolved | 6 | Important controls were added, but the original remediation is incomplete. |
| Open | 14 | Material original risk remains. |

## Finding-by-finding status

| ID | Status | Residual risk | Current evidence and remaining work |
|---|---|---:|---|
| C-01 Caller-controlled user identity | **Substantially resolved** | **Medium** | Private routers reject mismatched query, JSON, path, and identity-header claims. Journal, messages, feedback, projects/documents, tasks, goals/roadmaps, and meeting query/file endpoints now derive canonical ownership from the authenticated account. Multipart identity fields have explicit owner checks, and CI inventories both multipart and migrated route dependencies. Remaining compatibility payloads must be removed gradually and the less-sensitive resource families still need equivalent canonical migration and two-user integration coverage. |
| C-02 Arbitrary password replacement | **Resolved** | Low | The legacy public endpoint always returns HTTP 410. Authenticated password changes require the current password; email recovery uses hashed, expiring, single-use tokens and revokes sessions. |
| C-03 Admin query impersonation | **Resolved** | Low | `require_admin` depends on the authenticated user and checks `is_admin`. Admin route families use that dependency. Destructive-admin reauthentication remains a defense-in-depth improvement. |
| C-04 Public privileged/batch routes | **Partially resolved** | Medium | Nudge and operational endpoints require the scheduler secret or an authenticated administrator. Several actions remain GET-based and lack idempotency/replay controls. Convert state-changing operations to POST and add replay-safe job identifiers. |
| H-01 Twilio/Mailgun spoofing | **Removed; verify providers** | Low/conditional | The unused Twilio/Mailgun webhook code and credentials were removed from the application. Confirm the provider webhooks/domains are disabled and no old deployment still exposes those routes. |
| H-02 Tracked credential and temporary-password logging | **Partially resolved** | Medium | The credential-like file is removed from the current tree and Gitleaks runs in CI. Temporary-password plaintext logging was removed. The value remains in Git history unless history was rewritten, and revocation could not be verified from source. |
| H-03 Non-revocable 30-day sessions | **Partially resolved** | Medium | Session versions invalidate tokens after logout, password changes, resets, admin resets, and account deletion. Tokens still live for 30 days, there is no refresh-session rotation, and logout invalidates all sessions rather than one server-side session. |
| H-04 Sensitive logs and raw errors | **Open** | **High** | Onboarding data is still printed, chat responses and AI prompts can enter logs, tracebacks are printed, and many routes return `str(exc)` to clients. Introduce structured redaction and stable public error codes. |
| H-05 Incomplete account erasure | **Open** | **High** | Account deletion still schedules/deactivates without a purge worker covering relational data, recordings, documents, backups, and third parties. |
| H-06 Static catch-all containment | **Open** | **High, conditional** | The catch-all still joins `static_path / full_path` and serves files without resolving and enforcing containment. Replace arbitrary lookup or verify `candidate.is_relative_to(static_root)`; add deployed encoded-traversal tests. |
| H-07 Upload/parser exhaustion | **Open** | **High** | Upload byte caps exist, but ZIP expansion, entry counts, PDF pages/objects, parsing time, ffmpeg resources, and worker isolation remain unbounded. |
| H-08 Supply-chain reproducibility | **Open** | **High** | Most Python dependencies are unpinned; Docker/CI use `npm install` despite `pnpm-lock.yaml`; about 18,600 `venv` files remain tracked; Actions use mutable tags; Docker downloads a setup script and runs as root. |
| M-01 Permissive CORS | **Open** | Medium | CORS still allows all origins, methods, and headers with credentials. Add exact environment-specific origin and method/header allowlists. |
| M-02 Password/code controls | **Partially resolved** | Low–Medium | Passwords now require 12–128 characters with a small common-password denylist. Verification codes are hashed, expire, and lock after five attempts. Legacy plaintext password comparison remains enabled and breached-password screening is not implemented. |
| M-03 Tokens in localStorage | **Open** | Medium | Web and mobile clients still persist the bearer token in `localStorage`. Move web sessions to secure HttpOnly/SameSite cookies and mobile refresh credentials to Keychain/Keystore. |
| M-04 Android backup/FileProvider | **Open** | Medium | `allowBackup` remains true and FileProvider still exposes the entire external path. |
| M-05 Health/error disclosure | **Open** | Medium | Public health still exposes commit/deployment/environment and database error excerpts and returns top-level `status: ok` when the database fails. Raw exception strings remain common. |
| M-06 Rate-limit evasion/distribution | **Open** | Medium | Counters remain process-local; non-auth limits still accept caller-controlled query/header identity; trusted proxy IP extraction and shared storage are absent. |
| M-07 AI untrusted-content boundary | **Open** | Medium | No uniform untrusted-context envelope, provenance enforcement, deterministic output policy, approval boundary, or adversarial prompt-injection suite was found. |
| M-08 Startup/failure handling | **Open** | **Medium–High** | Startup catches database initialization failures and continues; health can report OK while DB is down; both Railway pre-deploy and the Docker command run migrations; `Base.metadata.create_all()` and bootstrap SQL can mutate deployed schema outside Alembic. Recent copied-database deployments demonstrated this drift. |
| L-01 Database/field encryption | **Open / provider verification** | Low–Medium | TLS is connection-string dependent and not enforced in code. Provider encryption, backup controls, roles, retention, and field encryption remain unverified. |
| L-02 Public API documentation | **Open** | Low | FastAPI documentation remains public by default. Decide explicitly after access controls are fully migrated. |
| L-03 Regression gates | **Partially resolved** | Low–Medium | CI now fails for unclassified API routes and contains focused anonymous/cross-user/session tests. Coverage is not yet a two-user matrix across every route/resource/input source. |

## Revised priorities

### Priority 0 — complete authorization migration

1. Extend negative integration tests to path, query, JSON, form, and identity headers.
2. Inventory every route that accepts `user_number`, `user_id`, or an object ID.
3. Change each handler to use authenticated `current_user.id` as the ownership source.
4. For compatibility fields, reject mismatches and stop using the supplied value in database filters.
5. Add User A/User B tests for journals, tasks, meetings, projects/documents, messages, habits, Journey, coaching, notifications, settings, uploads, and nested resources.

**Exit criterion:** every non-public route returns 401 anonymously, and every User B identifier or object supplied by User A returns 403/404 regardless of where the identifier is placed.

### Priority 1 — logging, errors, and operational correctness

1. Remove private payloads, prompts, AI responses, onboarding data, and tracebacks from logs.
2. Centralize sanitized error responses with request IDs.
3. Make mandatory-secret, database, and migration failures fail startup/readiness.
4. Make Alembic the sole deployed schema owner; remove `create_all` and ad-hoc bootstrap DDL after converting required changes into migrations.
5. Run migrations only once per deployment.

### Priority 2 — privacy, files, and supply chain

1. Implement reviewed account erasure and retention.
2. Isolate parsers and enforce expanded-size/page/time/CPU/disk/concurrency limits.
3. Lock dependencies, use the committed frontend lock, remove tracked `venv`, pin build inputs, run non-root, and generate/scan an SBOM/container.
4. Restrict CORS, health output, API docs, Android backup/FileProvider, and rate limits.

### Priority 3 — session/client and AI hardening

1. Introduce short-lived access tokens and rotated server-side refresh sessions.
2. Move browser/mobile credentials out of `localStorage`.
3. Establish an untrusted-content and model-output policy with schemas, provenance, approvals, and adversarial tests.

## Recommended immediate project sequence

1. **Authorization completion:** close C-01 and expand L-03 tests.
2. **Logging and safe errors:** close H-04 and M-05.
3. **Schema/startup ownership:** close M-08 before further migrations.
4. **Static and upload safety:** close H-06 and H-07.
5. **Supply chain:** close H-08.
6. **Privacy/retention:** close H-05 and verify L-01.
7. **Client/session/mobile:** close H-03, M-03, and M-04.
8. **AI and abuse controls:** close M-06 and M-07.
9. **Independent dynamic test:** execute the penetration-test handoff from the original audit using synthetic staging data.

## Overall conclusion

Alfred has moved from unauthenticated systemic takeover risk to a materially stronger authenticated-by-default foundation. The most dangerous individual findings—arbitrary password replacement and admin impersonation—are closed. The remaining work is still significant: authorization must become object- and principal-driven rather than compatibility-field-driven, and the privacy, parser, supply-chain, mobile, AI, and operational findings require dedicated remediation phases.

The next implementation phase should be authorization completion, not another broad feature batch. That phase offers the highest reduction in exploitable risk and produces the strongest foundation for the eventual independent penetration test.
