"""Constrain persisted upload paths to their configured storage roots."""

from pathlib import Path


def stored_path_within_root(storage_key: str, storage_root: Path) -> Path | None:
    try:
        root = storage_root.resolve()
        candidate = Path(storage_key).resolve()
        if not candidate.is_relative_to(root):
            return None
        return candidate
    except (OSError, RuntimeError, TypeError, ValueError):
        return None
