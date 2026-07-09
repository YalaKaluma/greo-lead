from fastapi import APIRouter, Depends, HTTPException
from fastapi.encoders import jsonable_encoder
from sqlalchemy import text
from sqlalchemy.orm import Session, selectinload
from app.db import get_db
from app.models import (
    JourneyGoal,
    JourneyStrength,
    JourneyDevelopmentArea,
    JourneyProject,
    JourneyPerson,
    JourneyFailure,
    JourneyOpportunity,
    JourneyValue,
    JourneyGoalValue,
    JourneyAchievement,
    JourneyEnergySource,
    JourneyEnergyDrain,
    JourneyRecoveryMethod,
    JourneyProcrastinationPattern,
    JourneyExecutionSystem,
    JourneyInspiration,
    JourneyCoachingMoment,
    JourneyTeamComposition,
    JourneyBeltTrial,
    BeltAssessment,
    RelationshipReview,
    VisionRoadmapWave,
    WaveGoal,
    Task,
    Habit,
    HabitCompletion,
    JournalEntry,
    MessageFeedback,
    LeadershipCoachingSession,
    User,
)
from pydantic import BaseModel, Field
from datetime import datetime, date
from typing import Optional, Any
from pathlib import Path
from types import SimpleNamespace
import hashlib
import logging
import yaml
import json
import uuid
from app.services.people_review_service import PeopleReviewService
from app.models import GoalReviewSession
from app.services.yellow_belt_validator import (
    BELT_DIMENSION_SIGNALS,
    validate_belt,
    validate_belt_dimension,
    validate_belt_trial_type,
    validate_yellow_belt,
    validate_yellow_belt_dimension,
    validate_yellow_belt_trial_type,
)
from app.services.vision_progress_review_service import VisionProgressReviewService
from app.services.belt_trial_reviewer import review_belt_trial
from app.services.onboarding_seed_service import (
    ensure_starter_examples_for_empty_user,
    ensure_starter_goal_samples_compacted,
    ensure_starter_roadmaps_seeded,
)
from app.services.audit_log_service import user_id_for_identifier, write_audit_log

logger = logging.getLogger(__name__)

STRUCTURAL_LEVEL_ALIASES = {
    "long": "vision",
    "long_term": "vision",
    "vision": "vision",
    "medium": "pillar",
    "medium_term": "pillar",
    "pillar": "pillar",
    "short": "outcome",
    "short_term": "outcome",
    "outcome": "outcome",
}

LEGACY_LEVEL_ALIASES = {
    "vision": "long",
    "pillar": "medium",
    "outcome": "short",
    "long": "long",
    "medium": "medium",
    "short": "short",
}

ROADMAP_STATUSES = {"not_started", "active", "completed"}
WAVE_GOAL_STATUSES = {"not_started", "done", "ongoing", "at_risk", "blocked"}
BELT_IDS = ["white", "yellow", "green", "brown", "black"]
ASSESSMENT_STATUS_VALUES = {"ready_for_promotion", "almost_ready", "not_ready", "needs_more_evidence", "submitted"}

JOURNEY_DIMENSIONS = {
    "vision": {
        "name": "Vision",
        "topics": [
            {"id": "values", "label": "Values", "endpoint": "values", "primary_field": "value_text", "requires_title": True},
            {"id": "strengths", "label": "Strengths", "endpoint": "strengths", "primary_field": "strength", "requires_title": True},
            {"id": "vision", "label": "Vision", "endpoint": "goals", "primary_field": "goal_text", "filter": "vision"},
        ],
    },
    "people": {
        "name": "People",
        "topics": [
            {"id": "team_composition", "label": "Team Composition", "endpoint": "people", "primary_field": "name"},
            {"id": "inspiration", "label": "Inspire", "endpoint": "inspiration", "primary_field": "inspiration_text"},
            {"id": "coaching_moments", "label": "Coach & Delegate", "endpoint": "coaching-moments", "primary_field": "moment_text"},
        ],
    },
    "execute": {
        "name": "Prioritize & Execute",
        "topics": [
            {"id": "prioritization", "label": "Prioritization", "endpoint": "execution-systems", "primary_field": "system_text", "filter": "prioritization"},
            {"id": "execution_system", "label": "Execution System", "endpoint": "execution-systems", "primary_field": "system_text", "filter": "execution_system"},
            {"id": "procrastination", "label": "Procrastination", "endpoint": "procrastination-patterns", "primary_field": "pattern_text"},
        ],
    },
    "energy": {
        "name": "Time & Energy",
        "topics": [
            {"id": "energy_sources", "label": "Energy Sources", "endpoint": "energy-sources", "primary_field": "source_text", "requires_title": True},
            {"id": "energy_drains", "label": "Energy Drains", "endpoint": "energy-drains", "primary_field": "drain_text", "requires_title": True},
            {"id": "recovery", "label": "Recovery", "endpoint": "recovery-methods", "primary_field": "method_text"},
        ],
    },
    "learning": {
        "name": "Learning & Development",
        "topics": [
            {"id": "failures", "label": "Failures & Scars", "endpoint": "failures", "primary_field": "failure_text", "requires_title": True},
            {"id": "development_opportunities", "label": "Development Opportunities", "endpoint": "development-areas", "primary_field": "skill", "requires_title": True},
            {"id": "development_plan", "label": "Development Plan", "endpoint": "opportunities", "primary_field": "opportunity_text"},
        ],
    },
}


def normalize_goal_level(value: Optional[str], default: str = "pillar") -> str:
    return STRUCTURAL_LEVEL_ALIASES.get((value or default).strip().lower(), default)


def goal_level_variants(value: Optional[str]) -> list[str]:
    normalized = normalize_goal_level(value)
    legacy = LEGACY_LEVEL_ALIASES[normalized]
    return list({normalized, legacy})


def serialize_goal(goal: JourneyGoal) -> dict[str, Any]:
    value_links = sorted(
        getattr(goal, "value_links", []) or [],
        key=lambda link: ((link.value.title if link.value else "") or "").lower(),
    )
    return {
        "id": goal.id,
        "user_number": goal.user_number,
        "title": goal.title,
        "goal_text": goal.goal_text,
        "why": goal.why,
        "time_horizon": normalize_goal_level(goal.time_horizon),
        "legacy_time_horizon": LEGACY_LEVEL_ALIASES[normalize_goal_level(goal.time_horizon)],
        "parent_goal_id": goal.parent_goal_id,
        "sort_order": goal.sort_order,
        "value_ids": [link.value_id for link in value_links],
        "linked_values": [
            {
                "id": link.value.id,
                "title": link.value.title,
                "value_text": link.value.value_text,
                "why": link.value.why,
            }
            for link in value_links
            if link.value
        ],
        "first_seen_at": goal.first_seen_at,
        "updated_at": goal.updated_at,
    }

# Pydantic request models for Goals
class GoalCreate(BaseModel):
    title: Optional[str] = None
    goal_text: str
    why: Optional[str] = None
    time_horizon: Optional[str] = "pillar"
    parent_goal_id: Optional[int] = None
    sort_order: Optional[int] = None
    value_ids: Optional[list[int]] = None


class GoalUpdate(BaseModel):
    title: Optional[str] = None
    goal_text: Optional[str] = None
    why: Optional[str] = None
    time_horizon: Optional[str] = None
    parent_goal_id: Optional[int] = None
    sort_order: Optional[int] = None
    value_ids: Optional[list[int]] = None


class GoalReorderRequest(BaseModel):
    parent_id: Optional[int] = None
    parent_goal_id: Optional[int] = None
    goal_type: str
    ordered_goal_ids: list[int]


# Pydantic request models for People
class PersonCreate(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    relation: Optional[str] = None
    context: Optional[str] = None
    mission_statement: Optional[str] = None
    strengths: Optional[str] = None
    growth_areas: Optional[str] = None
    aspirations: Optional[str] = None
    meeting_notes: Optional[list[dict[str, Any]]] = None
    organization: Optional[str] = None
    team: Optional[str] = None
    manager_name: Optional[str] = None
    circle_type: Optional[str] = None
    strategic_importance: Optional[str] = None
    last_interaction_at: Optional[datetime] = None
    next_action: Optional[str] = None
    current_goals: Optional[str] = None
    development_plan: Optional[str] = None
    stretch_assignments: Optional[str] = None
    coaching_focus: Optional[str] = None
    performance_indicator: Optional[str] = None
    potential_indicator: Optional[str] = None
    stakeholder_mission: Optional[str] = None
    stakeholder_priorities: Optional[str] = None
    success_metrics: Optional[str] = None
    stakeholder_strengths: Optional[str] = None
    risks_or_pressures: Optional[str] = None
    stakeholder_aspirations: Optional[str] = None
    how_i_create_value: Optional[str] = None
    mission_alignment: Optional[str] = None
    potential_tensions: Optional[str] = None
    relationship_strategy: Optional[str] = None


class PersonUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    relation: Optional[str] = None
    context: Optional[str] = None
    mission_statement: Optional[str] = None
    strengths: Optional[str] = None
    growth_areas: Optional[str] = None
    aspirations: Optional[str] = None
    meeting_notes: Optional[list[dict[str, Any]]] = None
    organization: Optional[str] = None
    team: Optional[str] = None
    manager_name: Optional[str] = None
    circle_type: Optional[str] = None
    relationship_health: Optional[int] = None
    strategic_importance: Optional[str] = None
    last_interaction_at: Optional[datetime] = None
    next_action: Optional[str] = None
    current_goals: Optional[str] = None
    development_plan: Optional[str] = None
    stretch_assignments: Optional[str] = None
    coaching_focus: Optional[str] = None
    performance_indicator: Optional[str] = None
    potential_indicator: Optional[str] = None
    stakeholder_mission: Optional[str] = None
    stakeholder_priorities: Optional[str] = None
    success_metrics: Optional[str] = None
    stakeholder_strengths: Optional[str] = None
    risks_or_pressures: Optional[str] = None
    stakeholder_aspirations: Optional[str] = None
    how_i_create_value: Optional[str] = None
    mission_alignment: Optional[str] = None
    potential_tensions: Optional[str] = None
    relationship_strategy: Optional[str] = None




def load_journey_trials_config():
    config_path = Path(__file__).parent.parent / "journey_trials.yaml"

    try:
        with open(config_path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    except FileNotFoundError:
        return {
            "version": 0,
            "yellow_belt": {
                "meaning": "Understanding",
                "description": "Move from awareness into a clearer understanding of your patterns.",
                "dimensions": {}
            }
        }


def load_journey_subdomain_prompts_config():
    config_path = Path(__file__).parent.parent / "journey_subdomain_prompts.yaml"

    try:
        with open(config_path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    except FileNotFoundError:
        return {"version": 0, "subdomains": {}}


def load_belt_assessment_prompt():
    config_path = Path(__file__).parent.parent / "prompts" / "journey" / "belt_assessment.yaml"

    try:
        with open(config_path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    except FileNotFoundError:
        return {
            "system": "You are Alfred. Return valid JSON assessing belt readiness.",
            "user_template": "Assess readiness from this evidence: {evidence_json}",
        }


def get_next_belt_id(current_belt: str) -> str:
    current_index = max(0, BELT_IDS.index(current_belt)) if current_belt in BELT_IDS else 0
    return BELT_IDS[min(current_index + 1, len(BELT_IDS) - 1)]


def get_user_identifiers(db: Session, user_number: str) -> list[str]:
    identifiers = {str(user_number or "").strip()}
    identifiers.discard("")

    user = db.query(User).filter(
        (User.phone_number == user_number) | (User.email == user_number)
    ).first()
    if user:
        identifiers.update(
            value.strip()
            for value in [user.phone_number, user.email]
            if value and value.strip()
        )

    return list(identifiers)


def normalize_trial_status(status: Optional[str]) -> str:
    return (status or "not_started").strip().lower()


def is_requirement_complete(status: Optional[str]) -> bool:
    return normalize_trial_status(status) == "passed"


def get_trial_requirement(config: dict, dimension_id: str, belt_id: str, trial_type: str) -> dict:
    return config.get("dimensions", {}).get(dimension_id, {}).get("belts", {}).get(belt_id, {}).get(trial_type, {}) or {}


def get_belt_requirement(config: dict, dimension_id: str, belt_id: str) -> dict:
    return config.get("dimensions", {}).get(dimension_id, {}).get("belts", {}).get(belt_id, {}) or {}


def append_trial_feedback_history(trial: JourneyBeltTrial, review: dict[str, Any], response_text: str) -> dict[str, Any]:
    evidence = dict(trial.evidence or {})
    history = evidence.get("feedback_history")
    if not isinstance(history, list):
        history = []

    history.append({
        "reviewed_at": datetime.now().isoformat(),
        "attempt_number": review.get("attempt_number") or len(history) + 1,
        "status": "passed" if review.get("passed") else "needs_revision",
        "score": review.get("score"),
        "response_text": response_text,
        "feedback": review.get("feedback"),
        "strengths": review.get("strengths") or [],
        "growth_edges": review.get("growth_edges") or [],
        "required_improvements": review.get("required_improvements") or [],
        "review_source": review.get("review_source") or "ai",
    })

    evidence["feedback_history"] = history[-10:]
    evidence["latest_review"] = review
    return evidence


def response_fingerprint(response_text: Optional[str]) -> str:
    return hashlib.sha256((response_text or "").encode("utf-8")).hexdigest()[:12]


def apply_trial_review(db: Session, trial: JourneyBeltTrial, config: dict, trace_id: Optional[str] = None) -> JourneyBeltTrial:
    dimension = JOURNEY_DIMENSIONS.get(trial.dimension_id, {})
    belt_requirement = get_belt_requirement(config, trial.dimension_id, trial.target_belt)
    requirement = get_trial_requirement(config, trial.dimension_id, trial.target_belt, trial.trial_type)
    evidence = dict(trial.evidence or {})
    history = evidence.get("feedback_history") if isinstance(evidence.get("feedback_history"), list) else []
    attempt_number = len(history) + 1
    response_text = trial.response_text or ""
    logger.info(
        "[belt_trial_review:%s] start trial_id=%s user=%s dimension=%s belt=%s type=%s attempt=%s response_len=%s response_hash=%s prior_status=%s prior_score=%s prior_reviewed_at=%s",
        trace_id or "no-trace",
        trial.id,
        trial.user_number,
        trial.dimension_id,
        trial.target_belt,
        trial.trial_type,
        attempt_number,
        len(response_text),
        response_fingerprint(response_text),
        trial.status,
        trial.score,
        trial.reviewed_at,
    )
    review = review_belt_trial(
        domain_name=dimension.get("name", trial.dimension_id.title()),
        target_belt=trial.target_belt,
        trial_type=trial.trial_type,
        trial_title=requirement.get("title") or trial.trial_type.replace("_", " ").title(),
        belt_objective=requirement.get("criteria") or belt_requirement.get("criteria") or requirement.get("completion_hint"),
        prompt=trial.prompt,
        response_text=response_text,
        attempt_number=attempt_number,
        trace_id=trace_id,
    )
    trial.status = "passed" if review.get("passed") else "needs_revision"
    trial.score = review.get("score")
    trial.ai_feedback = review.get("feedback")
    trial.evidence = append_trial_feedback_history(trial, review, trial.response_text or "")
    trial.reviewed_at = datetime.now()
    trial.updated_at = datetime.now()
    db.add(trial)
    logger.info(
        "[belt_trial_review:%s] complete trial_id=%s attempt=%s status=%s score=%s source=%s feedback_len=%s history_count=%s",
        trace_id or "no-trace",
        trial.id,
        attempt_number,
        trial.status,
        trial.score,
        review.get("review_source"),
        len(trial.ai_feedback or ""),
        len((trial.evidence or {}).get("feedback_history") or []),
    )
    return trial


def active_trial_types_for_dimension(config: dict, dimension_id: str, belt_id: str) -> list[str]:
    requirements = config.get("dimensions", {}).get(dimension_id, {}).get("belts", {}).get(belt_id, {})
    trial_types = []
    for trial_type in ["reflection", "real_world", "behavioral"]:
        requirement = requirements.get(trial_type)
        if requirement is None:
            continue
        if requirement.get("active") is False:
            continue
        trial_types.append((trial_type, requirement.get("display_order", len(trial_types) + 1)))
    return [
        trial_type
        for trial_type, _display_order in sorted(
            trial_types,
            key=lambda item: (item[1] if isinstance(item[1], int) else 999, item[0]),
        )
    ]


def get_topic_items_for_evidence(db: Session, user_number: str, topic: dict) -> list[Any]:
    endpoint = topic.get("endpoint")

    if endpoint == "values":
        return db.query(JourneyValue).filter(JourneyValue.user_number == user_number).all()
    if endpoint == "strengths":
        return db.query(JourneyStrength).filter(JourneyStrength.user_number == user_number).all()
    if endpoint == "goals":
        goals = db.query(JourneyGoal).filter(JourneyGoal.user_number == user_number).all()
        if topic.get("filter") == "vision":
            return [goal for goal in goals if normalize_goal_level(goal.time_horizon) == "vision"]
        return goals
    if endpoint == "people":
        return db.query(JourneyPerson).filter(JourneyPerson.user_number == user_number).all()
    if endpoint == "inspiration":
        return db.query(JourneyInspiration).filter(JourneyInspiration.user_number == user_number).all()
    if endpoint == "coaching-moments":
        return db.query(JourneyCoachingMoment).filter(JourneyCoachingMoment.user_number == user_number).all()
    if endpoint == "execution-systems":
        systems = db.query(JourneyExecutionSystem).filter(JourneyExecutionSystem.user_number == user_number).all()
        if topic.get("filter") == "prioritization":
            return [system for system in systems if (system.category or "").strip().lower() == "prioritization"]
        if topic.get("filter") == "execution_system":
            return [system for system in systems if (system.category or "").strip().lower() != "prioritization"]
        return systems
    if endpoint == "procrastination-patterns":
        return [SimpleNamespace(**pattern) for pattern in get_procrastination_pattern_rows(db, user_number)]
    if endpoint == "energy-sources":
        return db.query(JourneyEnergySource).filter(JourneyEnergySource.user_number == user_number).all()
    if endpoint == "energy-drains":
        return db.query(JourneyEnergyDrain).filter(JourneyEnergyDrain.user_number == user_number).all()
    if endpoint == "recovery-methods":
        return db.query(JourneyRecoveryMethod).filter(JourneyRecoveryMethod.user_number == user_number).all()
    if endpoint == "failures":
        return db.query(JourneyFailure).filter(JourneyFailure.user_number == user_number).all()
    if endpoint == "development-areas":
        return db.query(JourneyDevelopmentArea).filter(JourneyDevelopmentArea.user_number == user_number).all()
    if endpoint == "opportunities":
        return db.query(JourneyOpportunity).filter(JourneyOpportunity.user_number == user_number).all()

    return []


def has_text(value: Any) -> bool:
    return bool(str(value or "").strip())


def topic_has_filled_evidence(db: Session, user_number: str, topic: dict) -> bool:
    items = get_topic_items_for_evidence(db, user_number, topic)
    primary_field = topic.get("primary_field")

    for item in items:
        if topic.get("id") == "team_composition":
            if has_text(getattr(item, "name", None)) and (
                has_text(getattr(item, "relation", None)) or has_text(getattr(item, "context", None))
            ):
                return True
            continue

        has_primary = has_text(getattr(item, primary_field, None)) if primary_field else False
        has_title = has_text(getattr(item, "title", None)) if topic.get("requires_title") else True
        if has_primary and has_title:
            return True

    return False


def get_behavioral_trial_status(db: Session, user_number: str, dimension_id: str, belt_id: str) -> str:
    stored = db.query(JourneyBeltTrial).filter(
        JourneyBeltTrial.user_number == user_number,
        JourneyBeltTrial.dimension_id == dimension_id,
        JourneyBeltTrial.target_belt == belt_id,
        JourneyBeltTrial.trial_type == "behavioral",
    ).first()
    if stored and stored.status and belt_id not in BELT_DIMENSION_SIGNALS:
        return normalize_trial_status(stored.status)

    if belt_id == "white":
        dimension = JOURNEY_DIMENSIONS.get(dimension_id, {})
        topics = dimension.get("topics", [])
        if not topics:
            return "not_started"
        completed = sum(1 for topic in topics if topic_has_filled_evidence(db, user_number, topic))
        if completed == len(topics):
            return "passed"
        if completed > 0:
            return "in_progress"

    if belt_id in BELT_DIMENSION_SIGNALS:
        result = validate_belt_trial_type(db, user_number, belt_id, dimension_id, "behavioral")
        if result["passed"]:
            return "passed"
        if any(signal["actual"] > 0 for signal in result["signals"]):
            return "in_progress"
        if stored and stored.status:
            return normalize_trial_status(stored.status)

    return "not_started"


def get_observable_real_world_trial_status(db: Session, user_number: str, dimension_id: str, belt_id: str) -> Optional[str]:
    if belt_id == "yellow":
        result = validate_yellow_belt_trial_type(db, user_number, dimension_id, "real_world")
    else:
        result = validate_belt_trial_type(db, user_number, belt_id, dimension_id, "real_world")
    if not result["signals"]:
        return None
    if result["passed"]:
        return "passed"
    if any(signal["actual"] > 0 for signal in result["signals"]):
        return "in_progress"
    return None


def get_belt_completion_for_dimension(db: Session, user_number: str, config: dict, dimension_id: str, belt_id: str) -> dict:
    active_trial_types = active_trial_types_for_dimension(config, dimension_id, belt_id)
    missing = []
    completed = 0

    for trial_type in active_trial_types:
        requirement = config.get("dimensions", {}).get(dimension_id, {}).get("belts", {}).get(belt_id, {}).get(trial_type, {})
        status = get_behavioral_trial_status(db, user_number, dimension_id, belt_id) if trial_type == "behavioral" else None
        trial = None
        if trial_type == "real_world":
            status = get_observable_real_world_trial_status(db, user_number, dimension_id, belt_id)

        if trial_type != "behavioral" and status is None:
            trial = db.query(JourneyBeltTrial).filter(
                JourneyBeltTrial.user_number == user_number,
                JourneyBeltTrial.dimension_id == dimension_id,
                JourneyBeltTrial.target_belt == belt_id,
                JourneyBeltTrial.trial_type == trial_type,
            ).first()
            status = normalize_trial_status(trial.status if trial else None)

        if is_requirement_complete(status):
            completed += 1
        else:
            missing.append({
                "domain": JOURNEY_DIMENSIONS.get(dimension_id, {}).get("name", dimension_id.title()),
                "dimension_id": dimension_id,
                "trial_type": trial_type,
                "trial_title": requirement.get("title") or trial_type.replace("_", " ").title(),
                "status": status,
            })

    return {
        "completed": completed,
        "required": len(active_trial_types),
        "missing": missing,
        "is_complete": completed == len(active_trial_types),
    }


def get_current_belt_status(db: Session, user_number: str, config: dict) -> dict:
    user_identifiers = get_user_identifiers(db, user_number)
    accepted_assessment = db.query(BeltAssessment).filter(
        BeltAssessment.user_number.in_(user_identifiers),
        BeltAssessment.accepted_at.isnot(None),
    ).order_by(BeltAssessment.accepted_at.desc()).first()
    current_belt = accepted_assessment.target_belt if accepted_assessment else "white"
    target_belt = get_next_belt_id(current_belt)

    if current_belt == "black":
        return {
            "current_belt": "black",
            "target_belt": "black",
            "completed_trials": 0,
            "required_trials": 0,
            "missing_trials": [],
            "is_eligible_to_submit": False,
        }

    totals = {"completed": 0, "required": 0, "missing": []}
    for dimension_id in JOURNEY_DIMENSIONS.keys():
        progress = get_belt_completion_for_dimension(db, user_number, config, dimension_id, current_belt)
        totals["completed"] += progress["completed"]
        totals["required"] += progress["required"]
        totals["missing"].extend(progress["missing"])

    logger.info(
        "[belt_readiness_status] user_number=%s identifiers=%s accepted_assessment_id=%s accepted_current=%s accepted_target=%s accepted_at=%s current_belt=%s target_belt=%s completed=%s required=%s missing_count=%s missing_sample=%s",
        user_number,
        user_identifiers,
        accepted_assessment.id if accepted_assessment else None,
        accepted_assessment.current_belt if accepted_assessment else None,
        accepted_assessment.target_belt if accepted_assessment else None,
        accepted_assessment.accepted_at.isoformat() if accepted_assessment and accepted_assessment.accepted_at else None,
        current_belt,
        target_belt,
        totals["completed"],
        totals["required"],
        len(totals["missing"]),
        totals["missing"][:5],
    )

    return {
        "current_belt": current_belt,
        "target_belt": target_belt,
        "completed_trials": totals["completed"],
        "required_trials": totals["required"],
        "missing_trials": totals["missing"],
        "is_eligible_to_submit": totals["required"] > 0 and totals["completed"] == totals["required"],
    }


def get_auto_progress_belt_status(db: Session, user_number: str, config: dict) -> dict:
    for belt_id in BELT_IDS:
        totals = {"completed": 0, "required": 0, "missing": []}
        for dimension_id in JOURNEY_DIMENSIONS.keys():
            progress = get_belt_completion_for_dimension(db, user_number, config, dimension_id, belt_id)
            totals["completed"] += progress["completed"]
            totals["required"] += progress["required"]
            totals["missing"].extend(progress["missing"])
        if totals["completed"] < totals["required"]:
            return {
                "current_belt": belt_id,
                "target_belt": get_next_belt_id(belt_id),
                "completed_trials": totals["completed"],
                "required_trials": totals["required"],
                "missing_trials": totals["missing"],
                "is_eligible_to_submit": False,
            }
    return {
        "current_belt": "black",
        "target_belt": "black",
        "completed_trials": 0,
        "required_trials": 0,
        "missing_trials": [],
        "is_eligible_to_submit": False,
    }


def serialize_items(items: list[Any], limit: int = 20) -> list[dict[str, Any]]:
    return jsonable_encoder(items[:limit])


def build_goal_children(goal: JourneyGoal, goals_by_parent: dict[Optional[int], list[JourneyGoal]]) -> dict[str, Any]:
    children = sorted(
        goals_by_parent.get(goal.id, []),
        key=lambda item: (item.sort_order or 0, item.updated_at or datetime.min),
    )
    serialized = serialize_goal(goal)
    serialized["children"] = [
        build_goal_children(child, goals_by_parent)
        for child in children
    ]
    return serialized


def serialize_vision_tree_for_assessment(db: Session, user_number: str) -> list[dict[str, Any]]:
    goals = db.query(JourneyGoal).filter(JourneyGoal.user_number == user_number).all()
    goals_by_parent: dict[Optional[int], list[JourneyGoal]] = {}
    for goal in goals:
        goals_by_parent.setdefault(goal.parent_goal_id, []).append(goal)

    visions = sorted(
        [goal for goal in goals if normalize_goal_level(goal.time_horizon) == "vision"],
        key=lambda item: (item.sort_order or 0, item.updated_at or datetime.min),
    )
    waves = db.query(VisionRoadmapWave).filter(
        VisionRoadmapWave.user_number == user_number,
    ).order_by(VisionRoadmapWave.sequence_order, VisionRoadmapWave.created_at).all()
    waves_by_vision: dict[int, list[VisionRoadmapWave]] = {}
    for wave in waves:
        waves_by_vision.setdefault(wave.vision_goal_id, []).append(wave)

    vision_trees = []
    for vision in visions:
        tree = build_goal_children(vision, goals_by_parent)
        tree["roadmap_waves"] = [
            serialize_wave(wave)
            for wave in waves_by_vision.get(vision.id, [])
        ]
        vision_trees.append(tree)
    return vision_trees



from app.services.journey_assessment_support import *
# Journey router response models and shared route helpers
class StrengthResponse(BaseModel):
    id: int
    user_number: str
    title: Optional[str]
    strength: str
    source: Optional[str]
    first_seen_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DevelopmentAreaResponse(BaseModel):
    id: int
    user_number: str
    title: Optional[str]
    skill: str
    source: Optional[str]

    class Config:
        from_attributes = True


class ProjectResponse(BaseModel):
    id: int
    user_number: str
    project_name: str
    goal: Optional[str]
    description: Optional[str]
    status: str
    first_seen_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PersonResponse(BaseModel):
    id: int
    user_number: str
    name: str
    email: Optional[str]
    phone: Optional[str]
    relation: Optional[str]
    context: Optional[str]
    mission_statement: Optional[str]
    strengths: Optional[str]
    growth_areas: Optional[str]
    aspirations: Optional[str]
    meeting_notes: Optional[list[dict[str, Any]]] = None
    organization: Optional[str] = None
    team: Optional[str] = None
    manager_name: Optional[str] = None
    circle_type: Optional[str] = None
    relationship_health: Optional[int] = None
    strategic_importance: Optional[str] = None
    last_interaction_at: Optional[datetime] = None
    next_action: Optional[str] = None
    current_goals: Optional[str] = None
    development_plan: Optional[str] = None
    stretch_assignments: Optional[str] = None
    coaching_focus: Optional[str] = None
    performance_indicator: Optional[str] = None
    potential_indicator: Optional[str] = None
    stakeholder_mission: Optional[str] = None
    stakeholder_priorities: Optional[str] = None
    success_metrics: Optional[str] = None
    stakeholder_strengths: Optional[str] = None
    risks_or_pressures: Optional[str] = None
    stakeholder_aspirations: Optional[str] = None
    how_i_create_value: Optional[str] = None
    mission_alignment: Optional[str] = None
    potential_tensions: Optional[str] = None
    relationship_strategy: Optional[str] = None
    first_seen_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class FailureResponse(BaseModel):
    id: int
    user_number: str
    title: Optional[str]
    failure_text: str
    learning: Optional[str]
    scar: Optional[str]
    first_seen_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class OpportunityResponse(BaseModel):
    id: int
    user_number: str
    opportunity_text: str
    category: Optional[str]
    first_seen_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class GoalResponse(BaseModel):
    id: int
    user_number: str
    title: Optional[str]
    goal_text: str
    why: Optional[str]
    time_horizon: Optional[str]
    parent_goal_id: Optional[int]
    sort_order: Optional[int]
    value_ids: list[int] = Field(default_factory=list)
    linked_values: list[dict[str, Any]] = Field(default_factory=list)
    first_seen_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class WaveCreate(BaseModel):
    title: str
    description: Optional[str] = None
    status: Optional[str] = "not_started"
    target_start_date: Optional[date] = None
    target_end_date: Optional[date] = None
    sequence_order: Optional[int] = None


class WaveUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    target_start_date: Optional[date] = None
    target_end_date: Optional[date] = None
    sequence_order: Optional[int] = None


class WaveGoalCreate(BaseModel):
    goal_id: int
    sequence_order: Optional[int] = None
    status: Optional[str] = "not_started"


class WaveGoalUpdate(BaseModel):
    status: Optional[str] = None


class WaveReorderRequest(BaseModel):
    ordered_wave_ids: list[int]


class WaveGoalReorderRequest(BaseModel):
    ordered_goal_ids: list[int]


class RoadmapDraftRequest(BaseModel):
    include_new_goal_suggestions: Optional[bool] = True


def validate_wave_status(status: Optional[str]) -> str:
    normalized = (status or "not_started").strip().lower()
    if normalized not in ROADMAP_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid wave status")
    return normalized


def validate_wave_goal_status(status: Optional[str]) -> str:
    normalized = (status or "not_started").strip().lower()
    if normalized not in WAVE_GOAL_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid outcome status")
    return normalized


def serialize_wave(wave: VisionRoadmapWave) -> dict[str, Any]:
    wave_goals = sorted(wave.goals or [], key=lambda item: (item.sequence_order or 0, item.created_at or datetime.min))
    return {
        "id": wave.id,
        "user_number": wave.user_number,
        "vision_goal_id": wave.vision_goal_id,
        "title": wave.title,
        "description": wave.description,
        "sequence_order": wave.sequence_order,
        "status": wave.status,
        "target_start_date": wave.target_start_date.isoformat() if wave.target_start_date else None,
        "target_end_date": wave.target_end_date.isoformat() if wave.target_end_date else None,
        "created_at": wave.created_at.isoformat() if wave.created_at else None,
        "updated_at": wave.updated_at.isoformat() if wave.updated_at else None,
        "goals": [
            {
                "id": item.id,
                "wave_id": item.wave_id,
                "goal_id": item.goal_id,
                "sequence_order": item.sequence_order,
                "status": item.status or "not_started",
                "goal": serialize_goal(item.goal) if item.goal else None,
            }
            for item in wave_goals
        ],
    }


def get_user_goal_or_404(db: Session, goal_id: int, user_number: str) -> JourneyGoal:
    goal = db.query(JourneyGoal).filter(
        JourneyGoal.id == goal_id,
        JourneyGoal.user_number == user_number,
    ).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    return goal


def sync_goal_values(db: Session, goal: JourneyGoal, user_number: str, value_ids: Optional[list[int]]) -> None:
    if value_ids is None:
        return

    normalized_ids = []
    for value_id in value_ids:
        try:
            normalized_id = int(value_id)
        except (TypeError, ValueError):
            continue
        if normalized_id not in normalized_ids:
            normalized_ids.append(normalized_id)

    allowed_ids = set()
    if normalized_ids:
        allowed_ids = {
            value.id
            for value in db.query(JourneyValue).filter(
                JourneyValue.user_number == user_number,
                JourneyValue.id.in_(normalized_ids),
            ).all()
        }

    existing_links = db.query(JourneyGoalValue).filter(
        JourneyGoalValue.goal_id == goal.id,
        JourneyGoalValue.user_number == user_number,
    ).all()
    existing_by_value_id = {link.value_id: link for link in existing_links}

    for link in existing_links:
        if link.value_id not in allowed_ids:
            db.delete(link)

    for value_id in normalized_ids:
        if value_id in allowed_ids and value_id not in existing_by_value_id:
            db.add(JourneyGoalValue(user_number=user_number, goal_id=goal.id, value_id=value_id))

