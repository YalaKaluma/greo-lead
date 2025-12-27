from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Date
from sqlalchemy.sql import func
from app.db import Base
from .db import Base   # use your existing Base
from sqlalchemy.dialects.postgresql import JSONB





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
    project = Column(String, nullable=True)
    delegated_to = Column(String, nullable=True)
    due_date = Column(DateTime, nullable=True)
    status = Column(String, default="open")    # open, completed, archived
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)
    goal_id = Column(Integer, ForeignKey('journey_goals.id', ondelete='SET NULL'), nullable=True)
    goal = relationship("JourneyGoal", backref="tasks")
#    deadline = Column(Date, nullable=True)
    priority = Column(String, nullable=True)  # Can be 'low', 'medium', or 'high'

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

    title = Column(String(200), nullable=True)  # Short title for sidebar
    goal_text = Column(Text, nullable=False)     # Full description
    why = Column(Text, nullable=True)
    time_horizon = Column(String, nullable=True)  # short, medium, long
    parent_goal_id = Column(Integer, ForeignKey('journey_goals.id'), nullable=True)  # Hierarchical goals
    sort_order = Column(Integer, default=0, nullable=True)  # ← NEW FIELD FOR DRAG-AND-DROP ORDERING

    first_seen_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationship for parent/child goals
    children = relationship("JourneyGoal", backref="parent", remote_side=[id])


class JourneyFailure(Base):
    __tablename__ = "journey_failures"

    id = Column(Integer, primary_key=True, index=True)
    user_number = Column(String, index=True)

    title = Column(String(200), nullable=True)     # Optional title
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

    title = Column(String(200), nullable=True)     # Optional title
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


class JourneyDevelopmentArea(Base):
    __tablename__ = "journey_development_areas"

    id = Column(Integer, primary_key=True, index=True)
    user_number = Column(String, index=True)
    title = Column(String(200), nullable=True)     # Optional title
    skill = Column(String, nullable=False)
    source = Column(String, nullable=True)
    first_seen_at = Column(DateTime, default=datetime.utcnow, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=True)


class ConversationState(Base):
    """
    Stores Alfred's Brain state per user for orchestration.

    This table enables the Brain to track:
    - Current conversational state (IDLE, COACHING, etc.)
    - Detected intents with confidence scores
    - Pending actions awaiting approval
    - Context needed to resume interrupted flows
    """
    __tablename__ = "conversation_state"

    id = Column(Integer, primary_key=True, index=True)
    user_number = Column(String(255), unique=True, nullable=False, index=True)

    # State machine
    current_state = Column(String(50), nullable=False, default='IDLE', index=True)

    # Intent detection results
    active_intents = Column(JSONB, nullable=True)
    # Example: [{"name": "COACH", "confidence": 0.88}, {"name": "EXECUTE", "confidence": 0.42}]

    # Pending actions
    pending_action = Column(String(100), nullable=True)
    # Example: "PROPOSE_TASK", "PROPOSE_EMAIL", "ASK_CLARIFICATION"

    pending_payload = Column(JSONB, nullable=True)
    # Example: {"title": "Follow up with John", "due_date": "2025-12-14"}

    # State context (for resuming)
    state_context = Column(JSONB, nullable=True)
    # Example: {"coaching_topic": "delegation", "question_count": 2}

    # Timestamps
    last_transition_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<ConversationState(user={self.user_number}, state={self.current_state})>"

    def to_dict(self):
        """Convert to dictionary for logging/debugging"""
        return {
            "user_number": self.user_number,
            "current_state": self.current_state,
            "active_intents": self.active_intents,
            "pending_action": self.pending_action,
            "pending_payload": self.pending_payload,
            "state_context": self.state_context,
            "last_transition_at": self.last_transition_at.isoformat() if self.last_transition_at else None,
        }


class JourneyValue(Base):
    __tablename__ = "journey_values"

    id = Column(Integer, primary_key=True, index=True)
    user_number = Column(String, index=True)
    title = Column(String(200), nullable=False)
    value_text = Column(Text, nullable=False)
    why = Column(Text, nullable=True)
    first_seen_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class WaitlistEntry(Base):
    __tablename__ = "waitlist"

    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True, index=True, nullable=False)
    source = Column(String, nullable=True)  # e.g. 'video', 'linkedin', 'friend'
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class JourneyAchievement(Base):
    __tablename__ = "journey_achievements"

    id = Column(Integer, primary_key=True, index=True)
    user_number = Column(String, index=True)
    title = Column(String(200), nullable=False)
    achievement_text = Column(Text, nullable=False)
    impact = Column(Text, nullable=True)
    first_seen_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # -------------------------------
    # EXECUTIVE HABITS
    # -------------------------------

class Habit(Base):
    __tablename__ = "habits"

    id = Column(Integer, primary_key=True, index=True)
    user_number = Column(String, index=True, nullable=False)
    title = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class HabitCompletion(Base):
    __tablename__ = "habit_completions"

    id = Column(Integer, primary_key=True, index=True)
    habit_id = Column(Integer, ForeignKey("habits.id", ondelete="CASCADE"))
    date = Column(Date, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)

    habit = relationship("Habit", backref="completions")

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime)
    phone_number = Column(String)
    name = Column(String, unique=True)      # 👈 this is username
    password = Column(String)

# ✅ ADD THIS LINE:
    entries = relationship("JournalEntry", back_populates="user", cascade="all, delete-orphan")
