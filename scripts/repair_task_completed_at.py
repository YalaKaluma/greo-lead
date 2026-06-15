from __future__ import annotations

import argparse
import os
from datetime import datetime, timezone

import psycopg2
from psycopg2.extras import execute_values


BAD_WINDOW_START = "2026-06-14 11:33:00"
BAD_WINDOW_END = "2026-06-14 11:34:00"


def _connect(env_name: str):
    url = os.getenv(env_name)
    if not url:
        raise SystemExit(f"Set {env_name} before running this script.")
    return psycopg2.connect(url.replace("postgresql+psycopg2://", "postgresql://"))


def _fetch_recovery_completed(conn):
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, updated_at
            FROM tasks
            WHERE status = 'completed'
              AND updated_at IS NOT NULL
            """
        )
        return dict(cur.fetchall())


def _fetch_prod_candidates(conn, recovery_ids):
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, title, completed_at, updated_at
            FROM tasks
            WHERE status = 'completed'
              AND id = ANY(%s)
              AND completed_at >= %s
              AND completed_at < %s
            ORDER BY id
            """,
            (list(recovery_ids), BAD_WINDOW_START, BAD_WINDOW_END),
        )
        return cur.fetchall()


def _print_sample(rows, recovery_by_id, limit=10):
    print("\nSample rows to repair:")
    for task_id, title, completed_at, updated_at in rows[:limit]:
        print(
            f"- id={task_id} | prod completed_at={completed_at} | "
            f"recovery updated_at={recovery_by_id[task_id]} | {title[:80]}"
        )


def _apply_updates(conn, rows, recovery_by_id):
    values = [(recovery_by_id[task_id], task_id) for task_id, *_ in rows]
    with conn.cursor() as cur:
        execute_values(
            cur,
            """
            UPDATE tasks AS task
            SET completed_at = data.completed_at
            FROM (VALUES %s) AS data(completed_at, id)
            WHERE task.id = data.id
              AND task.status = 'completed'
              AND task.completed_at >= TIMESTAMP '2026-06-14 11:33:00'
              AND task.completed_at < TIMESTAMP '2026-06-14 11:34:00'
            """,
            values,
            template="(%s::timestamp, %s::integer)",
        )
        return cur.rowcount


def main():
    parser = argparse.ArgumentParser(
        description="Repair production task completed_at values from a restored Neon branch."
    )
    parser.add_argument("--apply", action="store_true", help="Actually write the repairs.")
    args = parser.parse_args()

    recovery_conn = _connect("RECOVERY_DATABASE_URL")
    prod_conn = _connect("PROD_DATABASE_URL")

    try:
        recovery_by_id = _fetch_recovery_completed(recovery_conn)
        rows = _fetch_prod_candidates(prod_conn, recovery_by_id.keys())

        print(f"Recovery completed tasks with timestamps: {len(recovery_by_id)}")
        print(
            "Production completed tasks in bad completed_at window "
            f"{BAD_WINDOW_START} to {BAD_WINDOW_END}: {len(rows)}"
        )
        _print_sample(rows, recovery_by_id)

        if not args.apply:
            print("\nDry run only. No production data was changed.")
            print("If the counts and sample look right, rerun with --apply.")
            return

        updated = _apply_updates(prod_conn, rows, recovery_by_id)
        prod_conn.commit()
        print(f"\nUpdated production rows: {updated}")
        print(f"Completed at {datetime.now(timezone.utc).isoformat()}")
    finally:
        recovery_conn.close()
        prod_conn.close()


if __name__ == "__main__":
    main()
