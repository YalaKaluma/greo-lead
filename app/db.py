# app/db.py

import logging

from sqlalchemy import create_engine, Column, Integer, String, Boolean, DateTime
from sqlalchemy.exc import DBAPIError, OperationalError
from sqlalchemy.orm import sessionmaker, declarative_base
from app.config import DATABASE_URL  # ← import the variable directly
from datetime import datetime

logger = logging.getLogger(__name__)

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,     # fixes SSL disconnects
    pool_recycle=300,
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)



Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        try:
            db.close()
        except (OperationalError, DBAPIError):
            # A remote SSL connection can disappear after the endpoint has
            # already completed its work. Session.close() then attempts a final
            # rollback and may raise, incorrectly turning a successful response
            # into a 500. Invalidate that connection and let the next request
            # obtain a fresh one from the pool.
            try:
                db.invalidate()
            except (OperationalError, DBAPIError):
                pass
            logger.warning("Discarded a dead database connection during request cleanup.")
