# Alfred Security Re-audit

**Assessment date:** 2026-08-11  
**Repository state:** `main` at `80f205166483f9c39f55da9f84038d6f83e6be22`  
**Baseline:** `docs/SECURITY_AUDIT_2026-08-08.md`  
**Assessment type:** source, configuration, automated-test, dependency, container, and CI review after the security remediation program

## Executive conclusion

Alfred's original critical application-level takeover paths are closed in the reviewed code. Private routes are authenticated by default, object access is bound to the authenticated owner, administration is role-gated with shorter sessions, scheduler actions require a dedicated secret and POST, legacy password replacement is disabled, sessions are revocable, browser credentials use HttpOnly cookies, and production releases have security and deployment-verification gates.

The application is ready for controlled production release after the operator checks below, but this is not a claim of perfect security or a substitute for an independent penetration test. The highest remaining risks are assurance gaps outside the repository: provider configuration, historical credential revocation, production environment correctness, and dynamic adversarial testing. Longer-term defense-in-depth opportunities remain around MFA/refresh sessions, native secure storage, parser isolation, and scheduler replay protection.

## Current disposition

| Disposition | Count | Meaning |
|---|---:|---|
| Closed in reviewed code and regression-tested | 19 | The original exploit path is removed and a CI-relevant test or control exists. |
| Closed in code; external verification required | 3 | Application entry points are gone, but provider/history state is not provable from Git. |
| Materially mitigated; defense-in-depth remains | 1 | The practical risk is reduced, but a stronger architecture is available. |

No known critical or high-severity application-code finding from the original audit remains open in this repository state.

## Original finding status

| ID | Status | Current evidence / residual work |
|---|---|---|
| C-01 Caller-controlled identity | **Closed** | Authenticated identity is canonical; cross-user query, JSON, path, form, and header claims are rejected. Route classification and representative two-user object tests are CI-enforced. |
| C-02 Arbitrary password replacement | **Closed** | Legacy replacement returns 410. Password change/recovery verifies authority, uses single-use hashed reset tokens, and revokes sessions. |
| C-03 Admin impersonation | **Closed** | Admin authority comes from the authenticated database user, not request identity. Admin sessions have an eight-hour maximum age. |
| C-04 Public privileged/batch routes | **Closed** | Scheduler actions require the dedicated secret or admin authority and use POST. Future defense-in-depth: signed timestamp/job IDs for replay resistance. |
| H-01 Twilio/Mailgun spoofing | **Closed in code; verify providers** | Retired webhook routes are absent and regression-tested. Confirm both provider integrations and old webhook URLs are disabled externally. |
| H-02 Tracked credential/logged temporary password | **Closed in code; verify revocation** | The tracked artifact and plaintext logging are gone; Gitleaks gates CI. Confirm every historical credential was revoked because deleting a file does not invalidate a leaked token. |
| H-03 Non-revocable long sessions | **Materially mitigated** | Session versions revoke tokens on logout/password/reset/deletion; browser cookies are HttpOnly/Secure/SameSite and writes enforce trusted origin. Regular-user access tokens still use the compatibility lifetime; rotated server-side refresh sessions remain a later upgrade. |
| H-04 Sensitive logs/raw errors | **Closed** | Central error handling returns stable sanitized errors; tests forbid exception text, private payload printing, identifiers, and onboarding shapes in logs. |
| H-05 Incomplete erasure | **Closed** | Scheduled purge discovers owned tables, removes managed files, anonymizes the account, and is invoked by existing daily scheduler jobs. Retention behavior is documented. |
| H-06 Static path containment | **Closed** | Resolved paths must remain under the static root; traversal behavior is regression-tested. |
| H-07 Parser exhaustion | **Closed for current threat model** | Upload reads, file types, archive entries/expansion, PDF pages, extracted text, media duration/processes, and timeouts are bounded. Process/container isolation remains future defense-in-depth. |
| H-08 Supply chain | **Closed** | Locked dependencies, immutable action/image inputs, frontend/Python audits, Gitleaks, Bandit, Trivy container scanning, non-root runtime, and protected required checks are present. |
| M-01 Permissive CORS | **Closed** | Exact trusted origins replace wildcard credentialed CORS; Android origin and cookie-write origin tests are present. |
| M-02 Password/code controls | **Closed** | Strong policy applies to new/reset passwords; legacy plaintext credentials are transparently rehashed after a successful login, avoiding forced disruption to existing users. Verification attempts expire and lock. |
| M-03 Browser token storage | **Closed** | Browser sessions use HttpOnly cookies and remove legacy local-storage credentials. Native compatibility storage is session-scoped; platform Keychain/Keystore is a future improvement. |
| M-04 Android backup/FileProvider | **Closed** | Backups are disabled and broad external FileProvider exposure is absent, with regression tests. |
| M-05 Health/error disclosure | **Closed** | Public health is minimal and sanitized; production verification uses a non-secret commit identifier intentionally. Raw exception details are not returned. |
| M-06 Rate-limit evasion/distribution | **Closed for sensitive routes** | Authentication and AI limits use a shared database counter and trusted signed identity. General API protection remains process-local by design. |
| M-07 AI trust boundary | **Closed for current feature set** | Untrusted context is enveloped and bounded; model-assisted writes use strict schemas and grounded evidence, with adversarial tests. |
| M-08 Startup/schema handling | **Closed** | Alembic is the sole deployed schema owner; startup is non-mutating and readiness requires the exact migration head. |
| L-01 Database/field encryption | **External verification** | Confirm Neon TLS, encryption at rest/backups, retention, branch expiry, and least-privilege access. Field-level encryption is a later data-classification decision. |
| L-02 Public API documentation | **Closed** | API documentation is disabled by default and requires an explicit environment opt-in. |
| L-03 Regression gates | **Closed** | Protected main requires lightweight, backend, frontend, security, and secret checks; production release verification matches the deployed commit and checks negative auth boundaries. |

## Required operator checks before production

1. Set GitHub production environment variable `PRODUCTION_APP_URL` to Alfred's exact canonical production origin.
2. Confirm Railway production `PUBLIC_APP_URL` is the same canonical origin and `APP_SESSION_SECRET` plus `ALFRED_SCHEDULER_SECRET` are independent, strong production-only values.
3. Change every cron-job.org Alfred job to **POST**. Keep the existing URL and `X-Alfred-Scheduler-Secret` header value unchanged, then run each job once and confirm success.
4. Confirm production `DATABASE_URL` points to the intended Neon production branch and Railway pre-deploy runs `alembic upgrade head`.
5. Confirm old Railway/project tokens and any other credential ever committed to Git were revoked, not merely removed from the current tree.
6. Confirm unused Twilio and Mailgun webhooks, domains, API keys, and old deployments are disabled.
7. Confirm Neon TLS/encryption, backup retention, branch expiry/protection, and account access are appropriate; enable MFA on GitHub, Railway, Neon, and cron-job.org.

## Next assurance priorities

1. **Production evidence:** complete the operator checklist and retain the release verification artifact generated by GitHub Actions.
2. **Independent staging penetration test:** test authentication, object authorization, admin boundaries, uploads/parsers, scheduler endpoints, rate limits, and encoded proxy/path edge cases using synthetic data.
3. **Provider and recovery exercise:** document access owners and perform a restore drill plus an account-erasure-after-restore check.
4. **MFA and session evolution:** add strong admin MFA first; later consider short access tokens with rotated, per-device refresh sessions.
5. **Runtime isolation:** if untrusted file volume grows, move document/media parsing to isolated workers with queue concurrency, CPU, memory, disk, and wall-clock quotas.

## Validation evidence

- Local backend/security suite: **140 passed**.
- Local Bandit scan: passed.
- PR #193 protected GitHub gates: **Dev CI passed; Security CI passed**.
- Main branch protection requires the configured lightweight, backend, frontend, security, and secret checks before merge.
- Production workflow performs post-deployment commit matching, database readiness, and negative authentication probes and retains an evidence artifact.

## Scope and limitations

This was a white-box review of the repository and available CI evidence. It did not inspect live provider control planes, Git history revocation records, production data, network/WAF behavior, mobile OS extraction resistance, or conduct exploitation against a deployed environment. Those are deliberate inputs to the operator checks and independent penetration test, not claims silently inferred from source code.
