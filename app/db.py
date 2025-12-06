from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.config import settings

#engine = create_engine(settings.DATABASE_URL)
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,           # 🔥 Detect dead DB connections and reconnect
    pool_recycle=300,             # 🔥 Recycle connections every 5 minutes
    pool_size=5,
    max_overflow=10,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
