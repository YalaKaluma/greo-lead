"""Idempotent account erasure for users whose grace period has elapsed."""

from __future__ import annotations

import os
import tempfile
import warnings
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import or_, update
from sqlalchemy.exc import SAWarning
from sqlalchemy.orm import Session

from app.models import Base, Meeting, ProjectDocument, User
from app.utils.safe_storage import stored_path_within_root


MEETING_STORAGE_ROOT = Path(
    os.getenv("MEETING_STORAGE_DIR") or Path(tempfile.gettempdir()) / "alfred-meetings"
)
PROJECT_STORAGE_ROOT = Path(
    os.getenv("PROJECT_STORAGE_DIR") or Path(tempfile.gettempdir()) / "alfred-projects"
)


def _identifiers(user: User) -> list[str]:
    return [
        value
        for value in {user.phone_number, user.email, str(user.id)}
        if value is not None and str(value).strip()
    ]


def _remove_stored_file(storage_key: str | None, root: Path) -> bool:
    if not storage_key:
        return False
    stored_path = stored_path_within_root(storage_key, root)
    if not stored_path or not stored_path.is_file():
        return False
    stored_path.unlink()
    return True


def _remove_user_files(db: Session, identifiers: list[str]) -> int:
    removed = 0
    meeting_keys = db.query(Meeting.recording_storage_key).filter(
        Meeting.user_number.in_(identifiers)
    ).all()
    document_keys = db.query(ProjectDocument.storage_key).filter(
        ProjectDocument.user_number.in_(identifiers)
    ).all()
    for (storage_key,) in meeting_keys:
        removed += int(_remove_stored_file(storage_key, MEETING_STORAGE_ROOT))
    for (storage_key,) in document_keys:
        removed += int(_remove_stored_file(storage_key, PROJECT_STORAGE_ROOT))
    return removed


def erase_user_data(db: Session, user: User) -> dict[str, int]:
    """Erase all data linked through a user FK or legacy user-number field."""

    identifiers = _identifiers(user)
    files_removed = _remove_user_files(db, identifiers)

    # Self-referencing goals must be detached before their rows are removed.
    goals = Base.metadata.tables.get("journey_goals")
    if goals is not None:
        db.execute(
            update(goals)
            .where(goals.c.user_number.in_(identifiers))
            .values(parent_goal_id=None)
        )

    rows_removed = 0
    # Delete children before parents. Tables with direct user ownership are
    # selected from model metadata so new owned tables cannot be silently missed.
    with warnings.catch_warnings():
        # Tasks and opportunity suggestions reference one another only through
        # nullable SET NULL links, so either ordering is safe for this cycle.
        warnings.simplefilter("ignore", SAWarning)
        owned_tables = list(reversed(Base.metadata.sorted_tables))
    for table in owned_tables:
        if table.name == User.__tablename__:
            continue
        predicates = []
        if "user_number" in table.c:
            predicates.append(table.c.user_number.in_(identifiers))
        for column in table.c:
            if any(foreign_key.target_fullname == "users.id" for foreign_key in column.foreign_keys):
                predicates.append(column == user.id)
        if not predicates:
            continue
        result = db.execute(table.delete().where(or_(*predicates)))
        rows_removed += max(result.rowcount or 0, 0)

    # Keep a non-identifying tombstone rather than breaking retained operational
    # records whose foreign keys intentionally prohibit deleting the user row.
    user.phone_number = f"deleted-{user.id}@deleted.invalid"
    user.email = None
    user.name = "Deleted user"
    user.profession = None
    user.password_hash = None
    user.temp_password = None
    user.temp_password_expires = None
    user.temp_password_consumed_at = None
    user.session_version = int(user.session_version or 0) + 1
    user.is_admin = False
    user.is_active = False
    user.account_deletion_scheduled_for = None
    user.is_synthetic_user = False
    user.synthetic_user_type = None
    user.onboarding_data = {}
    user.tour_completed_steps = []
    user.voice_reference_data_url = None
    user.voice_reference_mime_type = None
    user.voice_reference_consented_at = None
    user.last_login_at = None
    user.last_active_at = None
    return {"rows_removed": rows_removed, "files_removed": files_removed}


def purge_due_account_deletions(
    db: Session,
    *,
    now: datetime | None = None,
    limit: int = 25,
) -> dict[str, int]:
    """Erase a bounded batch of accounts after their 30-day grace period."""

    cutoff = now or datetime.now(timezone.utc)
    users = (
        db.query(User)
        .filter(
            User.is_active.is_(False),
            User.account_deletion_scheduled_for.isnot(None),
            User.account_deletion_scheduled_for <= cutoff,
        )
        .order_by(User.account_deletion_scheduled_for, User.id)
        .limit(max(1, min(limit, 100)))
        .all()
    )
    totals = {"accounts_erased": 0, "rows_removed": 0, "files_removed": 0}
    for user in users:
        result = erase_user_data(db, user)
        totals["accounts_erased"] += 1
        totals["rows_removed"] += result["rows_removed"]
        totals["files_removed"] += result["files_removed"]
    if users:
        db.commit()
    return totals
