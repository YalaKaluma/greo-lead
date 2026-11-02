# Recording storage startup

Railway mounts persistent volumes as root. The Docker image defaults to user alfred (UID 10001).

For each volume-backed Railway environment:

- Mount its own volume at /data and set MEETING_STORAGE_DIR=/data/meetings.
- Set RAILWAY_RUN_UID=0 so the startup bootstrap can create and assign the recording directory.
- Start with python -m app.container_start (configured in railway.json and Docker CMD). Do not override this with a direct uvicorn command.

The bootstrap changes only the recording root ownership, not the volume root or existing files. It drops supplementary groups, GID and UID to alfred before testing create/write/delete access and serving HTTP. A failed storage check exits before the health endpoint becomes available. Existing recordings must already be owned/readable by alfred; this is not a migration tool.

Verification: require the startup log `Recording storage ready; running Alfred as uid=10001`, then perform an authenticated upload and download/playback check. Health alone does not verify the upload API. Keep a failed recording tab open until its audio has been saved successfully.

Production Release CI runs test_container_start.py as root on Linux to reproduce mounted-volume permissions and verify writes after privilege drop. Normal tests also check path configuration and reject symlinked storage.
