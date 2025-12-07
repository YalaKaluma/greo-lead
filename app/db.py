# app/db.py

from sqlalchemy import create_engine, Column, Integer, String, Boolean, DateTime
from sqlalchemy.orm import sessionmaker, declarative_base
from app.config import DATABASE_URL  # ← import the variable directly
from datetime import datetime

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
        db.close()
