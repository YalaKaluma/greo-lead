# Alfred Production Readiness Runbook

Last reviewed: 2026-06-22

Use this runbook before onboarding beta users and during production incidents. Keep production secrets out of this file. Store exact URLs, tokens, and credentials only in approved secret stores.

## 1. Neon Production Backup And Restore

### Current Recovery Model

Alfred production uses Neon/PostgreSQL through `DATABASE_URL`.

Neon supports point-in-time recovery through branch restore and restore branches. The available recovery window depends on the Neon plan and project configuration. Confirm the current restore window in the Neon Console before relying on it.

Primary reference:
- Neon point-in-time restore and branching: https://neon.com/docs/introduction/point-in-time-restore

### Before An Incident

- [ ] Confirm the production Neon project name.
- [ ] Confirm the production database branch name, usually `main` or `prod`.
- [ ] Confirm the production compute endpoint.
- [ ] Confirm the configured restore window is long enough for expected incident detection time.
- [ ] Confirm at least two people have Neon access.
- [ ] Record where the production `DATABASE_URL` is stored in Railway.
- [ ] Practice a restore to a non-production branch at least once before beta launch.
- [ ] Keep a lightweight table-count query set for validation.

Suggested validation queries:

```sql
SELECT count(*) FROM users;
SELECT count(*) FROM messages;
SELECT count(*) FROM tasks;
SELECT count(*) FROM journal_entries;
SELECT count(*) FROM habits;
SELECT count(*) FROM journey_goals;
SELECT count(*) FROM push_subscriptions;
SELECT count(*) FROM notification_delivery_logs;
SELECT count(*) FROM system_health_events;
SELECT count(*) FROM cto_reviews;
```

### Backup Procedure Before Risky Changes

Use this before migrations, manual data fixes, bulk scripts, or high-risk deploys.

1. Open the Neon Console.
2. Select the production project.
3. Confirm you are looking at the production branch.
4. Record the current timestamp, including timezone.
5. Create a restore/test branch from the current production branch if the change is high risk.
6. Run the planned migration or data change first against the restore/test branch.
7. Validate table counts and the affected user workflows on the test branch.
8. Proceed in production only after validation passes.

Incident note:
- If the operation is destructive, capture the exact start time before running it. That timestamp is the likely restore target.

### Restore Procedure For Production Corruption

Use this when production data has been corrupted, deleted, or materially altered.

1. Stop the bleeding.
   - Pause risky jobs, webhooks, scripts, or deploys that may still be writing bad data.
   - If needed, temporarily disable the Railway production service or route traffic away.

2. Identify the restore point.
   - Determine the last known good timestamp.
   - Use logs, admin actions, deploy timestamps, and user reports to narrow the window.
   - Prefer a timestamp just before the damaging action began.

3. Create a restore branch first.
   - In Neon, create a branch from the production branch at the last known good timestamp.
   - Create a compute endpoint for that restore branch.
   - Do not immediately overwrite production until validation is complete.

4. Validate the restore branch.
   - Connect to the restore branch.
   - Run table-count checks.
   - Spot-check affected records.
   - Confirm the corrupted/deleted records are correct on the restore branch.
   - If validation fails, adjust the timestamp and create another restore branch.

5. Choose the recovery path.
   - Full branch restore: use when most production data after the incident is invalid.
   - Targeted data repair: use when only a small set of records is affected and newer good data should be preserved.

6. Full branch restore path.
   - Confirm with the incident owner before restoring the production branch.
   - Restore the production branch to the selected timestamp in Neon.
   - Expect a brief database reconnect window.
   - Restart or redeploy the Railway production service if it does not reconnect cleanly.

7. Targeted data repair path.
   - Export the affected rows from the restore branch.
   - Apply a reviewed repair script or SQL transaction to production.
   - Keep all SQL used for the repair in the incident record.

8. Post-restore validation.
   - Open `GET /api/health` and confirm database status is connected.
   - Log in as an admin.
   - Check the affected user/workflow.
   - Review Railway logs and Alfred System Health for new errors.
   - Notify stakeholders that recovery is complete.

### Restore Decision Checklist

- [ ] Do we know when corruption began?
- [ ] Do we know what data was affected?
- [ ] Is newer post-incident data valuable and worth preserving?
- [ ] Has the restore branch been validated?
- [ ] Has the incident owner approved production restore or repair?
- [ ] Has Railway production been smoke-tested after recovery?

## 2. Railway Production Rollback

### Current Recovery Model

Alfred production deploys on Railway. `railway.json` configures `/api/health` as the deployment health check.

Railway rollback can restore a previous successful deployment. Railway documentation notes that rollback restores both the Docker image and custom variables for that deployment, subject to plan retention.

Primary references:
- Railway deployment actions and rollback: https://docs.railway.com/deployments/deployment-actions
- Railway deployment reference: https://docs.railway.com/deployments/reference

### Before An Incident

- [ ] Confirm the production Railway project name.
- [ ] Confirm the production environment name.
- [ ] Confirm the production service name.
- [ ] Confirm who has Railway production access.
- [ ] Confirm `/api/health` is configured as the healthcheck path.
- [ ] Confirm recent successful deployments are visible in the Deployments tab.
- [ ] Confirm the team knows whether custom variables changed in the bad deployment.

### Rollback Procedure

Use this when a production deployment breaks login, key workflows, startup, health checks, or external integrations.

1. Confirm the problem is deployment-related.
   - Check the deployment timestamp.
   - Check `/api/health`.
   - Check Railway deployment logs.
   - Check Alfred System Health if the app is reachable.

2. Open Railway.
   - Select the Alfred production project.
   - Select the production environment.
   - Select the production application service.
   - Open the Deployments tab.

3. Select the previous known-good deployment.
   - Prefer the most recent deployment that was successful before the incident.
   - Open the deployment menu.
   - Choose Rollback.
   - Confirm the rollback.

4. Wait for Railway to activate the rollback.
   - Watch deployment state until it is successful/active.
   - Railway should use the configured health check before routing traffic.

5. Run smoke tests.
   - Complete the production smoke test checklist below.
   - If rollback fails, try redeploying the previous known-good deployment.
   - If both fail, escalate and consider temporarily disabling production access.

### Rollback Notes

- Rollback may not be available for deployments outside Railway retention.
- Rollback can restore custom variables from the selected deployment, so confirm any urgent variable change is still present after rollback.
- If a database migration caused the issue, application rollback may not be enough. Use the Neon restore/repair procedure as needed.

## 3. Production Environment Variable Checklist

Review these in Railway production service variables before launch and after any rollback.

### Core Runtime

- [ ] `DATABASE_URL` points to the Neon production database, not dev.
- [ ] `OPENAI_API_KEY` is set.
- [ ] `OPENAI_MODEL` is set or default behavior is acceptable.
- [ ] `DEFAULT_USER_NUMBER` is set.
- [ ] `APP_URL` or `PUBLIC_APP_URL` points to the production app URL.

### Authentication And Internal Jobs

- [ ] `APP_SESSION_SECRET` is a random value of at least 32 characters.
- [ ] `ALFRED_SCHEDULER_SECRET` is a separate random value of at least 32 characters.
- [ ] `PUBLIC_APP_URL` is the canonical HTTPS production origin used for invitation links.
- [ ] Scheduled nudge requests send `X-Alfred-Scheduler-Secret`; the secret is never placed in a URL.

### Gmail Invitation Email

- [ ] `GMAIL_CLIENT_ID` is set.
- [ ] `GMAIL_CLIENT_SECRET` is set.
- [ ] `GMAIL_REFRESH_TOKEN` is set.
- [ ] `GMAIL_SENDER_EMAIL` is set.

### Railway Monitoring Integration

- [ ] `RAILWAY_TOKEN` is set if Alfred System Health should read Railway deployments/logs.
- [ ] `RAILWAY_PROJECT_ID` or `RAILWAY_PROJECT` is set.
- [ ] `RAILWAY_SERVICE_ID` or `RAILWAY_SERVICE` is set.
- [ ] `RAILWAY_ENVIRONMENT_ID` or `RAILWAY_ENVIRONMENT` is set if needed.
- [ ] `RAILWAY_TOKEN_TYPE` is set if the token requires a non-default auth type.
- [ ] `RAILWAY_GRAPHQL_URL` is left as default unless Railway changes the endpoint.

### Browser Push Notifications

- [ ] `VAPID_PUBLIC_KEY` is set.
- [ ] `VAPID_PRIVATE_KEY` is set.
- [ ] `VAPID_SUBJECT` is set to a monitored support/admin contact.
- [ ] Production serves the app over HTTPS so browser push subscriptions can be created.
- [ ] Settings-page notification status and test-send flow work for a production test user.

### GitHub Operational Review Integration

- [ ] `GITHUB_TOKEN` or the relevant GitHub service token is set if Operations Director or CTO Director should create GitHub issues.
- [ ] The configured repository target is correct for production issue creation.
- [ ] Admin reviewers know that Operations Director and CTO Director drafts require human review before issue creation.

### Safety Checks

- [ ] No dev Neon URL is present in production.
- [ ] No test Gmail sender is present in production.
- [ ] Secrets are not committed to the repository.
- [ ] Variable changes have been reviewed and deployed in Railway.
- [ ] After variable changes, `/api/health` returns HTTP 200.

### GitHub post-deploy verification

- [ ] In the GitHub `production` environment, set the non-secret variable `PRODUCTION_APP_URL` to Alfred's canonical production HTTPS origin.
- [ ] Keep the production branch workflow enabled. After a push to `prod`, it waits for Railway to expose the exact Git commit through `/api/health`.
- [ ] Confirm the `Verify Railway production` job passes. It verifies database connectivity and confirms invalid login and scheduler credentials return HTTP 401.
- [ ] Retain the generated `production-smoke-evidence-<commit>` artifact with the release record. GitHub retains it for 30 days.
- [ ] Treat a timeout or boundary-check failure as a failed release and follow the rollback procedure.

Railway variable reference:
- https://docs.railway.com/variables

## 4. Production Smoke Test Checklist

Run this after every production deploy, rollback, database restore, or critical variable change.

### Public Health

- [ ] Open `https://<production-domain>/api/health`.
- [ ] Confirm HTTP 200.
- [ ] Confirm response includes `"status": "ok"` or equivalent.
- [ ] Confirm database status is `connected`.
- [ ] Confirm OpenAI and Gmail configuration flags look expected.

### Login And Admin

- [ ] Log in as a known admin user.
- [ ] Confirm Settings loads.
- [ ] Confirm User Management loads.
- [ ] Confirm System Health loads.
- [ ] Confirm Operations Director loads.
- [ ] Confirm CTO Director loads.
- [ ] Confirm no unexpected recent critical errors appear.

### User Management

- [ ] Create a test beta user if appropriate.
- [ ] Confirm a temporary password is generated.
- [ ] Confirm the user appears in the user table.
- [ ] Reset the test user's password.
- [ ] Deactivate and reactivate the test user.
- [ ] Confirm admin role toggling still works, without removing the last admin.

### Core User Workflows

- [ ] Log in as a non-admin test user.
- [ ] Open Home.
- [ ] Open My Goals.
- [ ] Open Todo List.
- [ ] Open the task calendar and verify day/week/month navigation, scheduling, and completed-task MTN details.
- [ ] Open Meetings and verify list/detail loading, processing status, transcript/summary display, meeting Q&A, and action-item conversion with safe test data.
- [ ] Open My Journey.
- [ ] Open My Journal.
- [ ] Open My Habits.
- [ ] Open Settings and confirm language, timezone, and notification status load.
- [ ] Send a message to Alfred.
- [ ] Confirm Alfred responds.
- [ ] Create or update a task.
- [ ] Create or update a journal entry.

### AI And Integrations

- [ ] Trigger one lightweight Alfred response that uses OpenAI.
- [ ] Confirm no OpenAI error is recorded.
- [ ] If email is in scope, send or receive a production test email.
- [ ] If invitation email is in scope, send a test invitation.

### Logs And Monitoring

- [ ] Check Railway deployment logs for startup errors.
- [ ] Check Alfred System Health recent errors.
- [ ] Check Operations Director for new high/critical drafts.
- [ ] Check CTO Director only after intentionally running a review.
- [ ] Check OpenAI failure count.
- [ ] Check database failure count.
- [ ] Check Railway log errors in Alfred if the Railway integration is configured.

### Smoke Test Result

Record the result in the release or incident notes:

```text
Date/time:
Tester:
Deployment:
Health check:
Login:
Admin:
Core workflows:
Integrations:
Known issues:
Decision: pass / fail / monitor
```

## 5. Emergency Contact And Escalation Checklist

Fill in the names and contact channels before beta launch.

### Roles

- [ ] Incident owner:
- [ ] Engineering lead:
- [ ] Railway owner:
- [ ] Neon owner:
- [ ] OpenAI/API owner:
- [ ] Gmail owner:
- [ ] Customer/user communications owner:

### Access

- [ ] At least two people can access Railway production.
- [ ] At least two people can access Neon production.
- [ ] At least two people can access DNS/domain settings.
- [ ] At least two people can access OpenAI billing/API settings.
- [ ] At least two people can access Gmail configuration.

### Severity Levels

Severity 1:
- Production is unavailable, login is broken for all users, data corruption is suspected, or Alfred is sending harmful/incorrect automated messages.
- Response target: immediate.
- Actions: assign incident owner, stop the bleeding, notify stakeholders, begin rollback or restore.

Severity 2:
- A major workflow is broken, integrations are failing, or a subset of users cannot use Alfred.
- Response target: same day.
- Actions: diagnose, patch or rollback, communicate to affected users if needed.

Severity 3:
- Minor bug, degraded experience, non-critical admin issue, or cosmetic problem.
- Response target: next planned work block.
- Actions: log issue, prioritize, fix through normal deploy process.

### Escalation Procedure

1. Declare the incident severity.
2. Assign one incident owner.
3. Create a single incident notes thread/document.
4. Record start time, symptoms, affected users, and suspected cause.
5. Decide whether to rollback, restore data, disable integrations, or monitor.
6. Communicate status to affected users if needed.
7. Run the smoke test checklist after mitigation.
8. Record final cause, fix, follow-up items, and prevention steps.

### Emergency Actions

- [ ] Disable risky automation or webhook.
- [ ] Roll back Railway deployment.
- [ ] Restore or repair Neon production data.
- [ ] Rotate compromised secrets.
- [ ] Disable affected user account.
- [ ] Pause outbound Gmail invitations or scheduled nudges if messages are misfiring.
- [ ] Notify users if user-facing impact occurred.

### Post-Incident Review

Complete within 48 hours of a Severity 1 or Severity 2 incident.

- [ ] What happened?
- [ ] When did it start?
- [ ] How was it detected?
- [ ] Who was affected?
- [ ] What fixed it?
- [ ] What data, if any, was changed or restored?
- [ ] What monitoring would have caught it earlier?
- [ ] What documentation or code change prevents recurrence?
