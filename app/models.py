from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON, Text, Boolean, DECIMAL, Float, Enum as SQLEnum, CheckConstraint, UniqueConstraint, Index
from sqlalchemy.orm import relationship
from datetime import datetime, timedelta, timezone
from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Date
from sqlalchemy.sql import func
from app.db import Base
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.mutable import MutableDict, MutableList  # ← ADDED FOR FIX
import enum
import secrets


# from app.database import Base
# from database import Base


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
    sender = Column(String, index=True)
    user_number = Column(String, index=True)
    content = Column(Text)

    # NEW
    message_type = Column(String, default="chat")
    is_read = Column(Boolean, default=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())


class MessageFeedback(Base):
    __tablename__ = "message_feedback"
    __table_args__ = (
        CheckConstraint("rating BETWEEN 1 AND 5", name="ck_message_feedback_rating"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    message_id = Column(Integer, ForeignKey("messages.id"), nullable=False, index=True)
    source_context = Column(String(50), nullable=False, index=True)
    rating = Column(Integer, nullable=False)
    feedback_text = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")
    message = relationship("Message")


class MessageSignalFlag(Base):
    __tablename__ = "message_signal_flags"
    __table_args__ = (
        UniqueConstraint(
            "message_id",
            "signal_type",
            "prompt_version",
            "model_version",
            name="uq_message_signal_flags_message_signal_version",
        ),
        Index("idx_message_signal_flags_user", "user_id"),
        Index("idx_message_signal_flags_message", "message_id"),
        Index("idx_message_signal_flags_signal", "signal_type"),
        Index("idx_message_signal_flags_source", "source_type"),
        Index("idx_message_signal_flags_confidence", "confidence_score"),
        Index("idx_message_signal_flags_created", "created_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    message_id = Column(Integer, ForeignKey("messages.id", ondelete="CASCADE"), nullable=False, index=True)
    source_type = Column(String, nullable=False, index=True)
    signal_type = Column(String, nullable=False, index=True)
    is_met = Column(Boolean, default=False, nullable=False)
    confidence_score = Column(Float, nullable=False, default=0.0)
    evidence_excerpt = Column(Text, nullable=True)
    reasoning_summary = Column(Text, nullable=True)
    prompt_version = Column(String, nullable=False)
    model_version = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User")
    message = relationship("Message")

class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    user_number = Column(String, index=True)  # same as messages table
    title = Column(String, nullable=False)
    notes = Column(Text, nullable=True)
    project = Column(String, nullable=True)
    delegated_to = Column(String, nullable=True)
    due_date = Column(DateTime, nullable=True)
    status = Column(String, default="open")  # open, completed, archived
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)
    goal_id = Column(Integer, ForeignKey('journey_goals.id', ondelete='SET NULL'), nullable=True)
    goal = relationship("JourneyGoal", backref="tasks")
    #    deadline = Column(Date, nullable=True)
    priority = Column(String, nullable=True)  # Can be 'low', 'medium', or 'high'

    # Priority system fields (added for Step 1: Task Prioritization)
    times_postponed = Column(Integer, default=0)
    current_bucket = Column(String, nullable=True)  # "today", "this_week", "later", "someday"
    in_top10 = Column(Boolean, default=False)
    top10_position = Column(Integer, nullable=True)  # 1-10 or null
    last_prioritized_at = Column(DateTime(timezone=True), nullable=True)

    # Fields for AI based enhancement to task description
    strategic_intent = Column(Text, nullable=True)
    move_the_needle_score = Column(Float, nullable=True)
    estimated_effort = Column(String, nullable=True)

    suggested_subtasks = Column(JSON, nullable=True)
    alfred_help = Column(JSON, nullable=True)

    enhanced_title = Column(Text, nullable=True)

    ai_enriched = Column(Boolean, default=False)
    originating_opportunity_id = Column(Integer, ForeignKey("opportunity_suggestions.id", ondelete="SET NULL"), nullable=True)


class OpportunitySuggestion(Base):
    __tablename__ = "opportunity_suggestions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    surface = Column(Text, nullable=False)
    type = Column(Text, nullable=False)
    title = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
    rationale = Column(Text, nullable=True)
    domain = Column(Text, nullable=True)
    linked_goal_id = Column(Integer, ForeignKey("journey_goals.id", ondelete="SET NULL"), nullable=True)
    mtn_score = Column(DECIMAL, nullable=True)
    status = Column(Text, default="suggested")
    generated_context = Column(JSONB, nullable=True)
    scoring_details = Column(JSONB, nullable=True)
    created_task_id = Column(Integer, ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True)
    user_feedback = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User")
    linked_goal = relationship("JourneyGoal")


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
    relation = Column(String, nullable=True)  # colleague, client, partner…
    context = Column(Text, nullable=True)  # optional notes
    strengths = Column(Text, nullable=True)
    growth_areas = Column(Text, nullable=True)
    aspirations = Column(Text, nullable=True)

    first_seen_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # People Review fields (add after updated_at field)
    last_reviewed_at = Column(DateTime, nullable=True)
    review_frequency = Column(String, default='monthly', nullable=True)
    relationship_health = Column(Integer, nullable=True)
    needs_attention = Column(Boolean, default=False)


class RelationshipReview(Base):
    __tablename__ = "relationship_reviews"

    id = Column(Integer, primary_key=True, index=True)
    user_number = Column(String, index=True, nullable=False)
    person_id = Column(Integer, ForeignKey('journey_people.id', ondelete='CASCADE'), nullable=False)

    # Review metadata
    review_date = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    review_type = Column(String, default='regular', nullable=True)

    # Relationship health assessment
    relationship_strength = Column(Integer, nullable=True)
    communication_frequency = Column(String, nullable=True)
    last_meaningful_interaction = Column(Text, nullable=True)

    # Strategic alignment
    mutual_value = Column(Text, nullable=True)
    alignment_level = Column(String, nullable=True)
    strategic_importance = Column(String, nullable=True)

    # Current state
    recent_interactions = Column(Text, nullable=True)
    current_dynamics = Column(Text, nullable=True)
    unresolved_issues = Column(Text, nullable=True)

    # Action planning
    next_steps = Column(Text, nullable=True)
    communication_plan = Column(Text, nullable=True)
    boundaries_to_set = Column(Text, nullable=True)

    # Growth opportunities
    how_to_strengthen = Column(Text, nullable=True)
    what_to_appreciate = Column(Text, nullable=True)
    what_to_address = Column(Text, nullable=True)

    # Reflection
    insights = Column(Text, nullable=True)
    patterns_noticed = Column(Text, nullable=True)
    personal_growth_needed = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationship
    person = relationship("JourneyPerson", backref="reviews")

class JourneyGoal(Base):
    __tablename__ = "journey_goals"

    id = Column(Integer, primary_key=True, index=True)
    user_number = Column(String, index=True)

    title = Column(String(200), nullable=True)  # Short title for sidebar
    goal_text = Column(Text, nullable=False)  # Full description
    why = Column(Text, nullable=True)
    time_horizon = Column(String, nullable=True)  # short, medium, long
    parent_goal_id = Column(Integer, ForeignKey('journey_goals.id'), nullable=True)  # Hierarchical goals
    sort_order = Column(Integer, default=0, nullable=True)  # ← NEW FIELD FOR DRAG-AND-DROP ORDERING

    first_seen_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationship for parent/child goals
    children = relationship("JourneyGoal", backref="parent", remote_side=[id])


class VisionRoadmapWave(Base):
    __tablename__ = "vision_roadmap_waves"

    id = Column(Integer, primary_key=True, index=True)
    user_number = Column(String, index=True, nullable=False)
    vision_goal_id = Column(Integer, ForeignKey("journey_goals.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    sequence_order = Column(Integer, default=0, nullable=False)
    status = Column(String, default="not_started", nullable=False)
    target_start_date = Column(Date, nullable=True)
    target_end_date = Column(Date, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    vision = relationship("JourneyGoal", foreign_keys=[vision_goal_id])
    goals = relationship("WaveGoal", back_populates="wave", cascade="all, delete-orphan")


class WaveGoal(Base):
    __tablename__ = "wave_goals"

    id = Column(Integer, primary_key=True, index=True)
    wave_id = Column(Integer, ForeignKey("vision_roadmap_waves.id", ondelete="CASCADE"), nullable=False, index=True)
    goal_id = Column(Integer, ForeignKey("journey_goals.id", ondelete="CASCADE"), nullable=False, index=True)
    sequence_order = Column(Integer, default=0, nullable=False)
    status = Column(String, default="not_started", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    wave = relationship("VisionRoadmapWave", back_populates="goals")
    goal = relationship("JourneyGoal")


class VisionProgressReview(Base):
    __tablename__ = "vision_progress_reviews"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    user_number = Column(String, index=True, nullable=False)
    vision_id = Column(Integer, ForeignKey("journey_goals.id", ondelete="CASCADE"), nullable=False, index=True)
    review_period_start = Column(DateTime, nullable=False)
    review_period_end = Column(DateTime, nullable=False)
    status = Column(String, nullable=False)
    executive_summary = Column(Text, nullable=False)
    key_wins = Column(JSON, nullable=True)
    key_risks = Column(JSON, nullable=True)
    recommended_focus = Column(Text, nullable=True)
    mtn_actions = Column(JSON, nullable=True)
    health_scores = Column(JSON, nullable=True)
    raw_context = Column(JSON, nullable=True)
    raw_llm_response = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User")
    vision = relationship("JourneyGoal")


class JourneyFailure(Base):
    __tablename__ = "journey_failures"

    id = Column(Integer, primary_key=True, index=True)
    user_number = Column(String, index=True)

    title = Column(String(200), nullable=True)  # Optional title
    failure_text = Column(Text, nullable=False)
    scar = Column(Text, nullable=True)  # emotional residue
    learning = Column(Text, nullable=True)  # lesson learned

    first_seen_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class JourneyProject(Base):
    __tablename__ = "journey_projects"

    id = Column(Integer, primary_key=True, index=True)
    user_number = Column(String, index=True)

    project_name = Column(String, nullable=False)
    goal = Column(Text, nullable=True)  # strategic purpose of the project
    description = Column(Text, nullable=True)
    status = Column(String, default="active")  # active, paused, completed

    first_seen_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class JourneyStrength(Base):
    __tablename__ = "journey_strengths"

    id = Column(Integer, primary_key=True, index=True)
    user_number = Column(String, index=True)

    title = Column(String(200), nullable=True)  # Optional title
    strength = Column(Text, nullable=False)
    source = Column(String, nullable=True)  # inference, user input...

    first_seen_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class JourneyOpportunity(Base):
    __tablename__ = "journey_opportunities"

    id = Column(Integer, primary_key=True, index=True)
    user_number = Column(String, index=True)

    opportunity_text = Column(Text, nullable=False)
    category = Column(String, nullable=True)  # leadership, delegation, mindset…

    first_seen_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class JourneyDevelopmentArea(Base):
    __tablename__ = "journey_development_areas"

    id = Column(Integer, primary_key=True, index=True)
    user_number = Column(String, index=True)
    title = Column(String(200), nullable=True)  # Optional title
    skill = Column(String, nullable=False)
    source = Column(String, nullable=True)
    first_seen_at = Column(DateTime, default=datetime.utcnow, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=True)


class JourneyEnergySource(Base):
    """What gives the user energy - activities, people, environments"""
    __tablename__ = "journey_energy_sources"

    id = Column(Integer, primary_key=True, index=True)
    user_number = Column(String, index=True)
    title = Column(String(200), nullable=True)
    source_text = Column(Text, nullable=False)
    category = Column(String, nullable=True)  # physical, mental, social, creative, etc.
    first_seen_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class JourneyEnergyDrain(Base):
    """What depletes the user's energy - activities, situations, patterns"""
    __tablename__ = "journey_energy_drains"

    id = Column(Integer, primary_key=True, index=True)
    user_number = Column(String, index=True)
    title = Column(String(200), nullable=True)
    drain_text = Column(Text, nullable=False)
    category = Column(String, nullable=True)  # meetings, context-switching, conflict, etc.
    mitigation = Column(Text, nullable=True)  # strategies to reduce impact
    first_seen_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class JourneyRecoveryMethod(Base):
    """How the user recovers and recharges"""
    __tablename__ = "journey_recovery_methods"

    id = Column(Integer, primary_key=True, index=True)
    user_number = Column(String, index=True)
    title = Column(String(200), nullable=True)
    method_text = Column(Text, nullable=False)
    category = Column(String, nullable=True)  # exercise, rest, social, nature, etc.
    frequency = Column(String, nullable=True)  # daily, weekly, monthly
    first_seen_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class JourneyProcrastinationPattern(Base):
    """What the user procrastinates on and why"""
    __tablename__ = "journey_procrastination_patterns"

    id = Column(Integer, primary_key=True, index=True)
    user_number = Column(String, index=True)
    title = Column(String(200), nullable=True)
    pattern_text = Column(Text, nullable=False)
    trigger = Column(Text, nullable=True)
    mitigation = Column(Text, nullable=True)
    first_seen_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class JourneyExecutionSystem(Base):
    """User's systems and approaches for getting things done"""
    __tablename__ = "journey_execution_systems"

    id = Column(Integer, primary_key=True, index=True)
    user_number = Column(String, index=True)
    title = Column(String(200), nullable=True)
    system_text = Column(Text, nullable=False)
    category = Column(String, nullable=True)  # prioritization, planning, delegation, automation, etc.
    effectiveness = Column(String, nullable=True)  # working well, needs improvement, abandoned
    first_seen_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class JourneyInspiration(Base):
    """How the user inspires and motivates others"""
    __tablename__ = "journey_inspiration"

    id = Column(Integer, primary_key=True, index=True)
    user_number = Column(String, index=True)
    title = Column(String(200), nullable=True)
    inspiration_text = Column(Text, nullable=False)
    approach = Column(Text, nullable=True)  # storytelling, vision-setting, recognition, etc.
    effectiveness = Column(String, nullable=True)  # what works well
    first_seen_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class JourneyCoachingMoment(Base):
    """Coaching and delegation experiences"""
    __tablename__ = "journey_coaching_moments"

    id = Column(Integer, primary_key=True, index=True)
    user_number = Column(String, index=True)
    title = Column(String(200), nullable=True)
    moment_text = Column(Text, nullable=False)
    person = Column(String, nullable=True)  # who was coached/delegated to
    outcome = Column(Text, nullable=True)  # what happened
    learning = Column(Text, nullable=True)  # what was learned
    first_seen_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class JourneyTeamComposition(Base):
    """Insights about team structure and dynamics"""
    __tablename__ = "journey_team_composition"

    id = Column(Integer, primary_key=True, index=True)
    user_number = Column(String, index=True)
    title = Column(String(200), nullable=True)
    composition_text = Column(Text, nullable=False)
    team_type = Column(String, nullable=True)  # direct reports, cross-functional, board, etc.
    dynamics = Column(Text, nullable=True)  # what's working, what's not
    first_seen_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class JourneyBeltTrial(Base):
    """User-submitted leadership belt trials for Journey 2.0 progression."""
    __tablename__ = "journey_belt_trials"

    id = Column(Integer, primary_key=True, index=True)
    user_number = Column(String, index=True, nullable=False)
    dimension_id = Column(String, index=True, nullable=False)
    target_belt = Column(String, default="yellow", nullable=False)
    trial_type = Column(String, index=True, nullable=False)  # reflection, real_world, behavioral
    prompt = Column(Text, nullable=False)
    response_text = Column(Text, nullable=True)
    status = Column(String, default="not_started", nullable=False)
    ai_feedback = Column(Text, nullable=True)
    score = Column(Integer, nullable=True)
    evidence = Column(JSON, nullable=True)
    started_at = Column(DateTime, default=datetime.utcnow)
    submitted_at = Column(DateTime, nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class BeltAssessment(Base):
    """Alfred's developmental readiness assessment for belt promotion."""
    __tablename__ = "belt_assessments"

    id = Column(Integer, primary_key=True, index=True)
    user_number = Column(String, index=True, nullable=False)
    current_belt = Column(String, nullable=False)
    target_belt = Column(String, nullable=False)
    status = Column(String, default="submitted", nullable=False)
    readiness_score = Column(Integer, nullable=True)
    recommendation = Column(String, nullable=True)
    assessment_summary = Column(Text, nullable=True)
    dimension_scores = Column(JSONB, nullable=True)
    strengths = Column(JSONB, nullable=True)
    growth_edges = Column(JSONB, nullable=True)
    domain_feedback = Column(JSONB, nullable=True)
    subdomain_feedback = Column(JSONB, nullable=True)
    required_next_actions = Column(JSONB, nullable=True)
    leadership_profile = Column(JSONB, nullable=True)
    wheel_feedback = Column(JSONB, nullable=True)
    wheel_scores = Column(JSONB, nullable=True)
    promotion_limiters = Column(JSONB, nullable=True)
    strongest_areas = Column(JSONB, nullable=True)
    priority_next_actions = Column(JSONB, nullable=True)
    developmental_dimension_scores = Column(JSONB, nullable=True)
    journey_depth_scores = Column(JSONB, nullable=True)
    final_coaching_note = Column(Text, nullable=True)
    alfred_coaching_note = Column(Text, nullable=True)
    evidence_snapshot = Column(JSONB, nullable=True)
    llm_raw_response = Column(JSONB, nullable=True)
    accepted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ConversationState(Base):
    """
    Alfred's Brain - stores conversation state for intent-driven orchestration.
    Each user has ONE active conversation state.
    """
    __tablename__ = "conversation_state"

    id = Column(Integer, primary_key=True, index=True)
    user_number = Column(String, unique=True, index=True, nullable=False)

    # Core state machine fields
    current_state = Column(String, default="IDLE")  # e.g. IDLE, COACHING, CLARIFYING, EXECUTING
    active_intents = Column(JSONB, default=list)  # List of detected intents with confidence
    pending_action = Column(String, nullable=True)  # What Alfred is waiting to do
    pending_payload = Column(JSONB, nullable=True)  # Data for the pending action
    state_context = Column(JSONB, default=dict)  # Additional context for the current state

    # Timestamps
    last_transition_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)

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
# EXECUTIVE HABITS - UPDATED
# -------------------------------

class Habit(Base):
    __tablename__ = "habits"

    id = Column(Integer, primary_key=True, index=True)
    user_number = Column(String, index=True, nullable=False)
    title = Column(String, nullable=False)

    # 🔗 Link to journey goals
    goal_id = Column(
        Integer,
        ForeignKey("journey_goals.id", ondelete="SET NULL"),
        nullable=True
    )
    goal = relationship("JourneyGoal", backref="habits")

    # 🆕 NEW: Frequency field (daily or weekdays)
    frequency = Column(String, nullable=False, default="daily")

    is_active = Column(Boolean, default=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class HabitCompletion(Base):
    __tablename__ = "habit_completions"

    id = Column(Integer, primary_key=True, index=True)
    habit_id = Column(Integer, ForeignKey("habits.id", ondelete="CASCADE"))
    date = Column(Date, nullable=False)

    # 🆕 NEW: Status field (pending, done, not_done)
    status = Column(String, nullable=False, default="pending")

    created_at = Column(DateTime, default=datetime.utcnow)

    habit = relationship("Habit", backref="completions")


class HabitCoachingReview(Base):
    __tablename__ = "habit_coaching_reviews"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    user_number = Column(String, index=True, nullable=False)
    review_period_start = Column(DateTime, nullable=False)
    review_period_end = Column(DateTime, nullable=False)
    status = Column(String, nullable=False)
    executive_summary = Column(Text, nullable=False)
    what_changed = Column(Text, nullable=True)
    key_wins = Column(JSON, nullable=True)
    watchouts = Column(JSON, nullable=True)
    top_habits = Column(JSON, nullable=True)
    habits_needing_attention = Column(JSON, nullable=True)
    recommended_focus = Column(Text, nullable=True)
    mtn_actions = Column(JSON, nullable=True)
    raw_context = Column(JSON, nullable=True)
    raw_llm_response = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User")


class OnboardingStep(str, enum.Enum):
    """Onboarding flow steps"""
    INITIAL = "INITIAL"
    NAME = "NAME"
    PROFESSION = "PROFESSION"
    GOAL = "GOAL"
    GOAL_WHY = "GOAL_WHY"
    TASKS = "TASKS"
    QUICK_WIN = "QUICK_WIN"
    APP_LINK_SENT = "APP_LINK_SENT"
    TOUR_GOALS = "TOUR_GOALS"
    TOUR_TASKS = "TOUR_TASKS"
    TOUR_TEAM = "TOUR_TEAM"
    TOUR_JOURNEY = "TOUR_JOURNEY"
    TOUR_HABITS = "TOUR_HABITS"
    COMPLETED = "COMPLETED"


class SubscriptionStatus(str, enum.Enum):
    """User subscription status"""
    TRIAL = "TRIAL"
    ACTIVE = "ACTIVE"
    EXPIRED = "EXPIRED"
    CANCELLED = "CANCELLED"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Contact information
    phone_number = Column(String, unique=True, index=True)  # WhatsApp number
    email = Column(String, nullable=True, index=True)  # Email (added during onboarding or later)
    name = Column(String, nullable=True)  # Full name (collected in onboarding)
    profession = Column(String, nullable=True)  # Collected in onboarding

    # Authentication
    password_hash = Column(String, nullable=True)  # Hashed password
    temp_password = Column(String, nullable=True)  # One-time password for first login
    temp_password_expires = Column(DateTime, nullable=True)

    # Onboarding state
    onboarding_step = Column(SQLEnum(OnboardingStep), default=OnboardingStep.INITIAL)
    onboarding_completed = Column(Boolean, default=False)

    # ✅ FIXED: Use MutableDict to track JSONB mutations properly
    onboarding_data = Column(MutableDict.as_mutable(JSONB), nullable=True)  # Store intermediate data during onboarding

    # Subscription
    subscription_status = Column(SQLEnum(SubscriptionStatus), default=SubscriptionStatus.TRIAL)
    trial_start_date = Column(DateTime, nullable=True)
    trial_end_date = Column(DateTime, nullable=True)
    subscription_end_date = Column(DateTime, nullable=True)

    # Tour progress
    tour_completed = Column(Boolean, default=False)
    tour_current_step = Column(String, nullable=True)  # Current tour step
    language_preference = Column(String(10), default="en", nullable=False)

    # ✅ FIXED: Use MutableList to track JSONB list mutations properly
    tour_completed_steps = Column(MutableList.as_mutable(JSONB), nullable=True)  # List of completed steps

    # Timestamps
    last_active_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    entries = relationship("JournalEntry", back_populates="user", cascade="all, delete-orphan")

    def start_trial(self):
        """Initialize 21-day trial period"""
        self.trial_start_date = datetime.utcnow()
        self.trial_end_date = datetime.utcnow() + timedelta(days=21)
        self.subscription_status = SubscriptionStatus.TRIAL

    def generate_temp_password(self, length=8):
        """Generate a secure one-time password"""
        self.temp_password = secrets.token_urlsafe(length)[:length].upper()
        self.temp_password_expires = datetime.utcnow() + timedelta(hours=24)
        return self.temp_password

    def is_trial_active(self):
        """Check if trial is still valid"""
        if not self.trial_end_date:
            return False
        return datetime.utcnow() < self.trial_end_date

    def days_left_in_trial(self):
        """Calculate remaining trial days"""
        if not self.trial_end_date:
            return 0
        delta = self.trial_end_date - datetime.utcnow()
        return max(0, delta.days)


class EmailVerification(Base):
    """Track email verification codes sent via email"""
    __tablename__ = "email_verifications"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    verification_code = Column(String(6), nullable=False)  # 6-digit code
    verified = Column(Boolean, default=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)  # Code expires after 15 minutes
    verified_at = Column(DateTime, nullable=True)

    user = relationship("User")

    def is_valid(self):
        """Check if code is still valid"""
        return not self.verified and datetime.utcnow() < self.expires_at

    @staticmethod
    def generate_code():
        """Generate a 6-digit verification code"""
        return f"{secrets.randbelow(1000000):06d}"


# models.py
# Existing models omitted for brevity


class GoalReviewSession(Base):
    """
    Stores a distilled summary of a completed goal review coaching session.
    This is Alfred's internal coaching memory (not user-facing).
    """

    __tablename__ = "goal_review_sessions"

    id = Column(Integer, primary_key=True, index=True)

    user_number = Column(String, index=True, nullable=False)
    #    goal_id = Column(Integer, ForeignKey("goals.id"), nullable=False)
    goal_id = Column(Integer, ForeignKey("journey_goals.id"), nullable=False)

    goal_title = Column(String, nullable=False)

    session_started_at = Column(DateTime(timezone=True), nullable=False)
    session_ended_at = Column(DateTime(timezone=True), nullable=False)

    # Core coaching memory
    summary = Column(Text, nullable=False)
    key_progress = Column(Text)
    key_blockers = Column(Text)
    key_pattern = Column(Text)
    chosen_adjustment = Column(Text)

    # Optional structured signals (future-proofing)
    momentum_direction = Column(String)  # 'up', 'flat', 'down'
    confidence_level = Column(Integer)  # 1–5 if inferred later

    # Traceability
    created_tasks = Column(JSON)  # list of {task_id, title}
    prompt_version = Column(String)

    created_at = Column(DateTime(timezone=True), server_default=func.now())


# Priority System Database Models
# Add these to your existing app/models.py file


# Add these models to your existing models.py file

class TaskPrioritizationContext(Base):
    """
    Immutable snapshot of context at prioritization run time.

    Captures goals, task metrics, and temporal context to enable
    reproducible scoring and future ML training.
    """
    __tablename__ = "task_prioritization_context"

    id = Column(Integer, primary_key=True)
    user_number = Column(String, nullable=False, index=True)
    snapshot_at = Column(DateTime(timezone=True), nullable=False)

    # Goals snapshot by time horizon
    active_long_term_goals = Column(JSONB)  # List of {id, title, goal_text}
    active_short_term_goals = Column(JSONB)
    active_mid_term_goals = Column(JSONB)

    # Task metrics at snapshot time
    total_open_tasks = Column(Integer)
    tasks_in_top10 = Column(JSONB)  # Array of task IDs currently in Top 10
    tasks_with_due_dates = Column(Integer)
    overdue_tasks = Column(Integer)

    # Temporal context
    day_of_week = Column(String)  # "Monday", "Tuesday", etc.
    week_of_year = Column(Integer)  # 1-52

    # Optional user state
    self_reported_energy = Column(String)  # "high", "medium", "low", or NULL

    # Metadata
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class TaskPriorityScore(Base):
    """
    LLM scoring results for individual tasks.

    Stores the AI's assessment of whether each task belongs in Top 10,
    along with reasoning and metadata for learning.
    """
    __tablename__ = "task_priority_scores"

    id = Column(Integer, primary_key=True)
    context_id = Column(Integer, ForeignKey("task_prioritization_context.id", ondelete="CASCADE"), nullable=False)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    user_number = Column(String, nullable=False, index=True)

    # LLM scoring results
    top10_likelihood = Column(DECIMAL(3, 2), nullable=False)  # 0.00 to 1.00
    primary_reason = Column(Text, nullable=False)  # Why this score?
    risk_if_ignored = Column(Text)  # Cost of delay
    confidence = Column(String)  # "high", "medium", "low"

    # Raw LLM response for debugging
    raw_llm_response = Column(JSONB)

    # Metadata
    scored_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    llm_model = Column(String)  # e.g., "gpt-4o"
    llm_tokens_used = Column(Integer)


class TaskPriorityRecommendation(Base):
    """
    Generated recommendations based on LLM scores.

    Produces a diff-based recommendation (add/remove/keep) by comparing
    scored tasks with current Top 10.
    """
    __tablename__ = "task_priority_recommendations"

    id = Column(Integer, primary_key=True)
    context_id = Column(Integer, ForeignKey("task_prioritization_context.id", ondelete="CASCADE"), nullable=False)
    user_number = Column(String, nullable=False, index=True)

    # Recommendation details
    recommended_top10 = Column(JSONB, nullable=False)  # [{task_id, score, reason, position}, ...]
    changes_from_current = Column(JSONB, nullable=False)  # {add: [ids], remove: [ids], keep: [ids]}

    # Metadata
    generated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))



class TaskPriorityDecision(Base):
    """
    CRITICAL: Records user decisions on recommendations.

    Every accept/reject/replace decision is captured here for:
    - Understanding user preferences
    - Training future ML models
    - Iterating on LLM prompts
    - Building trust through transparency
    """
    __tablename__ = "task_priority_decisions"

    id = Column(Integer, primary_key=True)
    recommendation_id = Column(Integer, ForeignKey("task_priority_recommendations.id", ondelete="CASCADE"),
                               nullable=False)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    user_number = Column(String, nullable=False, index=True)

    # What Alfred recommended
    action_recommended = Column(String, nullable=False)  # "add", "remove", "keep", "unknown"
    llm_score = Column(DECIMAL(3, 2))
    llm_reason = Column(Text)

    # What user decided
    user_action = Column(String, nullable=False)  # "accept", "reject", "replace", "skip"
    user_reason = Column(Text)  # Optional: why they disagreed

    # Task state at decision time (for feature engineering)
    task_state_snapshot = Column(JSONB, nullable=False)  # {title, priority, due_date, etc.}

    # Metadata
    decided_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Add this to app/models.py

class LeadershipCoachingSession(Base):
    __tablename__ = "leadership_coaching_sessions"
    
    id = Column(Integer, primary_key=True, index=True)
    user_number = Column(String, index=True, nullable=False)
    
    # Session metadata
    session_date = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    completed_at = Column(DateTime(timezone=True), nullable=True)
    
    # Quadrant selection (which of the 5 areas of the wheel)
    quadrant = Column(String, nullable=False)  # "vision_goals", "people", "prioritize_execute", "learning_development", "time_energy"
    
    # The situation they brought to coaching
    situation = Column(Text, nullable=True)
    
    # Coaching conversation flow
    reflection = Column(Text, nullable=True)  # Their exploration of the situation
    pattern = Column(Text, nullable=True)  # Pattern Alfred identified
    underlying_belief = Column(Text, nullable=True)  # Core belief driving behavior
    experiment = Column(Text, nullable=True)  # Behavioral experiment designed
    
    # Assessment
    development_level = Column(Integer, nullable=True)  # 1-5 on this quadrant
    
    # Outcomes
    insights = Column(Text, nullable=True)  # Key insight from session
    practice = Column(Text, nullable=True)  # Specific practice/experiment to try
    
    # Journey connections (which facets of the wheel were touched)
    connected_facets = Column(JSON, nullable=True)  # e.g., ["Inspire", "Coach & Delegate"]
    journey_updates = Column(JSON, nullable=True)  # Track what got added to journey tables
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), onupdate=lambda: datetime.now(timezone.utc))


# Migration SQL to add the table
"""
CREATE TABLE leadership_coaching_sessions (
    id SERIAL PRIMARY KEY,
    user_number VARCHAR NOT NULL,
    session_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    quadrant VARCHAR NOT NULL,
    situation TEXT,
    reflection TEXT,
    pattern TEXT,
    underlying_belief TEXT,
    experiment TEXT,
    development_level INTEGER,
    insights TEXT,
    practice TEXT,
    connected_facets JSONB,
    journey_updates JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_leadership_sessions_user ON leadership_coaching_sessions(user_number);
CREATE INDEX idx_leadership_sessions_quadrant ON leadership_coaching_sessions(quadrant);
"""
