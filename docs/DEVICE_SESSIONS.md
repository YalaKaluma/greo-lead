# Device sessions

New browser and native clients request `session_protocol: device-v1` at login.
They use 15-minute signed access tokens and a revocable device session. The
"Remember this device for 30 days" option has a fixed 30-day maximum measured
from login; automatic renewal does not extend that deadline. Unchecked sessions
last at most eight hours and use browser session cookies or native memory only.
Temporary-password sessions are limited to 30 minutes and require a password
change before other user operations.

Browser access and refresh credentials use HttpOnly, Secure (HTTPS deployment),
SameSite=Lax cookies. The refresh cookie is limited to `/api/auth`. Browser code
never stores bearer credentials in localStorage/sessionStorage. Native clients
store the access/refresh pair in the existing Android Keystore / iOS Keychain
plugin. A native rebuild is needed to distribute the new renewal transport;
older installed builds retain their previous bounded access-token lifetime.
Existing sessions can require one fresh sign-in to adopt the new device flow.

Refresh credentials rotate under a database row lock. Only hashes are stored.
The immediately previous credential can retrieve the same successor for 60
seconds to handle concurrent requests or a lost response; replay after that
window revokes that device. Random invalid credentials cannot revoke a session.
Refresh does not change the original password-authentication timestamp.

Administrator endpoints and the administrator branch of scheduler authorization
require password authentication within the previous 15 minutes for device
sessions. The Admin tab offers reauthentication without signing out of the main
app. Password confirmation is rate-limited. Pre-upgrade tokens preserve their
existing eight-hour administrator freshness limit until expiry.

Normal logout revokes only the current device, including already-issued access
tokens. A hashed tombstone handles tokens issued before device IDs existed.
Settings > Privacy & Data has a separate "Sign out everywhere" action. Password
changes/resets and deactivation continue to invalidate all device access and
refresh credentials through the account session version / active state.

Temporary startup/network/server/secure-storage failures preserve credentials
and show a retry screen. The client retries an authentication-rejected request
once after renewal, including recording uploads, and never automatically retries
an administrator mutation rejected for stale elevated access.

## Rollout and verification

Alembic revision `20261031_0001` adds only `device_sessions`; it does not modify
meeting data. Development follows the existing Railway pre-deploy migration.
Promoting to production remains a separate release with migration verification.

Backend tests cover the eight-hour boundary, fixed lifetime, device/global logout,
password revocation, refresh rotation/replay, browser CSRF, mobile restoration,
legacy client compatibility, onboarding and admin freshness. Frontend and browser
tests run in CI under the repository's local-validation restriction. Physical
Android/iOS background/reopen validation remains part of native release QA.
