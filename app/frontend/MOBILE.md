# Alfred Mobile MVP

This frontend is configured as a Capacitor app for Android.

## API Target

Mobile builds use `VITE_API_URL` from `.env` so the bundled app can call the hosted FastAPI backend:

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
6. Keep the default API URL unless you want a staging backend.
7. Wait for the run to finish.
8. Open the completed run and download the **alfred-debug-apk** artifact.

The artifact contains `app-debug.apk`, which can be sideloaded onto an Android device for testing.

## Requirements

- Node.js and pnpm
- Android Studio
- Java/JDK available to Gradle
- Android SDK installed through Android Studio

## Notes

- The native Android project lives in `app/frontend/android`.
- Capacitor sync copies the built web bundle from the repository-level `static/` folder into the Android app.
- Phase 1 does not add native push notifications, native voice recording, app signing, or app-store packaging.
