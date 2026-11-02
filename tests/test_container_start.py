"""Real filesystem checks for root-owned Railway recording volumes."""
import os
from pathlib import Path
import pwd
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from app.container_start import prepare_storage, recording_root


class RecordingStorageTests(unittest.TestCase):
    def test_matches_explicit_storage_configuration(self):
        with patch.dict(os.environ, {"MEETING_STORAGE_DIR": "/data/recordings",
                                    "RAILWAY_VOLUME_MOUNT_PATH": "/ignored"}, clear=True):
            self.assertEqual(recording_root(), Path("/data/recordings"))

    def test_volume_default(self):
        with patch.dict(os.environ, {"RAILWAY_VOLUME_MOUNT_PATH": "/data"}, clear=True):
            self.assertEqual(recording_root(), Path("/data/meetings"))

    def test_rejects_symlink_without_changing_target(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "target"
            target.mkdir(mode=0o755)
            link = Path(directory) / "link"
            link.symlink_to(target, target_is_directory=True)
            with self.assertRaises(RuntimeError):
                prepare_storage(link / "meetings", os.getuid(), os.getgid())
            self.assertFalse((target / "meetings").exists())

    @unittest.skipUnless(os.geteuid() == 0, "requires root to reproduce mounted-volume ownership")
    def test_root_owned_volume_becomes_writable_after_privilege_drop(self):
        account = pwd.getpwnam("nobody")
        with tempfile.TemporaryDirectory() as directory:
            volume = Path(directory)
            volume.chmod(0o755)
            root = volume / "meetings"
            root.mkdir(mode=0o755)
            existing = root / "existing.wav"
            existing.write_bytes(b"existing recording")
            original_owner = existing.stat().st_uid
            code = """
import os, pwd, sys
from pathlib import Path
from app.container_start import prepare_storage, drop_privileges
root = Path(sys.argv[1])
account = pwd.getpwnam("nobody")
prepare_storage(root, account.pw_uid, account.pw_gid)
drop_privileges(account)
assert os.geteuid() != 0
user = root / "upload-test"
user.mkdir()
recording = user / "recording.wav"
recording.write_bytes(b"test recording")
assert recording.read_bytes() == b"test recording"
assert (root / "existing.wav").read_bytes() == b"existing recording"
recording.unlink()
user.rmdir()
"""
            result = subprocess.run([sys.executable, "-c", code, str(root)],
                                    capture_output=True, text=True, check=False)
            if result.returncode and "OSError: [Errno 22]" in result.stderr:
                self.skipTest("workspace filesystem does not support ownership changes; run on Linux CI")
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(root.stat().st_uid, account.pw_uid)
            self.assertEqual(existing.stat().st_uid, original_owner)
            self.assertEqual(existing.read_bytes(), b"existing recording")


if __name__ == "__main__":
    unittest.main()
