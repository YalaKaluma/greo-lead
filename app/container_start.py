"""Prepare recording storage before starting Alfred as its restricted account.

Railway mounts volumes as root. Set RAILWAY_RUN_UID=0 only for this bootstrap;
the web server always runs as the image's alfred user.
"""
from __future__ import annotations

import os
from pathlib import Path
import pwd
import sys
import tempfile


def recording_root() -> Path:
    configured = os.getenv("MEETING_STORAGE_DIR")
    mount = os.getenv("RAILWAY_VOLUME_MOUNT_PATH")
    return Path(configured or (str(Path(mount) / "meetings") if mount else
                               str(Path(tempfile.gettempdir()) / "alfred-meetings")))


def prepare_storage(root: Path, uid: int, gid: int) -> None:
    # Refuse links rather than changing ownership of an unexpected target.
    if root.is_symlink() or any(parent.is_symlink() for parent in root.parents):
        raise RuntimeError("Recording storage must not use symbolic links")
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    if os.geteuid() == 0:
        # Only the recording directory, never the entire volume or existing files.
        os.chown(root, uid, gid)
        root.chmod(0o700)


def drop_privileges(account: pwd.struct_passwd) -> None:
    if account.pw_uid == 0:
        raise RuntimeError("Alfred must not run as root")
    if os.geteuid() == 0:
        os.initgroups(account.pw_name, account.pw_gid)
        os.setgid(account.pw_gid)
        os.setuid(account.pw_uid)
    if os.geteuid() != account.pw_uid:
        raise RuntimeError("Alfred is running under an unexpected account")
    os.environ["HOME"] = account.pw_dir


def main() -> None:
    account = pwd.getpwnam("alfred")
    root = recording_root()
    prepare_storage(root, account.pw_uid, account.pw_gid)
    drop_privileges(account)
    # Check real create/write/delete permissions after dropping privileges.
    with tempfile.TemporaryFile(dir=root) as probe:
        probe.write(b"storage-ready")
        probe.flush()
    print(f"Recording storage ready; running Alfred as uid={os.geteuid()}", flush=True)
    import uvicorn

    # Bind on the container network for Railway\'s HTTP proxy.
    uvicorn.run("app.main:app", host="0.0.0.0",  # nosec B104 - container HTTP listener
                port=int(os.getenv("PORT", "8080")))


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError) as error:
        print(f"Recording storage startup check failed ({type(error).__name__})", file=sys.stderr, flush=True)
        raise SystemExit(1) from error
