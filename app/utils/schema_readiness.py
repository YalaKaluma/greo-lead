"""Read-only database readiness checks for deployed application startup."""

from __future__ import annotations

from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import text
from sqlalchemy.engine import Engine


def expected_schema_revision(alembic_ini: str = "alembic.ini") -> str:
    config_path = Path(alembic_ini)
    if not config_path.is_file():
        raise RuntimeError("Alembic configuration is unavailable")
    config = Config(str(config_path))
    script = ScriptDirectory.from_config(config)
    head = script.get_current_head()
    if not head:
        raise RuntimeError("Alembic has no current schema head")
    return head


def verify_database_schema(engine: Engine, alembic_ini: str = "alembic.ini") -> str:
    """Fail closed unless the database is reachable and exactly at Alembic head."""

    expected = expected_schema_revision(alembic_ini)
    with engine.connect() as connection:
        current = connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one_or_none()
        connection.execute(text("SELECT 1"))
    if current != expected:
        raise RuntimeError("Database schema is not at the required Alembic revision")
    return expected
