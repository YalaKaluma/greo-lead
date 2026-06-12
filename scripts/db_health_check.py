import os
import sys

from sqlalchemy import create_engine, text


TABLES = [
    "users",
    "tasks",
    "journal_entries",
    "journey_goals",
    "journey_belt_trials",
    "messages",
]


def main() -> int:
    database_url = os.getenv("DIRECT_DATABASE_URL") or os.getenv("DATABASE_URL")
    if not database_url:
        print("status: error")
        print("detail: DATABASE_URL or DIRECT_DATABASE_URL is required")
        return 2

    engine = create_engine(database_url, pool_pre_ping=True)
    try:
        with engine.connect() as conn:
            for table_name in TABLES:
                count = conn.execute(text(f"SELECT COUNT(*) FROM {table_name}")).scalar_one()
                print(f"{table_name}: {count}")
        print("status: ok")
        return 0
    except Exception as exc:
        print("status: error")
        print(f"detail: {type(exc).__name__}: {exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
