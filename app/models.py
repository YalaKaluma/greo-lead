from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.sql import func
from app.db import Base
from .db import Base   # use your existing Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    phone_number = Column(String, unique=True, index=True)
    name = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)

    entries = relationship("JournalEntry", back_populates="user")


class JournalEntry(Base):
    __tablename__ = "journal_entries"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    text = Column(Text)
    ai_summary = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="entries")

class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    sender = Column(String, index=True)          # "user" or "assistant"
    user_number = Column(String, index=True)
    content = Column(Text)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())

class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    user_number = Column(String, index=True)   # same as messages table
    title = Column(String, nullable=False)
    notes = Column(Text, nullable=True)
    due_date = Column(DateTime, nullable=True)
    status = Column(String, default="open")    # open, completed, archived
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)

# ---------------------------------------------------------
# EXPANDED JOURNEY STRUCTURE
# ---------------------------------------------------------

class JourneyPerson(Base):
    __tablename__ = "journey_people"

    id = Column(Integer, primary_key=True, index=True)
    user_number = Column(String, index=True)

    name = Column(String, nullable=False)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    relation = Column(String, nullable=True)     # colleague, client, partner…
    context = Column(Text, nullable=True)        # optional notes

    first_seen_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class JourneyGoal(Base):
    __tablename__ = "journey_goals"

    id = Column(Integer, primary_key=True, index=True)
    user_number = Column(String, index=True)

    goal_text = Column(Text, nullable=False)
    why = Column(Text, nullable=True)
    time_horizon = Column(String, nullable=True)  # short, medium, long

    first_seen_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class JourneyFailure(Base):
    __tablename__ = "journey_failures"

    id = Column(Integer, primary_key=True, index=True)
    user_number = Column(String, index=True)

    failure_text = Column(Text, nullable=False)
    scar = Column(Text, nullable=True)       # emotional residue
    learning = Column(Text, nullable=True)   # lesson learned

    first_seen_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class JourneyProject(Base):
    __tablename__ = "journey_projects"

    id = Column(Integer, primary_key=True, index=True)
    user_number = Column(String, index=True)

    project_name = Column(String, nullable=False)
    goal = Column(Text, nullable=True)        # strategic purpose of the project
    description = Column(Text, nullable=True)
    status = Column(String, default="active")  # active, paused, completed

    first_seen_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class JourneyStrength(Base):
    __tablename__ = "journey_strengths"

    id = Column(Integer, primary_key=True, index=True)
    user_number = Column(String, index=True)

    strength = Column(Text, nullable=False)
    source = Column(String, nullable=True)     # inference, user input...

    first_seen_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class JourneyOpportunity(Base):
    __tablename__ = "journey_opportunities"

    id = Column(Integer, primary_key=True, index=True)
    user_number = Column(String, index=True)

    opportunity_text = Column(Text, nullable=False)
    category = Column(String, nullable=True)    # leadership, delegation, mindset…

    first_seen_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
