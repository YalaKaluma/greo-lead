# Alfred Mobile MVP

This frontend is configured as a Capacitor app for Android.

## API Target

Mobile builds use `VITE_API_URL` so the bundled app can call the hosted FastAPI backend.

The GitHub debug APK workflow defaults to the Railway development backend:

```env
VITE_API_URL=https://greo-lead-development.up.railway.app
```

The local frontend `.env` may point at production for normal web work:

```env
VITE_API_URL=https://greo-lead-production.up.railway.app
```

If `VITE_API_URL` is not set, production web builds fall back to relative `/api` URLs for the FastAPI-served web app.

## Android Workflow

From `app/frontend`:

```bash
pnpm install
pnpm mobile:sync
pnpm mobile:open:android
```

If `pnpm` is not recognized in PowerShell, either install Node.js/pnpm globally or use the Codex-bundled runtime:

```powershell
$env:PATH="C:\Users\12985\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;C:\Users\12985\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin;$env:PATH"
& "C:\Users\12985\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\pnpm.cmd" mobile:sync
& "C:\Users\12985\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\pnpm.cmd" mobile:open:android
```

To run directly on an emulator or connected Android device:

```bash
pnpm mobile:run:android
```

## GitHub APK Build

If you cannot install Android Studio locally, use the GitHub Actions workflow instead:

1. Push the latest changes to GitHub.
2. Open the repository on GitHub.
3. Go to **Actions**.
4. Select **Android APK**.
5. Click **Run workflow**.
6. Keep the default API URL to build against Railway development, or override it intentionally.
7. Wait for the run to finish.
8. Open the completed run and download the **alfred-debug-apk** artifact.

The artifact contains `app-debug.apk`, which can be sideloaded onto an Android device for testing.
The workflow uses `npm install` to match the existing frontend CI path, and Node 22 because Capacitor CLI 8 requires Node 22 or newer.

## Native Push Notifications

The installed Android app uses Firebase Cloud Messaging for nudge notifications. Browser/PWA notifications still use the existing VAPID Web Push path.

For Android debug APK notifications to work:

1. Create or open the Firebase project for Alfred.
2. Add an Android app with package name `com.AlfredTheChiefOfStaff.myapp.dev` for debug builds.
3. Download that app's `google-services.json`.
4. Add the full JSON contents as a GitHub repository secret named `GOOGLE_SERVICES_JSON_DEBUG`, or add a base64-encoded version as `GOOGLE_SERVICES_JSON_DEBUG_B64`.
   The debug APK workflow can fall back to `GOOGLE_SERVICES_JSON` / `GOOGLE_SERVICES_JSON_B64`, but only if that file contains the debug package `com.AlfredTheChiefOfStaff.myapp.dev`.
   If the available Firebase config only contains the production package, the debug APK still builds but native push notifications are disabled for that APK.
5. Add backend Firebase sender credentials to the Railway development environment:
   - `FIREBASE_SERVICE_ACCOUNT_JSON`: full Firebase service account JSON, or
   - `FIREBASE_SERVICE_ACCOUNT_B64`: base64-encoded Firebase service account JSON
   - Optional: `FIREBASE_PROJECT_ID` if it is not present in the service account JSON.
6. Rebuild the Android APK workflow.
7. In Alfred (dev), go to **Settings -> Notifications**, enable this device, then send a test notification.

The production app needs its own Firebase Android app for package `com.AlfredTheChiefOfStaff.myapp`.

## Play Store AAB Workflow

Use the **Android AAB** GitHub Actions workflow for signed Play Store builds. It builds the web bundle, syncs Capacitor, injects Firebase config, signs the release bundle from GitHub secrets, and uploads `alfred-release-aab`.

Required repository secrets:

- `GOOGLE_SERVICES_JSON` or `GOOGLE_SERVICES_JSON_B64`
- `ANDROID_UPLOAD_KEYSTORE_B64`
- `ANDROID_UPLOAD_KEYSTORE_PASSWORD`
- `ANDROID_UPLOAD_KEY_ALIAS`
- `ANDROID_UPLOAD_KEY_PASSWORD`

The workflow defaults `VITE_API_URL` to the Railway production backend. Override it only when intentionally building a non-production bundle.

## Requirements

- Node.js and pnpm
- Android Studio
- Java/JDK available to Gradle
- Android SDK installed through Android Studio

## Notes

- The native Android project lives in `app/frontend/android`.
- Capacitor sync copies the built web bundle from the repository-level `static/` folder into the Android app.
- Current Android identity in code is `com.AlfredTheChiefOfStaff.myapp` for release and `com.AlfredTheChiefOfStaff.myapp.dev` for debug builds.
- Native push notifications, signed AAB packaging, and GitHub-hosted Play Store bundle generation are now present. Native voice recording remains outside the current mobile scope.
