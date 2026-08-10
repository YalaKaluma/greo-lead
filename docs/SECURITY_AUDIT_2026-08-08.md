# Alfred Security Audit

**Assessment date:** 2026-08-08  
**Assessment type:** Read-only source-code and repository configuration review  
**Repository state:** `main` at `3090a189`  
**Primary framework:** OWASP Top 10:2025, supplemented with API, AI, mobile, privacy, supply-chain, and operational review

## Executive summary

Alfred is **not presently suitable for handling multiple users' sensitive production data**. The assessment identified several independent paths to unauthorized access or account compromise. The most important are systemic trust in caller-supplied user identifiers, an unauthenticated password-setting endpoint, and admin authorization based on a caller-supplied admin identifier.

The repository contains valuable security foundations: salted PBKDF2 password hashing, HMAC-signed expiring session tokens, record-level ownership filters, security headers, rate limiting, audit logs, upload-size limits, filename normalization, CI security jobs, backup documentation, and deliberate mobile recording indicators. The central failure is that these controls are not joined into a deny-by-default authorization architecture.

### Overall assessment

| Area | Rating | Summary |
|---|---:|---|
| Authentication | High risk | Tokens exist, but password reset and session lifecycle have critical gaps. |
| Authorization | Critical risk | Almost all private routes trust request-provided identity. |
| Admin security | Critical risk | Admin identity is accepted from a query parameter. |
| External integrations | High risk | Inbound webhooks and operational batch routes lack request authentication. |
| Sensitive-data handling | High risk | Private content and temporary credentials can enter logs; deletion is incomplete. |
| AI safety | Medium-high risk | Untrusted documents and transcripts influence structured data and actions without a formal trust boundary. |
| Supply chain | High risk | Dependencies are largely unpinned and a full local virtual environment is tracked. |
| Deployment/configuration | Medium-high risk | CORS, health disclosure, startup behavior, and static-file containment require hardening. |
| Mobile | Medium risk | Bearer tokens use WebView `localStorage`; Android backup is enabled. |

**Finding totals:** 4 critical, 8 high, 8 medium, and 3 low/observational items.

## Scope and limitations

Reviewed:

- FastAPI routers, services, models, middleware, and application configuration.
- Authentication, authorization, user isolation, admin operations, webhooks, scheduled operations, uploads, AI processing, logging, and deletion.
- React authentication usage and selected mobile Android/Capacitor configuration.
- Docker, Railway, GitHub Actions, dependency manifests, migrations, and operational documentation.
- Current tracked files and selected Git history.

Not performed:

- No requests were sent to production or third-party services.
- No live exploitation, credential use, database access, or destructive testing occurred.
- No frontend build was run, in accordance with workspace instructions.
- Bandit and pip-audit could not be executed locally because the tools were not installed in the available runtime. CI declares both tools, but this review did not independently confirm the latest CI result.
- Provider-side settings such as Railway access, Neon encryption/PITR, GitHub branch protection, Twilio request configuration, and OpenAI retention settings were not visible.

Risk ratings reflect source evidence, exploitability, likely data sensitivity, and blast radius. Items marked **conditional** require dynamic confirmation during remediation or penetration testing.

## Architecture and trust boundaries

### Sensitive data

Alfred stores or processes:

- Authentication credentials, email addresses, phone numbers, roles, and account status.
- Private journals, coaching conversations, goals, habits, tasks, people, relationship information, and leadership assessments.
- Meeting recordings, transcripts, participants, observations, and action items.
- Project documents and extracted business information.
- Push endpoints and voice-reference audio encoded in the database.
- AI prompts, outputs, scores, and generated recommendations.

### Entry points

- Browser and Capacitor mobile clients calling FastAPI.
- Twilio WhatsApp webhooks.
- Mailgun inbound email webhooks and Gmail polling.
- Public onboarding and self-registration.
- File, document, voice, and meeting-recording uploads.
- Public-looking nudge/cron/batch endpoints.
- Admin, Operations Director, CTO Director, GitHub, Railway, OpenAI, notification, and email integrations.
- Static-file and single-page-application catch-all routing.

### Core trust-boundary failure

The frontend sends `user_number` or `user_id`, and the backend commonly uses that value to scope database queries. Scoping a query is not authorization when the requester controls the scope identifier. The authenticated token must be the sole source of user identity for interactive requests.

## Detailed findings

### C-01 — Systemic user impersonation through caller-controlled identity

**Severity:** Critical  
**OWASP:** A01 Broken Access Control; CWE-639, CWE-862  
**Confidence:** Confirmed design flaw

Only `app/routers/auth.py` references `require_authenticated_user`. A source inventory counted 282 router operations across 36 router files; 35 router files contain no reference to the authentication dependency. Private routes accept `user_number` or `user_id` in query parameters, paths, forms, or JSON bodies and use it as ownership identity.

Representative evidence:

- `app/routers/auth.py:44-56` implements token validation correctly.
- `app/routers/tasks.py:457-463` returns data using caller-provided `user_number` without token validation.
- `app/routers/meetings.py:205-219` lists meeting data using caller-provided `user_number`.
- `app/routers/meetings.py:386-395` scopes meeting reads and updates to the supplied identifier, not the authenticated principal.
- `app/frontend/src/components/TodoList.jsx:456-470` and many other frontend calls send identity as a request parameter.

**Impact:** An unauthenticated or ordinary caller who learns another user's identifier can potentially read, modify, delete, or trigger processing of that user's journals, tasks, meetings, recordings, projects, people, coaching, goals, notifications, and other private records.

**Required remediation:** Apply deny-by-default authentication to every private router. Derive user identity from `current_user`, never from a client-provided owner field. Keep request owner fields temporarily only for compatibility and reject any mismatch. Add real two-user integration tests for every resource family.

### C-02 — Unauthenticated arbitrary password replacement

**Severity:** Critical  
**OWASP:** A01 Broken Access Control; A07 Authentication Failures; CWE-862  
**Confidence:** Confirmed

`POST /api/onboarding/set-permanent-password` accepts `user_id` and `new_password`, loads that user, and replaces `password_hash` without authenticating the caller or proving possession of the temporary password (`app/routers/onboarding.py:179-198`).

**Impact:** A caller can take over an account by enumerating or learning its numeric user ID and setting a new password. Combined with other identifier disclosures, this is directly exploitable.

**Required remediation:** Disable the endpoint immediately. Replace it with an authenticated password-change flow requiring the current password, or a single-use, short-lived, server-stored reset token bound to the account and purpose. Rotate sessions after password changes.

### C-03 — Admin impersonation through query parameter

**Severity:** Critical  
**OWASP:** A01 Broken Access Control; CWE-862, CWE-863  
**Confidence:** Confirmed design flaw

`require_admin` accepts `user_number` from the query string and grants admin access when that identifier belongs to an active administrator (`app/routers/admin.py:193-210`). It does not authenticate a bearer token or bind the administrator to a session. The same dependency protects Admin, Admin Operations, and Admin CTO routes, propagating the flaw.

**Impact:** Knowledge of an administrator's email address or phone number may enable user creation, deactivation, password resets, role changes, access to cross-user analytics and feedback, AI briefings, and operational actions.

**Required remediation:** Implement `require_admin(current_user=Depends(require_authenticated_user))`, check `current_user.is_admin`, require recent reauthentication for destructive admin actions, and prohibit caller-selected admin identity.

### C-04 — Unauthenticated privileged and outbound-action endpoints

**Severity:** Critical  
**OWASP:** A01 Broken Access Control; A04 Insecure Design; CWE-862  
**Confidence:** Confirmed

Operational nudge endpoints are reachable without authentication. Several state-changing, cost-incurring batch actions use `GET`, including `/api/nudge/morning/batch`, `/evening/batch`, `/weekly/batch`, and `/sunday_review/batch` (`app/routers/nudge.py:1454-1555`). Configuration reload and an operational log download are also unauthenticated (`app/routers/nudge.py:1570-1605`). The health response advertises these operational paths.

**Impact:** Attackers can trigger bulk outbound messages and AI work, create cost and reputation damage, repeatedly reload state, and retrieve nudge operational data.

**Required remediation:** Remove these routes from public reach or require a dedicated scheduler identity using an unguessable secret, signed request, mTLS, or platform-native job invocation. Use `POST`, idempotency keys, replay protection, narrow rate limits, and audit events.

### H-01 — Twilio and Mailgun inbound webhooks are not authenticated

**Severity:** High  
**OWASP:** A01 Broken Access Control; A08 Software or Data Integrity Failures; CWE-345  
**Confidence:** Confirmed

The WhatsApp handlers trust form fields such as `From` and `Body`, and the email handlers trust `sender`, `subject`, and `stripped-text`. Neither `app/routers/webhook.py` nor `app/routers/webhook_brain.py` validates Twilio request signatures or Mailgun webhook signatures/timestamps/tokens.

**Impact:** An attacker can impersonate inbound phone/email identities, inject private or malicious content into user histories, trigger AI processing and outbound communications, and create or mutate onboarding state. The exact blast radius depends on which webhook URLs are configured externally.

**Required remediation:** Validate provider signatures over the exact externally visible URL and payload, reject stale/replayed requests, allow only expected content types, and test signature failures. Separate provider identities from application users through explicit account linking.

### H-02 — Tracked credential-like file and plaintext temporary-password logging

**Severity:** High  
**OWASP:** A02 Security Misconfiguration; A04 Cryptographic Failures; CWE-532, CWE-798  
**Confidence:** Confirmed exposure; credential validity unknown

`app/Railway Token.txt` is tracked in Git and has been present since commit `d0f218eb`. It contains a single opaque 36-byte value and is not marked as a placeholder. This review deliberately did not print or use it. Separately, `app/services/onboarding_service.py:204` prints a newly generated temporary password in plaintext.

**Impact:** Anyone with repository or log access may obtain infrastructure or account credentials. Git deletion alone does not remove historical exposure.

**Required remediation:** Treat the tracked value as compromised: identify and revoke/rotate it, remove the file from current and historical Git where appropriate, review access logs, and add a denylist/pre-commit scanner. Remove all plaintext credential logging and rotate temporary credentials that may have appeared in retained logs.

### H-03 — Session tokens cannot be revoked and remain valid for 30 days

**Severity:** High  
**OWASP:** A07 Authentication Failures; CWE-613  
**Confidence:** Confirmed

Session tokens are stateless and valid for 30 days (`app/utils/security.py:12,73-89`). `/api/auth/logout` does not authenticate or invalidate a token and explicitly documents that it only returns success (`app/routers/auth.py:276-292`). Tokens remain valid after logout and there is no token version, revocation record, rotation, or refresh-token lifecycle.

**Impact:** A stolen bearer token remains usable until expiry, including after the user believes they logged out. Password changes do not demonstrably revoke existing tokens.

**Required remediation:** Use short-lived access tokens and rotated, revocable refresh sessions, or opaque server-side sessions. Store a session/token version on the user, revoke all sessions after password/reset/security events, and authenticate logout.

### H-04 — Sensitive user content and credentials are written to application logs

**Severity:** High  
**OWASP:** A09 Security Logging and Alerting Failures; A04 Cryptographic Failures; CWE-532  
**Confidence:** Confirmed

Examples include:

- Temporary password plaintext (`app/services/onboarding_service.py:204`).
- Full onboarding messages and onboarding data (`app/services/onboarding_service.py:60-64`).
- Goals, motivations, tasks, and quick wins (`app/services/onboarding_service.py:120-194`).
- User chat excerpts (`app/services/orchestrator.py:1116-1120`, `1500-1502`).
- Raw AI response excerpts on parse failures (`app/services/orchestrator.py:1076-1077`).
- Full tracebacks and exception details returned to clients (`app/routers/tasks.py:448-453` and multiple priority endpoints).

**Impact:** Logs can become a secondary sensitive-data store available to operators, vendors, support tools, or attackers. They may contain executive, relationship, journal, credential, and business information.

**Required remediation:** Adopt structured logging with a sensitive-field classification and central redaction. Never log message bodies, prompts, transcripts, journals, credentials, tokens, or raw provider payloads. Return stable public error codes while retaining sanitized internal diagnostics.

### H-05 — Account deletion is deactivation, not verified erasure

**Severity:** High  
**OWASP:** A04 Cryptographic Failures / privacy protection; A04 Insecure Design  
**Confidence:** Confirmed functional gap

The deletion route deactivates the user and records a date 30 days in the future (`app/routers/auth.py:236-272`). No production purge worker or command consumes `account_deletion_scheduled_for`. A synthetic-user reset script performs broader deletion, but it is not a user-erasure lifecycle. Meeting recordings and project documents are filesystem artifacts and require explicit removal.

**Impact:** Alfred may promise or imply deletion while retaining journals, messages, meetings, transcripts, documents, AI results, notifications, audit data, and files indefinitely.

**Required remediation:** Define retention policy and legal requirements; implement a reviewed, idempotent purge job covering every table, object/file store, processor, backup policy, and third-party data flow. Produce an erasure audit record without retaining deleted content.

### H-06 — Static-file catch-all lacks containment enforcement

**Severity:** High (conditional)  
**OWASP:** A01 Broken Access Control; CWE-22  
**Confidence:** Code defect confirmed; HTTP exploitability requires dynamic validation

The catch-all route joins `static_path / full_path` and serves it when `is_file()` is true (`app/main.py:453-465`). It does not resolve the candidate and verify that it remains inside `static_path`. Encoded traversal behavior depends on Starlette, the ASGI server, and the reverse proxy.

**Impact:** If traversal sequences reach this handler without normalization, arbitrary readable files in the container could be downloaded, potentially including source, configuration, or secrets.

**Required remediation:** Do not implement custom arbitrary static-file lookup. Use `StaticFiles` or resolve both paths and require `candidate.is_relative_to(static_root)`. Add encoded and double-encoded traversal tests at the deployed proxy boundary.

### H-07 — Upload processing permits decompression and parser resource exhaustion

**Severity:** High  
**OWASP:** A10 Mishandling of Exceptional Conditions; A04 Insecure Design; CWE-409, CWE-400  
**Confidence:** Confirmed missing limits

Project uploads are capped at 50 MB, but DOCX/PPTX ZIP entries are read and concatenated without limits on expanded size, entry count, compression ratio, or total XML (`app/services/project_intelligence_service.py:37-53`). PDF parsing likewise has no page/object/time limit. Meeting uploads allow 250 MB and invoke ffmpeg/subprocess processing. Work runs in in-process FastAPI background tasks.

**Impact:** Authenticated users—and currently unauthenticated impersonators—can exhaust CPU, memory, disk, database connections, OpenAI spend, or worker availability using ZIP bombs, pathological PDFs, and large media.

**Required remediation:** Move parsing to isolated queued workers with CPU, memory, wall-time, disk, page, entry, expanded-byte, and concurrency limits. Verify magic bytes and format structure; scan files; quarantine failures; rate-limit per authenticated account.

### H-08 — Non-reproducible and oversized software supply chain

**Severity:** High  
**OWASP:** A03 Software Supply Chain Failures  
**Confidence:** Confirmed

`requirements.txt` leaves almost every Python dependency unpinned. Docker and CI run `npm install` while the repository provides `pnpm-lock.yaml`, so npm is not using the committed lockfile. Git tracks approximately 18,600 files under `venv/`, including installed packages and bytecode. GitHub Actions use mutable major-version tags rather than immutable commit SHAs. Docker bootstraps Node by piping a network response to a shell and runs the application as root.

**Impact:** Builds are not reproducible, dependency updates can enter without review, repository scanners must process an unnecessary third-party tree, and compromise or confusion of build inputs has a larger blast radius.

**Required remediation:** Remove `venv` from Git, generate hashed Python locks, use `pnpm --frozen-lockfile` or commit/use an npm lock consistently, pin Actions by commit SHA, produce an SBOM, scan container images, and run the runtime container as a non-root user.

### M-01 — Overly permissive CORS

**Severity:** Medium  
**OWASP:** A01 Broken Access Control; A02 Security Misconfiguration  
**Confidence:** Confirmed

`app/main.py:110-116` configures all origins, methods, and headers while enabling credentials. Browser enforcement of wildcard-plus-credentials varies by request mode, but the policy is broader than Alfred requires and magnifies the unauthenticated API design.

**Required remediation:** Use an environment-specific allowlist of exact web/mobile origins, permitted methods, and necessary headers. Do not use credentialed CORS unless required.

### M-02 — Weak password and verification-code controls

**Severity:** Medium  
**OWASP:** A07 Authentication Failures  
**Confidence:** Confirmed

Self-registration accepts six-character passwords (`app/routers/auth.py:168-186`). Email verification codes are stored in plaintext as six digits (`app/models.py:1442-1464`) and checked directly; no attempt counter or per-code lockout was found. `verify_password` also accepts a legacy plaintext stored password when the value lacks the current prefix (`app/utils/security.py:28-33`), prolonging unsafe legacy state.

**Required remediation:** Adopt modern password guidance with breached-password screening and adequate minimum length; rate-limit per account and source; hash verification codes with purpose/account binding; cap attempts; remove plaintext-password compatibility after a measured migration.

### M-03 — Bearer tokens are stored in WebView/browser localStorage

**Severity:** Medium  
**OWASP:** A07 Authentication Failures; A04 Cryptographic Failures  
**Confidence:** Confirmed

Login and onboarding store the 30-day bearer token in `localStorage` (`app/frontend/src/Login.jsx:36-38`, `Welcome.jsx:50-52`). Any successful same-origin script injection can read it. On mobile, this is also weaker than platform secure storage.

**Required remediation:** For web, prefer secure, HttpOnly, SameSite cookies with CSRF protection where applicable. For native mobile, store refresh credentials in Keychain/Keystore through a vetted plugin and keep access tokens short-lived and memory-resident.

### M-04 — Android backup and broad FileProvider path

**Severity:** Medium  
**OWASP:** A02 Security Misconfiguration; A04 Cryptographic Failures  
**Confidence:** Confirmed configuration weakness

Android declares `android:allowBackup="true"`. Its FileProvider declares an `external-path` covering `.` in addition to cache (`app/frontend/android/app/src/main/res/xml/file_paths.xml`). The provider is not exported, which is positive, but broad roots make accidental future sharing more consequential.

**Required remediation:** Disable backup for sensitive application data or define explicit data-extraction rules, and narrow FileProvider roots to the exact recording/export directory.

### M-05 — Health endpoint and client errors disclose operational detail

**Severity:** Medium  
**OWASP:** A02 Security Misconfiguration; A10 Mishandling of Exceptional Conditions  
**Confidence:** Confirmed

The public health endpoint returns commit, service, environment, deployment ID, database error excerpts, and whether OpenAI, Twilio, and Mailgun are configured (`app/main.py:351-388`). Several endpoints return raw exception strings to clients.

**Required remediation:** Keep the public liveness response minimal. Put dependency readiness and deployment detail behind administrator/monitor authentication. Return opaque error identifiers and sanitized messages.

### M-06 — In-memory, caller-steerable rate limiting

**Severity:** Medium  
**OWASP:** A04 Insecure Design; A07 Authentication Failures  
**Confidence:** Confirmed

Rate-limit state is process-local and uses caller-controlled `user_number`, `user_id`, or `X-User-Number` for most requests (`app/security_middleware.py:76-132`). Attackers can rotate identifiers to evade it. Multiple workers/replicas would have independent buckets, while restarts clear all buckets.

**Required remediation:** Key limits to authenticated user ID plus trusted client-IP extraction, store counters in a shared service, define endpoint-specific cost budgets, and add provider-level throttling.

### M-07 — AI prompt-injection and untrusted-content integrity boundary is informal

**Severity:** Medium  
**OWASP:** A04 Insecure Design; A08 Software or Data Integrity Failures  
**Confidence:** Confirmed design weakness; impact varies by workflow

Uploaded document text, email content, meeting transcripts, journal context, and user history are placed into model inputs. Project document output is parsed as JSON and merged into project records (`app/services/project_intelligence_service.py:57-120`). Meeting analysis can generate action items and tasks. The prompts contain grounding instructions, but no uniform untrusted-content delimiters, provenance enforcement, policy validation, or approval boundary protects downstream state changes.

**Impact:** A malicious document or transcript can instruct the model to ignore extraction rules, corrupt structured project/meeting data, create misleading actions, or cause cross-context disclosure if authorization is also broken. No direct shell/tool execution by the model was found in these workflows.

**Required remediation:** Treat all retrieved content as quoted untrusted data, separate data from instructions, validate outputs against strict schemas and business rules, preserve provenance, require user approval for consequential writes, and add adversarial prompt-injection tests.

### M-08 — Startup and operational failure handling can fail open

**Severity:** Medium  
**OWASP:** A10 Mishandling of Exceptional Conditions  
**Confidence:** Confirmed

Database initialization catches broad exceptions, logs them, and continues starting the application (`app/main.py:79-89`). The health endpoint always reports top-level `"status": "ok"` even when its database test fails. Docker and Railway both run migrations, increasing operational complexity.

**Required remediation:** Fail startup when mandatory secrets, schema, or database connectivity are unavailable; separate liveness from readiness; ensure readiness fails when dependencies fail; designate one migration owner per deployment.

### L-01 — Database transport and application-level encryption are not enforced in code

**Severity:** Low/needs provider verification  
**OWASP:** A04 Cryptographic Failures  
**Confidence:** Configuration unknown

`create_engine(DATABASE_URL)` does not enforce TLS parameters. Sensitive fields such as transcripts, journals, voice-reference data, verification codes, and AI context are not encrypted at the application field level. Neon/Railway may provide TLS and encryption at rest, but that must be verified rather than assumed.

**Required remediation:** Verify and document TLS enforcement, certificate validation, provider encryption, key ownership, backup encryption, access roles, and retention. Consider envelope/field encryption for the most sensitive audio, transcript, journal, and credential material.

### L-02 — Public API documentation and route inventory are not explicitly controlled

**Severity:** Low  
**OWASP:** A02 Security Misconfiguration  
**Confidence:** Confirmed default behavior

FastAPI defaults expose `/docs`, `/redoc`, and `/openapi.json`. Documentation is useful but makes the large unauthenticated surface trivial to enumerate.

**Required remediation:** After authorization is fixed, decide deliberately whether production documentation is public, administrator-only, or disabled. Do not treat hiding documentation as an access control.

### L-03 — Positive controls are not protected by regression gates

**Severity:** Low/strategic  
**OWASP:** A04 Insecure Design; A09 Security Logging and Alerting Failures  
**Confidence:** Confirmed process gap

Existing tests check that record queries include a supplied owner, but not that the owner comes from a valid authenticated session. CI has no route-classification test requiring every route to declare `public`, `user`, `admin`, `webhook`, or `scheduler` access.

**Required remediation:** Generate the route table in CI and fail for unclassified routes. Test anonymous, cross-user, privilege, replay, and provider-signature cases using two real users and an administrator.

## OWASP Top 10:2025 coverage summary

| OWASP category | Alfred status | Principal evidence |
|---|---|---|
| A01 Broken Access Control | Critical | C-01 through C-04, H-01, H-06, M-01 |
| A02 Security Misconfiguration | High | H-02, M-01, M-04, M-05, L-02 |
| A03 Software Supply Chain Failures | High | H-08 |
| A04 Cryptographic Failures | High | H-02 through H-05, M-02 through M-04, L-01 |
| A05 Injection | Medium/limited direct evidence | No confirmed SQL/command injection found; prompt injection addressed in M-07. Dynamic fuzzing remains required. |
| A06 Insecure Design | High | C-04, H-05, H-07, M-06, M-07, L-03 |
| A07 Authentication Failures | Critical | C-02, H-03, M-02, M-03 |
| A08 Software or Data Integrity Failures | High | H-01, H-08, M-07 |
| A09 Security Logging and Alerting Failures | High | H-02, H-04; audit logging exists but contains/privacy controls are incomplete. |
| A10 Mishandling of Exceptional Conditions | High | H-07, M-05, M-08 |

Reference: [OWASP A01:2025 Broken Access Control](https://owasp.org/Top10/2025/A01_2025-Broken_Access_Control/) and the [OWASP Top 10:2025](https://owasp.org/Top10/2025/).

## Remediation roadmap

### Emergency containment — before normal feature work

1. Disable or protect `set-permanent-password`.
2. Rotate the tracked Railway-like credential and remove plaintext temporary-password logging.
3. Protect admin routes using authenticated `current_user`.
4. Block public batch/nudge/log-download endpoints at the application or edge.
5. Validate Twilio and Mailgun webhook signatures.
6. Consider temporarily restricting production access to a trusted beta allowlist until C-01 is remediated.

### Security foundation

1. Build one centralized access model with explicit route classes: public, authenticated user, administrator, verified webhook, and scheduler/internal.
2. Require authentication by default and derive identity solely from the validated session.
3. Migrate every resource query from request identity to canonical `current_user.id`; retain phone/email only as attributes, not authorization keys.
4. Introduce revocable sessions, password/reset session invalidation, secure native storage, and web cookie strategy.
5. Add two-user and anonymous integration tests across all 282 routes.

### Data and platform hardening

1. Remove private content from logs and deploy central redaction.
2. Implement complete account-erasure and retention workflows.
3. Isolate file/media parsing and add resource limits and malware/content checks.
4. Restrict CORS, health details, API documentation, and Android backup/sharing paths.
5. Rebuild dependency management and CI from locked, reviewed inputs; remove tracked `venv` and credential/backup artifacts.
6. Verify database TLS, encryption, provider access, backup retention, and third-party AI/data retention.

### AI security hardening

1. Create a single policy for untrusted prompt context and downstream model outputs.
2. Apply strict schemas and deterministic business validation to every model-produced write.
3. Require confirmation for messages, tasks, user changes, or other consequential actions.
4. Add a prompt-injection corpus covering documents, transcripts, emails, journals, and retrieved history.
5. Ensure authorization is enforced before any private context is assembled for a model.

## Verification plan

### Required automated tests

- Every non-public route returns 401 without a valid session.
- User A receives 404/403 for every User B object, even when changing all identifiers in URL, body, form, and headers.
- Non-admin users cannot invoke any admin route; supplying an admin email/phone changes nothing.
- Password changes require valid proof and revoke all prior sessions.
- Logout revokes the current session.
- Webhooks reject absent, invalid, stale, and replayed signatures.
- Scheduler routes reject ordinary user sessions and repeated idempotency keys.
- File parser tests cover ZIP bombs, large expansion, corrupt PDFs, long media, timeouts, and cleanup.
- Static routing rejects raw, encoded, and double-encoded traversal.
- Logs and API errors never contain credentials or seeded sentinel private text.
- The route inventory fails CI when a new route lacks an access classification.

### Independent penetration-test handoff

Provide the future tester with:

- A staging environment structurally equivalent to production and populated only with synthetic data.
- Two ordinary users, one administrator, one disabled user, and separate webhook/scheduler credentials.
- API schema plus the route access-classification manifest.
- Mobile test builds, web app, and provider webhook configuration.
- Explicit authorization for safe tests, data boundaries, rate limits, third-party exclusions, and emergency contact.
- This report and the remediation commit list, while asking the tester to test independently rather than merely confirm listed fixes.

Priority penetration scenarios:

1. BOLA/IDOR across every identifier and nested resource.
2. Admin privilege escalation and forced browsing.
3. Password/reset/session fixation, replay, logout, and revocation.
4. Twilio/Mailgun spoofing and replay.
5. Static path traversal and file download authorization.
6. Upload parser abuse and storage exhaustion.
7. AI prompt injection from documents, transcripts, email, and journal history.
8. CORS, CSP, XSS-to-token theft, mobile secure storage, and Android backup extraction.
9. Rate-limit evasion, bulk action abuse, and cost amplification.
10. Secret history, CI/CD trust, build provenance, and dependency compromise.

## Positive controls worth preserving

- PBKDF2-HMAC-SHA256 with random salts and constant-time comparison.
- HMAC-signed session tokens with issuer-controlled secret and expiry checks.
- Ownership filters already present in many database queries; these can be changed to use authenticated identity.
- Security headers, CSP split by environment, rate-limit middleware, and audit-log foundation.
- Query-string redaction for known secret parameter names in request logs.
- Filename normalization, upload byte limits, `defusedxml`, and parameterized ORM usage.
- CI jobs for tests, Bandit, pip-audit, and Gitleaks.
- Backup/restore and production release documentation.
- Non-exported Android recording service, foreground recording notification, and internal app storage for recordings.

These controls reduce remediation effort, but none compensates for missing authentication and authorization at the API boundary.

## Final conclusion

Alfred's current risk is architectural rather than a collection of minor defects. The correct next move is a focused security program: immediate containment, centralized authorization and session redesign, systematic route migration, privacy/logging cleanup, supply-chain hardening, adversarial verification, and then an independent penetration test.

The system is very fixable because most data queries already express an ownership concept and the token validation primitive exists. Security acceptance should nevertheless be based on automated negative tests and independent dynamic testing—not on the presence of security middleware or a successful login flow.
