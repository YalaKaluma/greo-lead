"""Shared, schema-tolerant access to procrastination-pattern records."""

from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session


def get_table_columns(db: Session, table_name: str) -> set[str]:
    rows = db.execute(
        text(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = :table_name
            """
        ),
        {"table_name": table_name},
    ).scalars().all()
    return set(rows)


def get_procrastination_pattern_columns(db: Session) -> set[str]:
    return get_table_columns(db, "journey_procrastination_patterns")


def get_procrastination_pattern_rows(db: Session, user_number: str) -> list[dict[str, Any]]:
    columns = get_procrastination_pattern_columns(db)
    if not columns:
        return []

    optional_columns = [
        "id", "user_number", "title", "pattern_text", "underlying_reason",
        "strategy", "trigger_text", "trigger", "mitigation", "first_seen_at", "updated_at",
    ]
    select_columns = [column for column in optional_columns if column in columns]
    if not {"id", "user_number", "pattern_text"}.issubset(columns):
        return []

    order_column = "first_seen_at" if "first_seen_at" in columns else "id"
    select_query = f"SELECT {', '.join(select_columns)} FROM journey_procrastination_patterns WHERE user_number = :user_number ORDER BY {order_column} DESC"  # nosec B608
    rows = db.execute(text(select_query), {"user_number": user_number}).mappings().all()
    return [dict(row) for row in rows]
