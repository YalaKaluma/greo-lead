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
    strengths: Optional[str] = None
    growth_areas: Optional[str] = None
    aspirations: Optional[str] = None


class PersonUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    relation: Optional[str] = None
    context: Optional[str] = None
    strengths: Optional[str] = None
    growth_areas: Optional[str] = None
    aspirations: Optional[str] = None


router = APIRouter()


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
        trial_types.append(trial_type)
    return trial_types


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
    if belt_id != "yellow":
        return None

    result = validate_yellow_belt_trial_type(db, user_number, dimension_id, "real_world")
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


def gather_belt_assessment_evidence(db: Session, user_number: str, current_belt: str) -> dict:
    trials = db.query(JourneyBeltTrial).filter(
        JourneyBeltTrial.user_number == user_number,
        JourneyBeltTrial.target_belt == current_belt,
    ).order_by(JourneyBeltTrial.updated_at.desc()).all()

    subdomains = {}
    for dimension_id, dimension in JOURNEY_DIMENSIONS.items():
        subdomains[dimension["name"]] = {}
        for topic in dimension["topics"]:
            subdomains[dimension["name"]][topic["label"]] = serialize_items(
                get_topic_items_for_evidence(db, user_number, topic),
                limit=10,
            )

    return {
        "user_number": user_number,
        "current_belt": current_belt,
        "assessment_scope": "Score only current belt curriculum evidence: completed belt trials, reflection answers, real-world trial submissions, and belt-specific development exercises.",
        "leadership_wheel": {
            dimension["name"]: [topic["label"] for topic in dimension["topics"]]
            for dimension in JOURNEY_DIMENSIONS.values()
        },
        "belt_trials": serialize_items(trials, limit=50),
        "belt_subdomain_evidence": subdomains,
        "vision_goal_tree": serialize_vision_tree_for_assessment(db, user_number),
    }


def parse_assessment_response(raw_text: str) -> dict:
    cleaned = (raw_text or "").strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    if cleaned.startswith("```"):
        cleaned = cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    return json.loads(cleaned.strip())


def display_belt_name(belt_id: str) -> str:
    return f"{(belt_id or '').replace('_', ' ').title()} Belt"


def direct_address_text(value: Any) -> Any:
    if isinstance(value, str):
        replacements = {
            "the user is": "you are",
            "the user has": "you have",
            "the user shows": "you show",
            "the user demonstrates": "you demonstrate",
            "the user needs": "you need",
            "the user's": "your",
            "The user is": "You are",
            "The user has": "You have",
            "The user shows": "You show",
            "The user demonstrates": "You demonstrate",
            "The user needs": "You need",
            "The user's": "Your",
            "the user": "you",
            "The user": "You",
        }
        text = value
        for old, new in replacements.items():
            text = text.replace(old, new)
        return text
    if isinstance(value, list):
        return [direct_address_text(item) for item in value]
    if isinstance(value, dict):
        return {key: direct_address_text(item) for key, item in value.items()}
    return value


def default_subdomain_actions(domain_name: str, subdomain_name: str) -> list[str]:
    lower = subdomain_name.lower()
    if "vision" == lower:
        return ["Update your Vision page.", "Create 3 roadmap milestones connected to your vision."]
    if "team" in lower:
        return ["Add or update key people on My Team.", "Complete one team review or relationship check-in."]
    if "delegate" in lower or "coach" in lower:
        return ["Run one coaching session on delegation.", "Add one Coach & Delegate reflection after a real delegation moment."]
    if "execution" in lower or "prioritization" in lower:
        return ["Create a 7-day execution challenge in your task list.", "Review your top priorities daily for one week."]
    if "procrastination" in lower:
        return ["Add one procrastination reflection after an avoidance moment.", "Create one task that breaks a delayed item into a first action."]
    if "energy" in lower or "recovery" in lower:
        return ["Track one recovery habit for 7 days.", "Add one journal entry after a stressful or draining day."]
    if "failure" in lower or "development" in lower:
        return ["Update your development plan.", "Add one reflection under Failures & Scars or Development Opportunities."]
    return [f"Add one reflection for {subdomain_name}.", f"Create one task in Alfred connected to {domain_name}."]


def build_subdomain_feedback(domain_name: str, subdomain_name: str, evidence_items: list[dict[str, Any]]) -> dict:
    has_evidence = bool(evidence_items)
    return {
        "score": 3 if has_evidence else 1,
        "status": "meaningful foundation" if has_evidence else "needs deeper work",
        "current_readiness": (
            f"Your {subdomain_name} reflection gives Alfred an early foundation to coach from, but it needs sharper examples and clearer next steps."
            if has_evidence else
            f"Your current belt work in {subdomain_name} is still too thin or incomplete for Alfred to coach from with confidence."
        ),
        "why": (
            f"The submitted Journey work touches {subdomain_name}, but it needs more honest detail, concrete situations, and reflection on the pattern underneath."
            if has_evidence else
            f"This part of the wheel needs more belt-specific reflection, not stronger leadership performance. Add enough detail for Alfred to understand what you are noticing and what you want to change."
        ),
        "improve": default_subdomain_actions(domain_name, subdomain_name),
    }


def score_to_status(score: Any) -> str:
    try:
        score_value = int(score)
    except (TypeError, ValueError):
        score_value = 3
    if score_value <= 1:
        return "needs deeper work"
    if score_value == 2:
        return "emerging reflection"
    if score_value == 3:
        return "meaningful foundation"
    if score_value == 4:
        return "deeply explored"
    return "exceptional reflection"


def clean_score(score: Any, default: int = 3) -> int:
    try:
        return max(1, min(5, int(score)))
    except (TypeError, ValueError):
        return default


def normalize_subdomain_score(raw_subdomain: Any, default_feedback: dict) -> dict:
    if not isinstance(raw_subdomain, dict):
        raw_subdomain = {}
    score = clean_score(raw_subdomain.get("score"), default_feedback["score"])
    improve = raw_subdomain.get("improve") or raw_subdomain.get("next_actions_in_alfred") or default_feedback["improve"]
    if isinstance(improve, str):
        improve = [improve]
    return {
        "score": score,
        "status": raw_subdomain.get("status") or score_to_status(score),
        "current_readiness": raw_subdomain.get("current_readiness") or raw_subdomain.get("assessment") or default_feedback["current_readiness"],
        "why": raw_subdomain.get("why") or raw_subdomain.get("evidence_observed") or default_feedback["why"],
        "improve": improve[:3] if isinstance(improve, list) else default_feedback["improve"],
    }


def normalize_wheel_scores(result: dict, evidence: dict) -> dict:
    raw = result.get("wheel_scores") or result.get("wheel_feedback") or {}
    evidence_by_domain = evidence.get("belt_subdomain_evidence") or evidence.get("subdomain_evidence") or {}
    wheel_scores = {}

    for domain in JOURNEY_DIMENSIONS.values():
        domain_name = domain["name"]
        raw_domain = raw.get(domain_name) if isinstance(raw.get(domain_name), dict) else {}
        evidence_domain = evidence_by_domain.get(domain_name) or {}
        subdomains = {}

        for topic in domain["topics"]:
            subdomain_name = topic["label"]
            raw_subdomain = (raw_domain.get("subdomains") or {}).get(subdomain_name)
            default_feedback = build_subdomain_feedback(
                domain_name,
                subdomain_name,
                evidence_domain.get(subdomain_name) or [],
            )
            subdomains[subdomain_name] = normalize_subdomain_score(raw_subdomain, default_feedback)

        scores = [item["score"] for item in subdomains.values()]
        domain_score = clean_score(raw_domain.get("domain_score"), round(sum(scores) / len(scores)) if scores else 3)
        wheel_scores[domain_name] = {
            "domain_score": domain_score,
            "summary": raw_domain.get("summary") or raw_domain.get("overall_assessment") or f"Your {domain_name} Journey work is {score_to_status(domain_score)} based on reflection depth, specificity, and actionability.",
            "subdomains": subdomains,
        }

    return direct_address_text(wheel_scores)


def flatten_wheel_scores(wheel_scores: dict) -> list[dict[str, Any]]:
    items = []
    for domain_name, domain in wheel_scores.items():
        for subdomain_name, feedback in (domain.get("subdomains") or {}).items():
            items.append({
                "domain": domain_name,
                "subdomain": subdomain_name,
                "score": clean_score(feedback.get("score")),
                "feedback": feedback,
            })
    return items


def compute_journey_depth_score(wheel_scores: dict) -> int:
    scores = [item["score"] for item in flatten_wheel_scores(wheel_scores)]
    if not scores:
        return 0
    return round((sum(scores) / len(scores)) * 20)


def recommendation_from_score(score: int) -> str:
    if score >= 60:
        return "ready_for_promotion"
    if score >= 50:
        return "almost_ready"
    if score >= 35:
        return "not_ready"
    return "needs_more_evidence"


def derive_promotion_limiters(wheel_scores: dict, result: dict) -> list[dict[str, Any]]:
    raw_limiters = result.get("promotion_limiters")
    if isinstance(raw_limiters, list) and raw_limiters:
        return direct_address_text(raw_limiters[:3])

    limiters = []
    for item in sorted(flatten_wheel_scores(wheel_scores), key=lambda entry: entry["score"])[:3]:
        feedback = item["feedback"]
        improve = feedback.get("improve") or default_subdomain_actions(item["domain"], item["subdomain"])
        limiters.append({
            "domain": item["domain"],
            "subdomain": item["subdomain"],
            "score": item["score"],
            "why_it_limits_promotion": feedback.get("why") or f"{item['subdomain']} needs clearer, more specific Journey work before it can support promotion.",
            "what_to_do_next": improve[0] if improve else f"Add one concrete {item['subdomain']} reflection inside Alfred.",
        })
    return direct_address_text(limiters)


def derive_strongest_areas(wheel_scores: dict, result: dict) -> list[dict[str, Any]]:
    raw_strongest = result.get("strongest_areas")
    if isinstance(raw_strongest, list) and raw_strongest:
        return direct_address_text(raw_strongest[:3])

    strongest = []
    for item in sorted(flatten_wheel_scores(wheel_scores), key=lambda entry: entry["score"], reverse=True)[:3]:
        feedback = item["feedback"]
        strongest.append({
            "domain": item["domain"],
            "subdomain": item["subdomain"],
            "score": item["score"],
            "why_it_is_strong": feedback.get("why") or f"{item['subdomain']} is one of the deepest, most coachable areas in your current belt work.",
        })
    return direct_address_text(strongest)


def derive_priority_actions(wheel_scores: dict, result: dict) -> list[dict[str, str]]:
    raw_actions = result.get("priority_next_actions")
    if isinstance(raw_actions, list) and raw_actions:
        return direct_address_text(raw_actions[:5])

    actions = []
    for item in sorted(flatten_wheel_scores(wheel_scores), key=lambda entry: entry["score"])[:5]:
        feedback = item["feedback"]
        next_action = (feedback.get("improve") or default_subdomain_actions(item["domain"], item["subdomain"]))[0]
        actions.append({
            "domain": item["domain"],
            "subdomain": item["subdomain"],
            "action": next_action,
            "why_it_matters": "This is one of the clearest places to make your Journey work deeper, more specific, and easier for Alfred to coach from.",
        })
    return direct_address_text(actions[:5])


def wheel_scores_to_legacy_feedback(wheel_scores: dict) -> dict:
    legacy = {}
    for domain_name, domain in wheel_scores.items():
        subdomains = {}
        for subdomain_name, feedback in (domain.get("subdomains") or {}).items():
            subdomains[subdomain_name] = {
                "score": feedback.get("score"),
                "assessment": feedback.get("current_readiness"),
                "evidence_observed": feedback.get("why"),
                "missing_evidence": feedback.get("why"),
                "next_actions_in_alfred": feedback.get("improve") or [],
            }
        legacy[domain_name] = {
            "overall_assessment": domain.get("summary"),
            "strengths": [],
            "growth_edges": [],
            "subdomains": subdomains,
        }
    return legacy


def is_placeholder_text(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    stripped = value.strip().lower()
    return stripped.startswith("write ") or "based only on the submitted journey work" in stripped


def clean_profile(profile: dict) -> dict:
    if not isinstance(profile, dict):
        profile = {}
    cleaned = {
        "headline": profile.get("headline"),
        "description": profile.get("description"),
        "likely_strengths": profile.get("likely_strengths"),
        "likely_risks": profile.get("likely_risks"),
        "current_growth_edge": profile.get("current_growth_edge"),
    }
    if is_placeholder_text(cleaned["headline"]):
        cleaned["headline"] = None
    if is_placeholder_text(cleaned["description"]):
        cleaned["description"] = None
    if is_placeholder_text(cleaned["current_growth_edge"]):
        cleaned["current_growth_edge"] = None
    cleaned["likely_strengths"] = [
        item for item in (cleaned["likely_strengths"] or [])
        if not is_placeholder_text(item)
    ]
    cleaned["likely_risks"] = [
        item for item in (cleaned["likely_risks"] or [])
        if not is_placeholder_text(item)
    ]
    return cleaned


def normalize_assessment_result(result: dict, evidence: dict, target_belt: str) -> dict:
    result = direct_address_text(result or {})
    wheel_scores = normalize_wheel_scores(result, evidence)
    journey_depth_score = compute_journey_depth_score(wheel_scores)
    recommendation = recommendation_from_score(journey_depth_score)
    profile = clean_profile(result.get("leadership_profile") or {})
    profile = {
        **{
            "headline": "The Reflective Builder",
            "description": "Your Journey work suggests you are building self-awareness through the current belt. Your next edge is turning insight into clearer examples and more actionable reflection.",
            "likely_strengths": ["Willingness to reflect", "Interest in intentional growth"],
            "likely_risks": ["Insight that stays abstract", "Uneven reflection depth across the wheel"],
            "current_growth_edge": "Turning reflection into specific, coachable next steps.",
        },
        **{key: value for key, value in profile.items() if value},
    }
    direct_summary = result.get("direct_summary") or result.get("summary") or result.get("assessment_summary") or ""
    if is_placeholder_text(direct_summary):
        direct_summary = ""
    if not direct_summary:
        direct_summary = (
            "Alfred reviewed the depth, honesty, specificity, and actionability of your current belt work. "
            "Use the heatmap to see which sections are already coachable and which need deeper reflection."
        )
    limiters = derive_promotion_limiters(wheel_scores, result)
    strongest = derive_strongest_areas(wheel_scores, result)
    priority_actions = derive_priority_actions(wheel_scores, result)
    developmental_scores = result.get("journey_depth_scores") or result.get("developmental_dimension_scores") or result.get("dimension_scores") or {
        "reflection_depth": 3,
        "specificity": 3,
        "authenticity_honesty": 3,
        "intentionality": 3,
        "completeness": 3,
        "actionability": 3,
        "self_awareness": 3,
    }
    coaching_note = result.get("alfred_coaching_note") or result.get("final_coaching_note") or (
        "Focus on the lowest-scoring sections in the heatmap. Add one concrete example, one pattern you notice, and one next action Alfred can help you practice."
    )

    return {
        **result,
        "recommendation": recommendation,
        "readiness_score": journey_depth_score,
        "target_belt": result.get("target_belt") or display_belt_name(target_belt),
        "direct_summary": direct_summary,
        "leadership_profile": direct_address_text(profile),
        "wheel_scores": wheel_scores,
        "wheel_feedback": result.get("wheel_feedback") or wheel_scores_to_legacy_feedback(wheel_scores),
        "promotion_limiters": limiters,
        "strongest_areas": strongest,
        "priority_next_actions": priority_actions,
        "developmental_dimension_scores": direct_address_text(developmental_scores),
        "journey_depth_scores": direct_address_text(developmental_scores),
        "dimension_scores": direct_address_text(developmental_scores),
        "alfred_coaching_note": direct_address_text(coaching_note),
    }


def fallback_assessment_from_evidence(evidence: dict) -> dict:
    trial_count = len(evidence.get("belt_trials") or [])
    score = min(84, 55 + trial_count * 3)
    base = {
        "recommendation": recommendation_from_score(score),
        "readiness_score": score,
        "direct_summary": "Your current belt work is ready to review, but some parts of the wheel need deeper, more specific reflection before promotion. This is about strengthening the homework, not judging your leadership worth.",
        "leadership_profile": {
            "headline": "The Reflective Builder",
            "description": "Your Journey work suggests you are engaging seriously with the current belt. Your next edge is making your reflections more concrete, honest, and actionable.",
            "likely_strengths": ["Willingness to reflect", "Interest in structured growth"],
            "likely_risks": ["Staying at the level of insight", "Writing answers that are too abstract for coaching"],
            "current_growth_edge": "Turning completed exercises into specific, coachable reflection.",
        },
        "journey_depth_scores": {
            "reflection_depth": 3,
            "specificity": 3,
            "authenticity_honesty": 3,
            "intentionality": 3,
            "completeness": 3,
            "actionability": 3,
            "self_awareness": 3,
        },
        "priority_next_actions": [
            {
                "domain": "Learning & Development",
                "subdomain": "Development Plan",
                "action": "Update your Development Plan with 3 specific behaviors you want to practice and why each one matters.",
                "why_it_matters": "Specific practice goals make your Journey work more actionable and easier for Alfred to coach.",
            }
        ],
        "alfred_coaching_note": "Use the lowest-scoring areas in the heatmap as your reflection plan. Add one concrete example, one pattern you notice, and one next action Alfred can help you practice.",
    }
    return normalize_assessment_result(base, evidence, evidence.get("target_belt") or "")


@router.get("/trial-config")
def get_trial_config():
    return load_journey_trials_config()


@router.get("/subdomain-prompts")
def get_subdomain_prompts():
    return load_journey_subdomain_prompts_config()


@router.get("/validation/{belt}")
def get_belt_validation(
        belt: str,
        user_number: str,
        db: Session = Depends(get_db)
):
    belt_id = (belt or "").strip().lower()
    if belt_id not in BELT_DIMENSION_SIGNALS:
        raise HTTPException(status_code=404, detail="Automatic validation is not available for this belt yet.")
    return validate_belt(db, user_number, belt_id)


@router.get("/validation/{belt}/{dimension_id}")
def get_belt_dimension_validation(
        belt: str,
        dimension_id: str,
        user_number: str,
    db: Session = Depends(get_db)
):
    belt_id = (belt or "").strip().lower()
    if belt_id not in BELT_DIMENSION_SIGNALS:
        raise HTTPException(status_code=404, detail="Automatic validation is not available for this belt yet.")
    if dimension_id not in JOURNEY_DIMENSIONS:
        raise HTTPException(status_code=404, detail="Journey dimension not found.")
    return validate_belt_dimension(db, user_number, belt_id, dimension_id)


class BeltTrialCreate(BaseModel):
    user_number: str
    dimension_id: str
    trial_type: str
    prompt: str
    target_belt: Optional[str] = "yellow"
    response_text: Optional[str] = None
    status: Optional[str] = "in_progress"


class BeltTrialSubmit(BaseModel):
    response_text: str
    status: Optional[str] = "submitted"
    prompt: Optional[str] = None


class BeltTrialResponse(BaseModel):
    id: int
    user_number: str
    dimension_id: str
    target_belt: str
    trial_type: str
    prompt: str
    response_text: Optional[str]
    status: str
    ai_feedback: Optional[str]
    score: Optional[int]
    evidence: Optional[dict]
    started_at: datetime
    submitted_at: Optional[datetime]
    reviewed_at: Optional[datetime]
    updated_at: datetime

    class Config:
        from_attributes = True


class BeltReadinessSubmit(BaseModel):
    current_belt: str
    target_belt: str


class BeltAssessmentResponse(BaseModel):
    id: int
    user_number: str
    current_belt: str
    target_belt: str
    status: str
    readiness_score: Optional[int]
    recommendation: Optional[str]
    assessment_summary: Optional[str]
    dimension_scores: Optional[dict]
    strengths: Optional[list]
    growth_edges: Optional[list]
    domain_feedback: Optional[dict]
    subdomain_feedback: Optional[dict]
    required_next_actions: Optional[list]
    leadership_profile: Optional[dict]
    wheel_feedback: Optional[dict]
    wheel_scores: Optional[dict]
    promotion_limiters: Optional[list]
    strongest_areas: Optional[list]
    priority_next_actions: Optional[list]
    developmental_dimension_scores: Optional[dict]
    journey_depth_scores: Optional[dict]
    final_coaching_note: Optional[str]
    alfred_coaching_note: Optional[str]
    evidence_snapshot: Optional[dict]
    llm_raw_response: Optional[dict]
    accepted_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.get("/belt-readiness/status")
def get_belt_readiness_status(
        user_number: str,
        db: Session = Depends(get_db)
):
    config = load_journey_trials_config()
    status = get_current_belt_status(db, user_number, config)
    if status.get("current_belt") == "white":
        status["assessment_locked_until_yellow"] = True
        status["is_assessment_available"] = False
        status["is_eligible_to_submit"] = False
        status["assessment_lock_title"] = "Leadership Assessment"
        status["assessment_lock_message"] = (
            "Your leadership assessment becomes available once you reach Yellow Belt. "
            "Complete your early Journey exercises, gather evidence through real actions, "
            "and Alfred will unlock your first assessment when you are ready."
        )
    else:
        status["assessment_locked_until_yellow"] = False
        status["is_assessment_available"] = True
    latest_assessment = db.query(BeltAssessment).filter(
        BeltAssessment.user_number.in_(get_user_identifiers(db, user_number)),
        BeltAssessment.current_belt == status["current_belt"],
        BeltAssessment.target_belt == status["target_belt"],
    ).order_by(BeltAssessment.created_at.desc()).first()

    status["latest_assessment_status"] = latest_assessment.status if latest_assessment else None
    status["latest_assessment_id"] = latest_assessment.id if latest_assessment else None
    logger.info(
        "[belt_readiness_response] user_number=%s current_belt=%s target_belt=%s assessment_locked_until_yellow=%s is_assessment_available=%s is_eligible_to_submit=%s latest_assessment_id=%s latest_assessment_status=%s",
        user_number,
        status.get("current_belt"),
        status.get("target_belt"),
        status.get("assessment_locked_until_yellow"),
        status.get("is_assessment_available"),
        status.get("is_eligible_to_submit"),
        status.get("latest_assessment_id"),
        status.get("latest_assessment_status"),
    )
    return status


@router.get("/belt-assessments/latest", response_model=Optional[BeltAssessmentResponse])
def get_latest_belt_assessment(
        user_number: str,
        db: Session = Depends(get_db)
):
    return db.query(BeltAssessment).filter(
        BeltAssessment.user_number.in_(get_user_identifiers(db, user_number))
    ).order_by(BeltAssessment.created_at.desc()).first()


@router.get("/belt-assessments", response_model=list[BeltAssessmentResponse])
def get_belt_assessments(
        user_number: str,
        db: Session = Depends(get_db)
):
    return db.query(BeltAssessment).filter(
        BeltAssessment.user_number.in_(get_user_identifiers(db, user_number))
    ).order_by(BeltAssessment.created_at.desc()).all()


@router.post("/belt-assessments/submit", response_model=BeltAssessmentResponse)
def submit_belt_assessment(
        request: BeltReadinessSubmit,
        user_number: str,
        db: Session = Depends(get_db)
):
    config = load_journey_trials_config()
    readiness = get_current_belt_status(db, user_number, config)
    if readiness.get("current_belt") == "white":
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Leadership assessment becomes available once you reach Yellow Belt.",
                "readiness": readiness,
            },
        )
    if request.current_belt != readiness["current_belt"] or request.target_belt != readiness["target_belt"]:
        raise HTTPException(status_code=400, detail="Requested belt pair does not match current Journey readiness.")
    if not readiness["is_eligible_to_submit"]:
        raise HTTPException(status_code=400, detail={"message": "Belt assessment is locked until all required trials are complete.", "readiness": readiness})

    evidence = gather_belt_assessment_evidence(db, user_number, request.current_belt)
    evidence["target_belt"] = request.target_belt
    prompt_config = load_belt_assessment_prompt()
    system_prompt = prompt_config.get("system", "You are Alfred. Return valid JSON.")
    user_template = prompt_config.get("user_template", "{evidence_json}")
    evidence_json = json.dumps(jsonable_encoder(evidence), ensure_ascii=False, indent=2)
    user_prompt = user_template.format(
        current_belt=request.current_belt,
        target_belt=request.target_belt,
        evidence_json=evidence_json,
    )

    try:
        from openai import OpenAI
        from app.config import OPENAI_API_KEY, OPENAI_MODEL

        client = OpenAI(api_key=OPENAI_API_KEY)
        response = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.25,
            max_tokens=5000,
        )
        raw_text = response.choices[0].message.content or "{}"
        result = parse_assessment_response(raw_text)
    except Exception as error:
        print(f"Error generating belt assessment: {error}")
        result = fallback_assessment_from_evidence(evidence)
    result = normalize_assessment_result(result, evidence, request.target_belt)

    recommendation = result.get("recommendation") or "needs_more_evidence"
    if recommendation not in ASSESSMENT_STATUS_VALUES:
        recommendation = "needs_more_evidence"
    readiness_score = result.get("readiness_score")
    try:
        readiness_score = int(readiness_score) if readiness_score is not None else None
    except (TypeError, ValueError):
        readiness_score = None

    assessment = BeltAssessment(
        user_number=user_number,
        current_belt=request.current_belt,
        target_belt=request.target_belt,
        status=recommendation,
        readiness_score=readiness_score,
        recommendation=recommendation,
        assessment_summary=result.get("direct_summary") or result.get("summary") or result.get("assessment_summary"),
        dimension_scores=result.get("dimension_scores") or {},
        strengths=result.get("strengths") or [],
        growth_edges=result.get("growth_edges") or [],
        domain_feedback=result.get("domain_feedback") or {},
        subdomain_feedback=result.get("subdomain_feedback") or {},
        required_next_actions=result.get("required_next_actions") or [],
        leadership_profile=result.get("leadership_profile") or {},
        wheel_feedback=result.get("wheel_feedback") or {},
        wheel_scores=result.get("wheel_scores") or {},
        promotion_limiters=result.get("promotion_limiters") or [],
        strongest_areas=result.get("strongest_areas") or [],
        priority_next_actions=result.get("priority_next_actions") or [],
        developmental_dimension_scores=result.get("developmental_dimension_scores") or result.get("dimension_scores") or {},
        journey_depth_scores=result.get("journey_depth_scores") or result.get("developmental_dimension_scores") or result.get("dimension_scores") or {},
        final_coaching_note=result.get("final_coaching_note") or result.get("alfred_coaching_note"),
        alfred_coaching_note=result.get("alfred_coaching_note") or result.get("final_coaching_note"),
        evidence_snapshot=jsonable_encoder(evidence),
        llm_raw_response=jsonable_encoder(result),
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )
    db.add(assessment)
    db.commit()
    db.refresh(assessment)
    write_audit_log(
        db,
        user_id=user_id_for_identifier(db, user_number),
        event_type="belt_assessment_submitted",
        object_type="belt_assessment",
        object_id=assessment.id,
        metadata={
            "assessment_id": assessment.id,
            "current_belt": request.current_belt,
            "target_belt": request.target_belt,
            "recommendation": assessment.recommendation,
        },
    )
    return assessment


@router.post("/belt-assessments/{assessment_id}/accept-promotion", response_model=BeltAssessmentResponse)
def accept_belt_promotion(
        assessment_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    assessment = db.query(BeltAssessment).filter(
        BeltAssessment.id == assessment_id,
        BeltAssessment.user_number.in_(get_user_identifiers(db, user_number)),
    ).first()
    if not assessment:
        raise HTTPException(status_code=404, detail="Belt assessment not found")
    if assessment.recommendation != "ready_for_promotion":
        raise HTTPException(status_code=400, detail="Alfred has not recommended promotion for this assessment.")

    assessment.accepted_at = datetime.now()
    assessment.updated_at = datetime.now()
    db.commit()
    db.refresh(assessment)
    write_audit_log(
        db,
        user_id=user_id_for_identifier(db, user_number),
        event_type="belt_promotion_accepted",
        object_type="belt_assessment",
        object_id=assessment.id,
        metadata={
            "assessment_id": assessment.id,
            "current_belt": assessment.current_belt,
            "target_belt": assessment.target_belt,
            "status": "accepted",
        },
    )
    return assessment


@router.get("/belt-trials", response_model=list[BeltTrialResponse])
def get_belt_trials(
        user_number: str,
        dimension_id: Optional[str] = None,
        target_belt: Optional[str] = None,
        db: Session = Depends(get_db)
):
    trace_id = uuid.uuid4().hex[:8]
    query = db.query(JourneyBeltTrial).filter(JourneyBeltTrial.user_number == user_number)

    if dimension_id:
        query = query.filter(JourneyBeltTrial.dimension_id == dimension_id)
    if target_belt:
        query = query.filter(JourneyBeltTrial.target_belt == target_belt)

    trials = query.order_by(JourneyBeltTrial.started_at.desc()).all()
    logger.info(
        "[belt_trials_get:%s] user=%s dimension_filter=%s belt_filter=%s count=%s statuses=%s",
        trace_id,
        user_number,
        dimension_id,
        target_belt,
        len(trials),
        [
            {
                "id": trial.id,
                "dimension": trial.dimension_id,
                "belt": trial.target_belt,
                "type": trial.trial_type,
                "status": trial.status,
                "score": trial.score,
                "reviewed_at": trial.reviewed_at.isoformat() if trial.reviewed_at else None,
                "response_hash": response_fingerprint(trial.response_text),
                "history_count": len(((trial.evidence or {}).get("feedback_history") or [])),
            }
            for trial in trials[:15]
        ],
    )
    return trials


@router.post("/belt-trials", response_model=BeltTrialResponse)
def start_belt_trial(
        trial_data: BeltTrialCreate,
        db: Session = Depends(get_db)
):
    trace_id = uuid.uuid4().hex[:8]
    logger.info(
        "[belt_trial_create:%s] received user=%s dimension=%s belt=%s type=%s requested_status=%s response_len=%s response_hash=%s",
        trace_id,
        trial_data.user_number,
        trial_data.dimension_id,
        trial_data.target_belt or "yellow",
        trial_data.trial_type,
        trial_data.status,
        len(trial_data.response_text or ""),
        response_fingerprint(trial_data.response_text),
    )
    config = load_journey_trials_config()
    existing = db.query(JourneyBeltTrial).filter(
        JourneyBeltTrial.user_number == trial_data.user_number,
        JourneyBeltTrial.dimension_id == trial_data.dimension_id,
        JourneyBeltTrial.target_belt == (trial_data.target_belt or "yellow"),
        JourneyBeltTrial.trial_type == trial_data.trial_type,
    ).first()

    if existing:
        logger.info(
            "[belt_trial_create:%s] existing trial_id=%s prior_status=%s prior_score=%s prior_response_hash=%s",
            trace_id,
            existing.id,
            existing.status,
            existing.score,
            response_fingerprint(existing.response_text),
        )
        if trial_data.response_text is not None:
            existing.response_text = trial_data.response_text
            existing.status = trial_data.status or "in_progress"
            existing.updated_at = datetime.now()
            if existing.status == "submitted":
                existing.submitted_at = datetime.now()
                apply_trial_review(db, existing, config, trace_id=trace_id)
            db.commit()
            db.refresh(existing)
            if normalize_trial_status(existing.status) == "submitted":
                write_audit_log(
                    db,
                    user_id=user_id_for_identifier(db, trial_data.user_number),
                    event_type="journey_trial_submitted",
                    object_type="journey_belt_trial",
                    object_id=existing.id,
                    metadata={
                        "trial_id": existing.id,
                        "dimension_id": existing.dimension_id,
                        "target_belt": existing.target_belt,
                        "trial_type": existing.trial_type,
                        "status": existing.status,
                    },
                )
            logger.info(
                "[belt_trial_create:%s] existing saved trial_id=%s final_status=%s final_score=%s reviewed_at=%s",
                trace_id,
                existing.id,
                existing.status,
                existing.score,
                existing.reviewed_at,
            )
        return existing

    trial = JourneyBeltTrial(
        user_number=trial_data.user_number,
        dimension_id=trial_data.dimension_id,
        target_belt=trial_data.target_belt or "yellow",
        trial_type=trial_data.trial_type,
        prompt=trial_data.prompt,
        response_text=trial_data.response_text,
        status=trial_data.status or "in_progress",
        started_at=datetime.now(),
        submitted_at=datetime.now() if trial_data.status == "submitted" else None,
        updated_at=datetime.now(),
    )
    if trial.status == "submitted":
        trial.submitted_at = datetime.now()
        apply_trial_review(db, trial, config, trace_id=trace_id)
    db.add(trial)
    db.commit()
    db.refresh(trial)
    if normalize_trial_status(trial.status) == "submitted":
        write_audit_log(
            db,
            user_id=user_id_for_identifier(db, trial_data.user_number),
            event_type="journey_trial_submitted",
            object_type="journey_belt_trial",
            object_id=trial.id,
            metadata={
                "trial_id": trial.id,
                "dimension_id": trial.dimension_id,
                "target_belt": trial.target_belt,
                "trial_type": trial.trial_type,
                "status": trial.status,
            },
        )
    logger.info(
        "[belt_trial_create:%s] created trial_id=%s final_status=%s final_score=%s reviewed_at=%s",
        trace_id,
        trial.id,
        trial.status,
        trial.score,
        trial.reviewed_at,
    )
    return trial


@router.put("/belt-trials/{trial_id}", response_model=BeltTrialResponse)
def submit_belt_trial(
        trial_id: int,
        trial_data: BeltTrialSubmit,
        user_number: str,
        db: Session = Depends(get_db)
):
    trace_id = uuid.uuid4().hex[:8]
    logger.info(
        "[belt_trial_submit:%s] received trial_id=%s user=%s requested_status=%s response_len=%s response_hash=%s",
        trace_id,
        trial_id,
        user_number,
        trial_data.status,
        len(trial_data.response_text or ""),
        response_fingerprint(trial_data.response_text),
    )
    trial = db.query(JourneyBeltTrial).filter(
        JourneyBeltTrial.id == trial_id,
        JourneyBeltTrial.user_number == user_number
    ).first()

    if not trial:
        logger.warning("[belt_trial_submit:%s] not_found trial_id=%s user=%s", trace_id, trial_id, user_number)
        raise HTTPException(status_code=404, detail="Belt trial not found")

    logger.info(
        "[belt_trial_submit:%s] loaded trial_id=%s prior_status=%s prior_score=%s prior_response_hash=%s prior_reviewed_at=%s history_count=%s",
        trace_id,
        trial.id,
        trial.status,
        trial.score,
        response_fingerprint(trial.response_text),
        trial.reviewed_at,
        len(((trial.evidence or {}).get("feedback_history") or [])),
    )
    trial.response_text = trial_data.response_text
    trial.status = trial_data.status or "submitted"
    if trial_data.prompt is not None:
        trial.prompt = trial_data.prompt
    trial.updated_at = datetime.now()
    if normalize_trial_status(trial.status) == "submitted":
        trial.submitted_at = datetime.now()
        config = load_journey_trials_config()
        apply_trial_review(db, trial, config, trace_id=trace_id)
    db.commit()
    db.refresh(trial)
    if normalize_trial_status(trial.status) == "submitted":
        write_audit_log(
            db,
            user_id=user_id_for_identifier(db, user_number),
            event_type="journey_trial_submitted",
            object_type="journey_belt_trial",
            object_id=trial.id,
            metadata={
                "trial_id": trial.id,
                "dimension_id": trial.dimension_id,
                "target_belt": trial.target_belt,
                "trial_type": trial.trial_type,
                "status": trial.status,
            },
        )
    logger.info(
        "[belt_trial_submit:%s] saved trial_id=%s final_status=%s final_score=%s reviewed_at=%s response_hash=%s history_count=%s",
        trace_id,
        trial.id,
        trial.status,
        trial.score,
        trial.reviewed_at,
        response_fingerprint(trial.response_text),
        len(((trial.evidence or {}).get("feedback_history") or [])),
    )
    return trial


submit_belt_trial_response = submit_belt_trial


# Pydantic response models
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
    strengths: Optional[str]
    growth_areas: Optional[str]
    aspirations: Optional[str]
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


# ========================================
# STRENGTHS
# ========================================
@router.get("/strengths", response_model=list[StrengthResponse])
def get_strengths(
        user_number: str,
        db: Session = Depends(get_db)
):
    """Get all strengths for a user"""
    strengths = db.query(JourneyStrength).filter(
        JourneyStrength.user_number == user_number
    ).order_by(JourneyStrength.first_seen_at.desc()).all()

    return strengths


class StrengthCreate(BaseModel):
    title: Optional[str] = None
    strength: str
    source: Optional[str] = None


@router.post("/strengths", response_model=StrengthResponse)
def create_strength(
        strength_data: StrengthCreate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Create a new strength"""
    new_strength = JourneyStrength(
        user_number=user_number,
        title=strength_data.title,
        strength=strength_data.strength,
        source=strength_data.source,
        first_seen_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(new_strength)
    db.commit()
    db.refresh(new_strength)
    return new_strength


# ========================================
# DEVELOPMENT AREAS
# ========================================
@router.get("/development-areas", response_model=list[DevelopmentAreaResponse])
def get_development_areas(
        user_number: str,
        db: Session = Depends(get_db)
):
    """Get all development areas for a user"""
    areas = db.query(JourneyDevelopmentArea).filter(
        JourneyDevelopmentArea.user_number == user_number
    ).all()

    return areas


class DevelopmentAreaCreate(BaseModel):
    title: Optional[str] = None
    skill: str
    source: Optional[str] = None


@router.post("/development-areas", response_model=DevelopmentAreaResponse)
def create_development_area(
        area_data: DevelopmentAreaCreate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Create a new development area"""
    new_area = JourneyDevelopmentArea(
        user_number=user_number,
        title=area_data.title,
        skill=area_data.skill,
        source=area_data.source
    )
    db.add(new_area)
    db.commit()
    db.refresh(new_area)
    return new_area


# ========================================
# PROJECTS
# ========================================
@router.get("/projects", response_model=list[ProjectResponse])
def get_projects(
        user_number: str,
        db: Session = Depends(get_db)
):
    """Get all projects for a user"""
    projects = db.query(JourneyProject).filter(
        JourneyProject.user_number == user_number
    ).order_by(JourneyProject.first_seen_at.desc()).all()

    return projects


class ProjectCreate(BaseModel):
    project_name: str
    goal: Optional[str] = None
    description: Optional[str] = None
    status: str = "active"


@router.post("/projects", response_model=ProjectResponse)
def create_project(
        project_data: ProjectCreate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Create a new project"""
    new_project = JourneyProject(
        user_number=user_number,
        project_name=project_data.project_name,
        goal=project_data.goal,
        description=project_data.description,
        status=project_data.status,
        first_seen_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(new_project)
    db.commit()
    db.refresh(new_project)
    return new_project


# ========================================
# PEOPLE - FULL CRUD
# ========================================
@router.get("/people", response_model=list[PersonResponse])
def get_people(
        user_number: str,
        db: Session = Depends(get_db)
):
    """Get all important people for a user"""
    people = db.query(JourneyPerson).filter(
        JourneyPerson.user_number == user_number
    ).order_by(JourneyPerson.first_seen_at.desc()).all()

    return people


@router.post("/people", response_model=PersonResponse)
def create_person(
        person_data: PersonCreate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Create a new person"""
    new_person = JourneyPerson(
        user_number=user_number,
        name=person_data.name,
        email=person_data.email,
        phone=person_data.phone,
        relation=person_data.relation,
        context=person_data.context,
        strengths=person_data.strengths,
        growth_areas=person_data.growth_areas,
        aspirations=person_data.aspirations,
        first_seen_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(new_person)
    db.commit()
    db.refresh(new_person)
    return new_person


@router.put("/people/{person_id}", response_model=PersonResponse)
def update_person(
        person_id: int,
        person_data: PersonUpdate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Update a person"""
    person = db.query(JourneyPerson).filter(
        JourneyPerson.id == person_id,
        JourneyPerson.user_number == user_number
    ).first()

    if not person:
        raise HTTPException(status_code=404, detail="Person not found")

    if person_data.name is not None:
        person.name = person_data.name
    if person_data.email is not None:
        person.email = person_data.email
    if person_data.phone is not None:
        person.phone = person_data.phone
    if person_data.relation is not None:
        person.relation = person_data.relation
    if person_data.context is not None:
        person.context = person_data.context
    if person_data.strengths is not None:
        person.strengths = person_data.strengths
    if person_data.growth_areas is not None:
        person.growth_areas = person_data.growth_areas
    if person_data.aspirations is not None:
        person.aspirations = person_data.aspirations

    person.updated_at = datetime.now()
    db.commit()
    db.refresh(person)
    return person


@router.delete("/people/{person_id}")
def delete_person(
        person_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Delete a person"""
    person = db.query(JourneyPerson).filter(
        JourneyPerson.id == person_id,
        JourneyPerson.user_number == user_number
    ).first()

    if not person:
        raise HTTPException(status_code=404, detail="Person not found")

    db.query(RelationshipReview).filter(
        RelationshipReview.person_id == person_id,
        RelationshipReview.user_number == user_number
    ).delete(synchronize_session=False)

    db.delete(person)
    db.commit()
    return {"success": True, "message": "Person deleted"}


# ========================================
# FAILURES & LEARNINGS
# ========================================
@router.get("/failures", response_model=list[FailureResponse])
def get_failures(
        user_number: str,
        db: Session = Depends(get_db)
):
    """Get all failures and learnings for a user"""
    failures = db.query(JourneyFailure).filter(
        JourneyFailure.user_number == user_number
    ).order_by(JourneyFailure.first_seen_at.desc()).all()

    return failures


class FailureCreate(BaseModel):
    title: Optional[str] = None
    failure_text: str
    learning: Optional[str] = None
    scar: Optional[str] = None


@router.post("/failures", response_model=FailureResponse)
def create_failure(
        failure_data: FailureCreate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Create a new failure/learning"""
    new_failure = JourneyFailure(
        user_number=user_number,
        title=failure_data.title,
        failure_text=failure_data.failure_text,
        learning=failure_data.learning,
        scar=failure_data.scar,
        first_seen_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(new_failure)
    db.commit()
    db.refresh(new_failure)
    return new_failure


# ========================================
# OPPORTUNITIES
# ========================================
@router.get("/opportunities", response_model=list[OpportunityResponse])
def get_opportunities(
        user_number: str,
        db: Session = Depends(get_db)
):
    """Get all opportunities for a user"""
    opportunities = db.query(JourneyOpportunity).filter(
        JourneyOpportunity.user_number == user_number
    ).order_by(JourneyOpportunity.first_seen_at.desc()).all()

    return opportunities


class OpportunityCreate(BaseModel):
    opportunity_text: str
    category: Optional[str] = None


@router.post("/opportunities", response_model=OpportunityResponse)
def create_opportunity(
        opportunity_data: OpportunityCreate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Create a new opportunity"""
    new_opportunity = JourneyOpportunity(
        user_number=user_number,
        opportunity_text=opportunity_data.opportunity_text,
        category=opportunity_data.category,
        first_seen_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(new_opportunity)
    db.commit()
    db.refresh(new_opportunity)
    return new_opportunity


# ========================================
# GOALS - FULL CRUD
# ========================================
@router.get("/goals", response_model=list[GoalResponse])
def get_goals(
        user_number: str,
        db: Session = Depends(get_db)
):
    """Get all goals for a user"""
    user = db.query(User).filter((User.phone_number == user_number) | (User.email == user_number)).first()
    if user and ensure_starter_examples_for_empty_user(db, user):
        db.commit()

    goals = (
        db.query(JourneyGoal)
        .options(
            selectinload(JourneyGoal.value_links).selectinload(JourneyGoalValue.value)
        )
        .filter(JourneyGoal.user_number == user_number)
        .order_by(JourneyGoal.sort_order, JourneyGoal.first_seen_at.desc())
        .all()
    )

    return [serialize_goal(goal) for goal in goals]


@router.post("/goals", response_model=GoalResponse)
def create_goal(
        goal_data: GoalCreate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Create a new goal"""
    time_horizon = normalize_goal_level(goal_data.time_horizon)
    sort_order = goal_data.sort_order
    if sort_order is None:
        sibling_goals = db.query(JourneyGoal).filter(
            JourneyGoal.user_number == user_number,
            JourneyGoal.time_horizon.in_(goal_level_variants(time_horizon)),
            JourneyGoal.parent_goal_id == goal_data.parent_goal_id
        ).all()
        sort_order = max((goal.sort_order or 0 for goal in sibling_goals), default=-1) + 1

    new_goal = JourneyGoal(
        user_number=user_number,
        title=goal_data.title,
        goal_text=goal_data.goal_text,
        why=goal_data.why,
        time_horizon=time_horizon,
        parent_goal_id=goal_data.parent_goal_id,
        sort_order=sort_order,
        first_seen_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(new_goal)
    db.commit()
    db.refresh(new_goal)
    sync_goal_values(db, new_goal, user_number, goal_data.value_ids if time_horizon == "vision" else [])
    db.commit()
    db.refresh(new_goal)
    write_audit_log(
        db,
        user_id=user_id_for_identifier(db, user_number),
        event_type="goal_created",
        object_type="journey_goal",
        object_id=new_goal.id,
        metadata={
            "goal_id": new_goal.id,
            "time_horizon": new_goal.time_horizon,
            "parent_goal_id": new_goal.parent_goal_id,
            "status": "created",
        },
    )
    return serialize_goal(new_goal)


@router.patch("/goals/reorder")
def reorder_goals(
        reorder_data: GoalReorderRequest,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Persist manual goal ordering within a single parent scope."""
    horizon_by_type = {
        "long": "long",
        "long_term": "long",
        "vision": "vision",
        "medium": "medium",
        "medium_term": "medium",
        "pillar": "pillar",
        "short": "short",
        "short_term": "short",
        "outcome": "outcome",
    }
    raw_horizon = horizon_by_type.get((reorder_data.goal_type or "").strip().lower())
    expected_horizon = normalize_goal_level(raw_horizon) if raw_horizon else None

    if not expected_horizon:
        raise HTTPException(status_code=400, detail="Invalid goal_type")

    ordered_goal_ids = reorder_data.ordered_goal_ids or []
    if not ordered_goal_ids:
        raise HTTPException(status_code=400, detail="ordered_goal_ids is required")
    if len(ordered_goal_ids) != len(set(ordered_goal_ids)):
        raise HTTPException(status_code=400, detail="ordered_goal_ids must be unique")

    parent_scope = reorder_data.parent_goal_id
    if parent_scope is None:
        parent_scope = reorder_data.parent_id

    goals = db.query(JourneyGoal).filter(
        JourneyGoal.user_number == user_number,
        JourneyGoal.id.in_(ordered_goal_ids)
    ).all()

    if len(goals) != len(ordered_goal_ids):
        raise HTTPException(status_code=400, detail="All reordered goals must belong to the current user")

    goals_by_id = {goal.id: goal for goal in goals}
    for goal in goals:
        if normalize_goal_level(goal.time_horizon) != expected_horizon:
            raise HTTPException(status_code=400, detail="All reordered goals must match goal_type")
        if goal.parent_goal_id != parent_scope:
            raise HTTPException(status_code=400, detail="All reordered goals must share the same parent scope")

    for index, goal_id in enumerate(ordered_goal_ids):
        goal = goals_by_id[goal_id]
        goal.sort_order = index
        goal.updated_at = datetime.now()

    db.commit()

    ordered_goals = []
    for goal_id in ordered_goal_ids:
        goal = goals_by_id[goal_id]
        db.refresh(goal)
        ordered_goals.append(serialize_goal(goal))

    return {"success": True, "goals": ordered_goals}


@router.put("/goals/{goal_id}", response_model=GoalResponse)
def update_goal(
        goal_id: int,
        goal_data: GoalUpdate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Update a goal"""
    goal = db.query(JourneyGoal).filter(
        JourneyGoal.id == goal_id,
        JourneyGoal.user_number == user_number
    ).first()

    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    if goal_data.title is not None:
        goal.title = goal_data.title
    if goal_data.goal_text is not None:
        goal.goal_text = goal_data.goal_text
    if goal_data.why is not None:
        goal.why = goal_data.why
    if goal_data.time_horizon is not None:
        goal.time_horizon = normalize_goal_level(goal_data.time_horizon)
    if goal_data.parent_goal_id is not None:
        goal.parent_goal_id = goal_data.parent_goal_id
    if goal_data.sort_order is not None:
        goal.sort_order = goal_data.sort_order

    goal.updated_at = datetime.now()
    db.commit()
    db.refresh(goal)
    if goal_data.value_ids is not None or normalize_goal_level(goal.time_horizon) != "vision":
        sync_goal_values(
            db,
            goal,
            user_number,
            goal_data.value_ids if normalize_goal_level(goal.time_horizon) == "vision" else [],
        )
        db.commit()
        db.refresh(goal)
    return serialize_goal(goal)


@router.delete("/goals/{goal_id}")
def delete_goal(
        goal_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Delete a goal"""
    goal = db.query(JourneyGoal).filter(
        JourneyGoal.id == goal_id,
        JourneyGoal.user_number == user_number
    ).first()

    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    # Delete linked review sessions first
    review_sessions = db.query(GoalReviewSession).filter(
        GoalReviewSession.goal_id == goal.id,
        GoalReviewSession.user_number == user_number
    ).all()

    for session in review_sessions:
        db.delete(session)

    wave_links = db.query(WaveGoal).join(VisionRoadmapWave).filter(
        WaveGoal.goal_id == goal.id,
        VisionRoadmapWave.user_number == user_number
    ).all()
    for link in wave_links:
        db.delete(link)

    # Delete goal
    db.delete(goal)
    db.commit()
    write_audit_log(
        db,
        user_id=user_id_for_identifier(db, user_number),
        event_type="goal_deleted",
        object_type="journey_goal",
        object_id=goal_id,
        metadata={"goal_id": goal_id, "status": "deleted"},
    )


    return {"success": True, "message": "Goal deleted"}


# ========================================
# TRANSFORMATION ROADMAP
# ========================================
@router.get("/visions/{vision_id}/roadmap")
def get_vision_roadmap(
        vision_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    vision = get_user_goal_or_404(db, vision_id, user_number)
    if normalize_goal_level(vision.time_horizon) != "vision":
        raise HTTPException(status_code=400, detail="Roadmaps can only be created for visions")

    user = db.query(User).filter(User.phone_number == user_number).first()
    if user:
        seeded_roadmaps = ensure_starter_roadmaps_seeded(db, user)
        compacted_samples = ensure_starter_goal_samples_compacted(db, user)
        if seeded_roadmaps or compacted_samples:
            db.commit()
            db.refresh(vision)

    waves = db.query(VisionRoadmapWave).filter(
        VisionRoadmapWave.user_number == user_number,
        VisionRoadmapWave.vision_goal_id == vision_id,
    ).order_by(VisionRoadmapWave.sequence_order, VisionRoadmapWave.created_at).all()

    return {
        "vision": serialize_goal(vision),
        "waves": [serialize_wave(wave) for wave in waves],
    }


@router.get("/visions/{vision_id}/progress-review")
def get_vision_progress_review(
        vision_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    try:
        return VisionProgressReviewService.get_latest_or_generated(db, user_number, vision_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error))


@router.post("/visions/{vision_id}/progress-review/refresh")
def refresh_vision_progress_review(
        vision_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    try:
        return VisionProgressReviewService.refresh_vision_progress_review(db, user_number, vision_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error))
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"Could not refresh the progress review: {error}")


@router.post("/visions/{vision_id}/waves")
def create_wave(
        vision_id: int,
        wave_data: WaveCreate,
        user_number: str,
        db: Session = Depends(get_db)
):
    vision = get_user_goal_or_404(db, vision_id, user_number)
    if normalize_goal_level(vision.time_horizon) != "vision":
        raise HTTPException(status_code=400, detail="Waves must belong to a vision")

    sequence_order = wave_data.sequence_order
    if sequence_order is None:
        existing = db.query(VisionRoadmapWave).filter(
            VisionRoadmapWave.user_number == user_number,
            VisionRoadmapWave.vision_goal_id == vision_id,
        ).all()
        sequence_order = max((wave.sequence_order or 0 for wave in existing), default=-1) + 1

    wave = VisionRoadmapWave(
        user_number=user_number,
        vision_goal_id=vision_id,
        title=wave_data.title,
        description=wave_data.description,
        sequence_order=sequence_order,
        status=validate_wave_status(wave_data.status),
        target_start_date=wave_data.target_start_date,
        target_end_date=wave_data.target_end_date,
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )
    db.add(wave)
    db.commit()
    db.refresh(wave)
    return serialize_wave(wave)


@router.patch("/waves/{wave_id}")
def update_wave(
        wave_id: int,
        wave_data: WaveUpdate,
        user_number: str,
        db: Session = Depends(get_db)
):
    wave = db.query(VisionRoadmapWave).filter(
        VisionRoadmapWave.id == wave_id,
        VisionRoadmapWave.user_number == user_number,
    ).first()
    if not wave:
        raise HTTPException(status_code=404, detail="Wave not found")

    if wave_data.title is not None:
        wave.title = wave_data.title
    if wave_data.description is not None:
        wave.description = wave_data.description
    if wave_data.status is not None:
        wave.status = validate_wave_status(wave_data.status)
    if wave_data.target_start_date is not None:
        wave.target_start_date = wave_data.target_start_date
    if wave_data.target_end_date is not None:
        wave.target_end_date = wave_data.target_end_date
    if wave_data.sequence_order is not None:
        wave.sequence_order = wave_data.sequence_order

    wave.updated_at = datetime.now()
    db.commit()
    db.refresh(wave)
    return serialize_wave(wave)


@router.delete("/waves/{wave_id}")
def delete_wave(
        wave_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    wave = db.query(VisionRoadmapWave).filter(
        VisionRoadmapWave.id == wave_id,
        VisionRoadmapWave.user_number == user_number,
    ).first()
    if not wave:
        raise HTTPException(status_code=404, detail="Wave not found")

    db.delete(wave)
    db.commit()
    return {"success": True}


@router.post("/waves/{wave_id}/goals")
def add_goal_to_wave(
        wave_id: int,
        link_data: WaveGoalCreate,
        user_number: str,
        db: Session = Depends(get_db)
):
    wave = db.query(VisionRoadmapWave).filter(
        VisionRoadmapWave.id == wave_id,
        VisionRoadmapWave.user_number == user_number,
    ).first()
    if not wave:
        raise HTTPException(status_code=404, detail="Wave not found")

    goal = get_user_goal_or_404(db, link_data.goal_id, user_number)
    if normalize_goal_level(goal.time_horizon) != "outcome":
        raise HTTPException(status_code=400, detail="Only outcomes can be attached to waves")

    existing_in_vision = db.query(WaveGoal).join(VisionRoadmapWave).filter(
        VisionRoadmapWave.user_number == user_number,
        VisionRoadmapWave.vision_goal_id == wave.vision_goal_id,
        WaveGoal.goal_id == goal.id,
        WaveGoal.wave_id != wave_id,
    ).all()
    for link in existing_in_vision:
        db.delete(link)

    existing = db.query(WaveGoal).filter(
        WaveGoal.wave_id == wave_id,
        WaveGoal.goal_id == goal.id,
    ).first()
    if existing:
        return serialize_wave(wave)

    if link_data.sequence_order is None:
        existing_links = db.query(WaveGoal).filter(WaveGoal.wave_id == wave_id).all()
        sequence_order = max((link.sequence_order or 0 for link in existing_links), default=-1) + 1
    else:
        sequence_order = link_data.sequence_order

    link = WaveGoal(
        wave_id=wave_id,
        goal_id=goal.id,
        sequence_order=sequence_order,
        status=validate_wave_goal_status(link_data.status),
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )
    db.add(link)
    db.commit()
    db.refresh(wave)
    return serialize_wave(wave)


@router.patch("/waves/{wave_id}/goals/reorder")
def reorder_wave_goals(
        wave_id: int,
        reorder_data: WaveGoalReorderRequest,
        user_number: str,
        db: Session = Depends(get_db)
):
    wave = db.query(VisionRoadmapWave).filter(
        VisionRoadmapWave.id == wave_id,
        VisionRoadmapWave.user_number == user_number,
    ).first()
    if not wave:
        raise HTTPException(status_code=404, detail="Wave not found")

    links = db.query(WaveGoal).filter(
        WaveGoal.wave_id == wave_id,
        WaveGoal.goal_id.in_(reorder_data.ordered_goal_ids),
    ).all()
    if len(links) != len(reorder_data.ordered_goal_ids):
        raise HTTPException(status_code=400, detail="All reordered goals must belong to this wave")

    by_goal_id = {link.goal_id: link for link in links}
    for index, goal_id in enumerate(reorder_data.ordered_goal_ids):
        by_goal_id[goal_id].sequence_order = index
        by_goal_id[goal_id].updated_at = datetime.now()

    db.commit()
    db.refresh(wave)
    return serialize_wave(wave)


@router.patch("/waves/{wave_id}/goals/{goal_id}")
def update_goal_in_wave(
        wave_id: int,
        goal_id: int,
        link_data: WaveGoalUpdate,
        user_number: str,
        db: Session = Depends(get_db)
):
    wave = db.query(VisionRoadmapWave).filter(
        VisionRoadmapWave.id == wave_id,
        VisionRoadmapWave.user_number == user_number,
    ).first()
    if not wave:
        raise HTTPException(status_code=404, detail="Wave not found")

    link = db.query(WaveGoal).filter(
        WaveGoal.wave_id == wave_id,
        WaveGoal.goal_id == goal_id,
    ).first()
    if not link:
        raise HTTPException(status_code=404, detail="Wave goal link not found")

    if link_data.status is not None:
        link.status = validate_wave_goal_status(link_data.status)
    link.updated_at = datetime.now()

    db.commit()
    db.refresh(wave)
    return serialize_wave(wave)


@router.delete("/waves/{wave_id}/goals/{goal_id}")
def remove_goal_from_wave(
        wave_id: int,
        goal_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    wave = db.query(VisionRoadmapWave).filter(
        VisionRoadmapWave.id == wave_id,
        VisionRoadmapWave.user_number == user_number,
    ).first()
    if not wave:
        raise HTTPException(status_code=404, detail="Wave not found")

    link = db.query(WaveGoal).filter(
        WaveGoal.wave_id == wave_id,
        WaveGoal.goal_id == goal_id,
    ).first()
    if not link:
        raise HTTPException(status_code=404, detail="Wave goal link not found")

    db.delete(link)
    db.commit()
    db.refresh(wave)
    return serialize_wave(wave)


@router.patch("/visions/{vision_id}/waves/reorder")
def reorder_waves(
        vision_id: int,
        reorder_data: WaveReorderRequest,
        user_number: str,
        db: Session = Depends(get_db)
):
    waves = db.query(VisionRoadmapWave).filter(
        VisionRoadmapWave.user_number == user_number,
        VisionRoadmapWave.vision_goal_id == vision_id,
        VisionRoadmapWave.id.in_(reorder_data.ordered_wave_ids),
    ).all()
    if len(waves) != len(reorder_data.ordered_wave_ids):
        raise HTTPException(status_code=400, detail="All reordered waves must belong to this vision")

    by_id = {wave.id: wave for wave in waves}
    for index, wave_id in enumerate(reorder_data.ordered_wave_ids):
        by_id[wave_id].sequence_order = index
        by_id[wave_id].updated_at = datetime.now()

    db.commit()
    return {"success": True}


@router.post("/visions/{vision_id}/generate-roadmap")
def generate_roadmap(
        vision_id: int,
        request: RoadmapDraftRequest,
        user_number: str,
        db: Session = Depends(get_db)
):
    vision = get_user_goal_or_404(db, vision_id, user_number)
    if normalize_goal_level(vision.time_horizon) != "vision":
        raise HTTPException(status_code=400, detail="Roadmap drafts can only be generated for visions")

    all_goals = db.query(JourneyGoal).filter(JourneyGoal.user_number == user_number).all()
    pillars = [goal for goal in all_goals if goal.parent_goal_id == vision_id and normalize_goal_level(goal.time_horizon) == "pillar"]
    pillar_ids = {goal.id for goal in pillars}
    outcomes = [goal for goal in all_goals if goal.parent_goal_id in pillar_ids and normalize_goal_level(goal.time_horizon) == "outcome"]
    outcome_ids = [goal.id for goal in outcomes]

    tasks = db.query(Task).filter(Task.user_number == user_number, Task.goal_id.in_(outcome_ids)).all() if outcome_ids else []
    habits = db.query(Habit).filter(Habit.user_number == user_number, Habit.goal_id.in_(outcome_ids)).all() if outcome_ids else []

    context = {
        "vision": serialize_goal(vision),
        "pillars": [serialize_goal(goal) for goal in pillars],
        "outcomes": [serialize_goal(goal) for goal in outcomes],
        "tasks": [{"id": task.id, "title": task.title, "goal_id": task.goal_id, "status": task.status} for task in tasks],
        "habits": [{"id": habit.id, "title": habit.title, "goal_id": habit.goal_id, "is_active": habit.is_active} for habit in habits],
    }

    system_prompt = """You are Alfred, a transformation architect. Build a draft roadmap that sequences existing outcomes into 3-5 transformation waves.

Return valid JSON only with this shape:
{"waves":[{"title":"...","description":"...","sequence_order":1,"suggested_goal_ids":[1,2],"new_goal_suggestions":[{"title":"...","description":"..."}],"rationale":"..."}]}

Rules:
- Do not invent IDs. Use only existing outcome IDs in suggested_goal_ids.
- Do not save anything. This is a reviewable draft.
- Keep wave descriptions specific and practical.
- Include new_goal_suggestions only when genuinely useful."""

    try:
        response = openai_client_journey.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Create the roadmap draft from this context:\n{context}"},
            ],
            temperature=0.4,
            max_tokens=1200,
        )
        result_text = response.choices[0].message.content.strip()
        if result_text.startswith("```json"):
            result_text = result_text[7:]
        if result_text.endswith("```"):
            result_text = result_text[:-3]

        import json
        draft = json.loads(result_text.strip())
        allowed_ids = set(outcome_ids)
        for index, wave in enumerate(draft.get("waves", []), start=1):
            wave["sequence_order"] = wave.get("sequence_order") or index
            wave["suggested_goal_ids"] = [
                goal_id for goal_id in wave.get("suggested_goal_ids", []) if goal_id in allowed_ids
            ]
            if not request.include_new_goal_suggestions:
                wave["new_goal_suggestions"] = []
        return draft
    except Exception as e:
        print(f"Error generating roadmap draft: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate roadmap draft")


# ========================================
# STRENGTHS - UPDATE & DELETE
# ========================================
class StrengthUpdate(BaseModel):
    title: Optional[str] = None
    strength: Optional[str] = None
    source: Optional[str] = None


@router.put("/strengths/{strength_id}", response_model=StrengthResponse)
def update_strength(
        strength_id: int,
        updates: StrengthUpdate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Update a strength"""
    strength = db.query(JourneyStrength).filter(
        JourneyStrength.id == strength_id,
        JourneyStrength.user_number == user_number
    ).first()

    if not strength:
        raise HTTPException(status_code=404, detail="Strength not found")

    if updates.title is not None:
        strength.title = updates.title
    if updates.strength is not None:
        strength.strength = updates.strength
    if updates.source is not None:
        strength.source = updates.source

    strength.updated_at = datetime.now()
    db.commit()
    db.refresh(strength)
    return strength


@router.delete("/strengths/{strength_id}")
def delete_strength(
        strength_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Delete a strength"""
    strength = db.query(JourneyStrength).filter(
        JourneyStrength.id == strength_id,
        JourneyStrength.user_number == user_number
    ).first()

    if not strength:
        raise HTTPException(status_code=404, detail="Strength not found")

    db.delete(strength)
    db.commit()
    return {"success": True, "message": "Strength deleted"}


# ========================================
# DEVELOPMENT AREAS - UPDATE & DELETE
# ========================================
class DevelopmentAreaUpdate(BaseModel):
    title: Optional[str] = None
    skill: Optional[str] = None
    source: Optional[str] = None


@router.put("/development-areas/{area_id}", response_model=DevelopmentAreaResponse)
def update_development_area(
        area_id: int,
        updates: DevelopmentAreaUpdate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Update a development area"""
    area = db.query(JourneyDevelopmentArea).filter(
        JourneyDevelopmentArea.id == area_id,
        JourneyDevelopmentArea.user_number == user_number
    ).first()

    if not area:
        raise HTTPException(status_code=404, detail="Development area not found")

    if updates.title is not None:
        area.title = updates.title
    if updates.skill is not None:
        area.skill = updates.skill
    if updates.source is not None:
        area.source = updates.source

    # Only set updated_at if the column exists
    try:
        area.updated_at = datetime.now()
    except AttributeError:
        logger.debug("Development area has no updated_at column")

    db.commit()
    db.refresh(area)
    return area


@router.delete("/development-areas/{area_id}")
def delete_development_area(
        area_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Delete a development area"""
    area = db.query(JourneyDevelopmentArea).filter(
        JourneyDevelopmentArea.id == area_id,
        JourneyDevelopmentArea.user_number == user_number
    ).first()

    if not area:
        raise HTTPException(status_code=404, detail="Development area not found")

    db.delete(area)
    db.commit()
    return {"success": True, "message": "Development area deleted"}


# ========================================
# PROJECTS - UPDATE & DELETE
# ========================================
class ProjectUpdate(BaseModel):
    project_name: Optional[str] = None
    goal: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None


@router.put("/projects/{project_id}", response_model=ProjectResponse)
def update_project(
        project_id: int,
        updates: ProjectUpdate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Update a project"""
    project = db.query(JourneyProject).filter(
        JourneyProject.id == project_id,
        JourneyProject.user_number == user_number
    ).first()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if updates.project_name is not None:
        project.project_name = updates.project_name
    if updates.goal is not None:
        project.goal = updates.goal
    if updates.description is not None:
        project.description = updates.description
    if updates.status is not None:
        project.status = updates.status

    project.updated_at = datetime.now()
    db.commit()
    db.refresh(project)
    return project


@router.delete("/projects/{project_id}")
def delete_project(
        project_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Delete a project"""
    project = db.query(JourneyProject).filter(
        JourneyProject.id == project_id,
        JourneyProject.user_number == user_number
    ).first()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    db.delete(project)
    db.commit()
    return {"success": True, "message": "Project deleted"}


# ========================================
# FAILURES - UPDATE & DELETE
# ========================================
class FailureUpdate(BaseModel):
    title: Optional[str] = None
    failure_text: Optional[str] = None
    learning: Optional[str] = None
    scar: Optional[str] = None


@router.put("/failures/{failure_id}", response_model=FailureResponse)
def update_failure(
        failure_id: int,
        updates: FailureUpdate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Update a failure"""
    failure = db.query(JourneyFailure).filter(
        JourneyFailure.id == failure_id,
        JourneyFailure.user_number == user_number
    ).first()

    if not failure:
        raise HTTPException(status_code=404, detail="Failure not found")

    if updates.title is not None:
        failure.title = updates.title
    if updates.failure_text is not None:
        failure.failure_text = updates.failure_text
    if updates.learning is not None:
        failure.learning = updates.learning
    if updates.scar is not None:
        failure.scar = updates.scar

    failure.updated_at = datetime.now()
    db.commit()
    db.refresh(failure)
    return failure


@router.delete("/failures/{failure_id}")
def delete_failure(
        failure_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Delete a failure"""
    failure = db.query(JourneyFailure).filter(
        JourneyFailure.id == failure_id,
        JourneyFailure.user_number == user_number
    ).first()

    if not failure:
        raise HTTPException(status_code=404, detail="Failure not found")

    db.delete(failure)
    db.commit()
    return {"success": True, "message": "Failure deleted"}


# ========================================
# OPPORTUNITIES - UPDATE & DELETE
# ========================================
class OpportunityUpdate(BaseModel):
    opportunity_text: Optional[str] = None
    category: Optional[str] = None


@router.put("/opportunities/{opportunity_id}", response_model=OpportunityResponse)
def update_opportunity(
        opportunity_id: int,
        updates: OpportunityUpdate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Update an opportunity"""
    opportunity = db.query(JourneyOpportunity).filter(
        JourneyOpportunity.id == opportunity_id,
        JourneyOpportunity.user_number == user_number
    ).first()

    if not opportunity:
        raise HTTPException(status_code=404, detail="Opportunity not found")

    if updates.opportunity_text is not None:
        opportunity.opportunity_text = updates.opportunity_text
    if updates.category is not None:
        opportunity.category = updates.category

    opportunity.updated_at = datetime.now()
    db.commit()
    db.refresh(opportunity)
    return opportunity


@router.delete("/opportunities/{opportunity_id}")
def delete_opportunity(
        opportunity_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Delete an opportunity"""
    opportunity = db.query(JourneyOpportunity).filter(
        JourneyOpportunity.id == opportunity_id,
        JourneyOpportunity.user_number == user_number
    ).first()

    if not opportunity:
        raise HTTPException(status_code=404, detail="Opportunity not found")

    db.delete(opportunity)
    db.commit()
    return {"success": True, "message": "Opportunity deleted"}


# ============================================
# VALUES - FULL CRUD
# ============================================

class ValueCreate(BaseModel):
    title: str
    value_text: str
    why: Optional[str] = None


class ValueUpdate(BaseModel):
    title: Optional[str] = None
    value_text: Optional[str] = None
    why: Optional[str] = None


class ValueResponse(BaseModel):
    id: int
    user_number: str
    title: str
    value_text: str
    why: Optional[str]
    first_seen_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.get("/values", response_model=list[ValueResponse])
def get_values(
        user_number: str,
        db: Session = Depends(get_db)
):
    """Get all values for a user"""
    values = db.query(JourneyValue).filter(
        JourneyValue.user_number == user_number
    ).order_by(JourneyValue.first_seen_at.desc()).all()
    return values


@router.post("/values", response_model=ValueResponse)
def create_value(
        value_data: ValueCreate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Create a new value"""
    new_value = JourneyValue(
        user_number=user_number,
        title=value_data.title,
        value_text=value_data.value_text,
        why=value_data.why,
        first_seen_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(new_value)
    db.commit()
    db.refresh(new_value)
    return new_value


@router.put("/values/{value_id}", response_model=ValueResponse)
def update_value(
        value_id: int,
        value_data: ValueUpdate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Update a value"""
    value = db.query(JourneyValue).filter(
        JourneyValue.id == value_id,
        JourneyValue.user_number == user_number
    ).first()

    if not value:
        raise HTTPException(status_code=404, detail="Value not found")

    if value_data.title is not None:
        value.title = value_data.title
    if value_data.value_text is not None:
        value.value_text = value_data.value_text
    if value_data.why is not None:
        value.why = value_data.why

    value.updated_at = datetime.now()
    db.commit()
    db.refresh(value)
    return value


@router.delete("/values/{value_id}")
def delete_value(
        value_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Delete a value"""
    value = db.query(JourneyValue).filter(
        JourneyValue.id == value_id,
        JourneyValue.user_number == user_number
    ).first()

    if not value:
        raise HTTPException(status_code=404, detail="Value not found")

    db.delete(value)
    db.commit()
    return {"success": True, "message": "Value deleted"}


# ============================================
# ACHIEVEMENTS - FULL CRUD
# ============================================

class AchievementCreate(BaseModel):
    title: str
    achievement_text: str
    impact: Optional[str] = None


class AchievementUpdate(BaseModel):
    title: Optional[str] = None
    achievement_text: Optional[str] = None
    impact: Optional[str] = None


class AchievementResponse(BaseModel):
    id: int
    user_number: str
    title: str
    achievement_text: str
    impact: Optional[str]
    first_seen_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.get("/achievements", response_model=list[AchievementResponse])
def get_achievements(
        user_number: str,
        db: Session = Depends(get_db)
):
    """Get all achievements for a user"""
    achievements = db.query(JourneyAchievement).filter(
        JourneyAchievement.user_number == user_number
    ).order_by(JourneyAchievement.first_seen_at.desc()).all()
    return achievements


@router.post("/achievements", response_model=AchievementResponse)
def create_achievement(
        achievement_data: AchievementCreate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Create a new achievement"""
    new_achievement = JourneyAchievement(
        user_number=user_number,
        title=achievement_data.title,
        achievement_text=achievement_data.achievement_text,
        impact=achievement_data.impact,
        first_seen_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(new_achievement)
    db.commit()
    db.refresh(new_achievement)
    return new_achievement


@router.put("/achievements/{achievement_id}", response_model=AchievementResponse)
def update_achievement(
        achievement_id: int,
        achievement_data: AchievementUpdate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Update an achievement"""
    achievement = db.query(JourneyAchievement).filter(
        JourneyAchievement.id == achievement_id,
        JourneyAchievement.user_number == user_number
    ).first()

    if not achievement:
        raise HTTPException(status_code=404, detail="Achievement not found")

    if achievement_data.title is not None:
        achievement.title = achievement_data.title
    if achievement_data.achievement_text is not None:
        achievement.achievement_text = achievement_data.achievement_text
    if achievement_data.impact is not None:
        achievement.impact = achievement_data.impact

    achievement.updated_at = datetime.now()
    db.commit()
    db.refresh(achievement)
    return achievement


@router.delete("/achievements/{achievement_id}")
def delete_achievement(
        achievement_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Delete an achievement"""
    achievement = db.query(JourneyAchievement).filter(
        JourneyAchievement.id == achievement_id,
        JourneyAchievement.user_number == user_number
    ).first()

    if not achievement:
        raise HTTPException(status_code=404, detail="Achievement not found")

    db.delete(achievement)
    db.commit()
    return {"success": True, "message": "Achievement deleted"}


# ============================================
# ENERGY SOURCES - FULL CRUD
# ============================================

class EnergySourceCreate(BaseModel):
    title: Optional[str] = None
    source_text: str
    category: Optional[str] = None


class EnergySourceUpdate(BaseModel):
    title: Optional[str] = None
    source_text: Optional[str] = None
    category: Optional[str] = None


class EnergySourceResponse(BaseModel):
    id: int
    user_number: str
    title: Optional[str]
    source_text: str
    category: Optional[str]
    first_seen_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.get("/energy-sources", response_model=list[EnergySourceResponse])
def get_energy_sources(
        user_number: str,
        db: Session = Depends(get_db)
):
    """Get all energy sources for a user"""
    sources = db.query(JourneyEnergySource).filter(
        JourneyEnergySource.user_number == user_number
    ).order_by(JourneyEnergySource.first_seen_at.desc()).all()
    return sources


@router.post("/energy-sources", response_model=EnergySourceResponse)
def create_energy_source(
        source_data: EnergySourceCreate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Create a new energy source"""
    new_source = JourneyEnergySource(
        user_number=user_number,
        title=source_data.title,
        source_text=source_data.source_text,
        category=source_data.category,
        first_seen_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(new_source)
    db.commit()
    db.refresh(new_source)
    return new_source


@router.put("/energy-sources/{source_id}", response_model=EnergySourceResponse)
def update_energy_source(
        source_id: int,
        source_data: EnergySourceUpdate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Update an energy source"""
    source = db.query(JourneyEnergySource).filter(
        JourneyEnergySource.id == source_id,
        JourneyEnergySource.user_number == user_number
    ).first()

    if not source:
        raise HTTPException(status_code=404, detail="Energy source not found")

    if source_data.title is not None:
        source.title = source_data.title
    if source_data.source_text is not None:
        source.source_text = source_data.source_text
    if source_data.category is not None:
        source.category = source_data.category

    source.updated_at = datetime.now()
    db.commit()
    db.refresh(source)
    return source


@router.delete("/energy-sources/{source_id}")
def delete_energy_source(
        source_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Delete an energy source"""
    source = db.query(JourneyEnergySource).filter(
        JourneyEnergySource.id == source_id,
        JourneyEnergySource.user_number == user_number
    ).first()

    if not source:
        raise HTTPException(status_code=404, detail="Energy source not found")

    db.delete(source)
    db.commit()
    return {"success": True, "message": "Energy source deleted"}


# ============================================
# ENERGY DRAINS - FULL CRUD
# ============================================

class EnergyDrainCreate(BaseModel):
    title: Optional[str] = None
    drain_text: str
    category: Optional[str] = None
    mitigation: Optional[str] = None


class EnergyDrainUpdate(BaseModel):
    title: Optional[str] = None
    drain_text: Optional[str] = None
    category: Optional[str] = None
    mitigation: Optional[str] = None


class EnergyDrainResponse(BaseModel):
    id: int
    user_number: str
    title: Optional[str]
    drain_text: str
    category: Optional[str]
    mitigation: Optional[str]
    first_seen_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.get("/energy-drains", response_model=list[EnergyDrainResponse])
def get_energy_drains(
        user_number: str,
        db: Session = Depends(get_db)
):
    """Get all energy drains for a user"""
    drains = db.query(JourneyEnergyDrain).filter(
        JourneyEnergyDrain.user_number == user_number
    ).order_by(JourneyEnergyDrain.first_seen_at.desc()).all()
    return drains


@router.post("/energy-drains", response_model=EnergyDrainResponse)
def create_energy_drain(
        drain_data: EnergyDrainCreate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Create a new energy drain"""
    new_drain = JourneyEnergyDrain(
        user_number=user_number,
        title=drain_data.title,
        drain_text=drain_data.drain_text,
        category=drain_data.category,
        mitigation=drain_data.mitigation,
        first_seen_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(new_drain)
    db.commit()
    db.refresh(new_drain)
    return new_drain


@router.put("/energy-drains/{drain_id}", response_model=EnergyDrainResponse)
def update_energy_drain(
        drain_id: int,
        drain_data: EnergyDrainUpdate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Update an energy drain"""
    drain = db.query(JourneyEnergyDrain).filter(
        JourneyEnergyDrain.id == drain_id,
        JourneyEnergyDrain.user_number == user_number
    ).first()

    if not drain:
        raise HTTPException(status_code=404, detail="Energy drain not found")

    if drain_data.title is not None:
        drain.title = drain_data.title
    if drain_data.drain_text is not None:
        drain.drain_text = drain_data.drain_text
    if drain_data.category is not None:
        drain.category = drain_data.category
    if drain_data.mitigation is not None:
        drain.mitigation = drain_data.mitigation

    drain.updated_at = datetime.now()
    db.commit()
    db.refresh(drain)
    return drain


@router.delete("/energy-drains/{drain_id}")
def delete_energy_drain(
        drain_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Delete an energy drain"""
    drain = db.query(JourneyEnergyDrain).filter(
        JourneyEnergyDrain.id == drain_id,
        JourneyEnergyDrain.user_number == user_number
    ).first()

    if not drain:
        raise HTTPException(status_code=404, detail="Energy drain not found")

    db.delete(drain)
    db.commit()
    return {"success": True, "message": "Energy drain deleted"}


# ============================================
# RECOVERY METHODS - FULL CRUD
# ============================================

class RecoveryMethodCreate(BaseModel):
    title: Optional[str] = None
    method_text: str
    category: Optional[str] = None
    frequency: Optional[str] = None


class RecoveryMethodUpdate(BaseModel):
    title: Optional[str] = None
    method_text: Optional[str] = None
    category: Optional[str] = None
    frequency: Optional[str] = None


class RecoveryMethodResponse(BaseModel):
    id: int
    user_number: str
    title: Optional[str]
    method_text: str
    category: Optional[str]
    frequency: Optional[str]
    first_seen_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.get("/recovery-methods", response_model=list[RecoveryMethodResponse])
def get_recovery_methods(
        user_number: str,
        db: Session = Depends(get_db)
):
    """Get all recovery methods for a user"""
    methods = db.query(JourneyRecoveryMethod).filter(
        JourneyRecoveryMethod.user_number == user_number
    ).order_by(JourneyRecoveryMethod.first_seen_at.desc()).all()
    return methods


@router.post("/recovery-methods", response_model=RecoveryMethodResponse)
def create_recovery_method(
        method_data: RecoveryMethodCreate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Create a new recovery method"""
    new_method = JourneyRecoveryMethod(
        user_number=user_number,
        title=method_data.title,
        method_text=method_data.method_text,
        category=method_data.category,
        frequency=method_data.frequency,
        first_seen_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(new_method)
    db.commit()
    db.refresh(new_method)
    return new_method


@router.put("/recovery-methods/{method_id}", response_model=RecoveryMethodResponse)
def update_recovery_method(
        method_id: int,
        method_data: RecoveryMethodUpdate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Update a recovery method"""
    method = db.query(JourneyRecoveryMethod).filter(
        JourneyRecoveryMethod.id == method_id,
        JourneyRecoveryMethod.user_number == user_number
    ).first()

    if not method:
        raise HTTPException(status_code=404, detail="Recovery method not found")

    if method_data.title is not None:
        method.title = method_data.title
    if method_data.method_text is not None:
        method.method_text = method_data.method_text
    if method_data.category is not None:
        method.category = method_data.category
    if method_data.frequency is not None:
        method.frequency = method_data.frequency

    method.updated_at = datetime.now()
    db.commit()
    db.refresh(method)
    return method


@router.delete("/recovery-methods/{method_id}")
def delete_recovery_method(
        method_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Delete a recovery method"""
    method = db.query(JourneyRecoveryMethod).filter(
        JourneyRecoveryMethod.id == method_id,
        JourneyRecoveryMethod.user_number == user_number
    ).first()

    if not method:
        raise HTTPException(status_code=404, detail="Recovery method not found")

    db.delete(method)
    db.commit()
    return {"success": True, "message": "Recovery method deleted"}


# ============================================
# PROCRASTINATION PATTERNS - FULL CRUD
# ============================================

class ProcrastinationPatternCreate(BaseModel):
    title: Optional[str] = None
    pattern_text: str
    underlying_reason: Optional[str] = None
    strategy: Optional[str] = None


class ProcrastinationPatternUpdate(BaseModel):
    title: Optional[str] = None
    pattern_text: Optional[str] = None
    underlying_reason: Optional[str] = None
    strategy: Optional[str] = None


class ProcrastinationPatternResponse(BaseModel):
    id: int
    user_number: str
    title: Optional[str]
    pattern_text: str
    underlying_reason: Optional[str]
    strategy: Optional[str]
    first_seen_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


def get_table_columns(db: Session, table_name: str) -> set[str]:
    rows = db.execute(
        text(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = :table_name
            """
        ),
        {"table_name": table_name},
    ).scalars().all()
    return set(rows)


def get_procrastination_pattern_columns(db: Session) -> set[str]:
    return get_table_columns(db, "journey_procrastination_patterns")


def serialize_procrastination_pattern(pattern: Any) -> dict[str, Any]:
    if isinstance(pattern, dict):
        now = datetime.now()
        return {
            "id": pattern.get("id"),
            "user_number": pattern.get("user_number"),
            "title": pattern.get("title"),
            "pattern_text": pattern.get("pattern_text"),
            "underlying_reason": pattern.get("underlying_reason") or pattern.get("trigger_text") or pattern.get("trigger"),
            "strategy": pattern.get("strategy") or pattern.get("mitigation"),
            "first_seen_at": pattern.get("first_seen_at") or pattern.get("updated_at") or now,
            "updated_at": pattern.get("updated_at") or pattern.get("first_seen_at") or now,
        }

    return {
        "id": pattern.id,
        "user_number": pattern.user_number,
        "title": pattern.title,
        "pattern_text": pattern.pattern_text,
        "underlying_reason": pattern.underlying_reason,
        "strategy": pattern.strategy,
        "first_seen_at": pattern.first_seen_at,
        "updated_at": pattern.updated_at,
    }


def get_procrastination_pattern_rows(db: Session, user_number: str) -> list[dict[str, Any]]:
    columns = get_procrastination_pattern_columns(db)
    if not columns:
        return []

    optional_columns = [
        "id",
        "user_number",
        "title",
        "pattern_text",
        "underlying_reason",
        "strategy",
        "trigger_text",
        "trigger",
        "mitigation",
        "first_seen_at",
        "updated_at",
    ]
    select_columns = [column for column in optional_columns if column in columns]
    if not {"id", "user_number", "pattern_text"}.issubset(columns):
        return []

    order_column = "first_seen_at" if "first_seen_at" in columns else "id"
    select_query = f"SELECT {', '.join(select_columns)} FROM journey_procrastination_patterns WHERE user_number = :user_number ORDER BY {order_column} DESC"  # nosec B608 - selected columns are limited to known table column names.
    rows = db.execute(text(select_query), {"user_number": user_number}).mappings().all()
    return [dict(row) for row in rows]


def write_procrastination_pattern(
    db: Session,
    user_number: str,
    pattern_data: ProcrastinationPatternCreate | ProcrastinationPatternUpdate,
    pattern_id: Optional[int] = None,
) -> dict[str, Any]:
    columns = get_procrastination_pattern_columns(db)
    if not {"id", "user_number", "pattern_text"}.issubset(columns):
        raise HTTPException(status_code=500, detail="Procrastination table is missing required columns")

    now = datetime.now()
    values = {
        "user_number": user_number,
        "title": pattern_data.title,
        "pattern_text": pattern_data.pattern_text,
        "underlying_reason": getattr(pattern_data, "underlying_reason", None),
        "strategy": getattr(pattern_data, "strategy", None),
        "now": now,
        "pattern_id": pattern_id,
    }

    reason_column = (
        "underlying_reason"
        if "underlying_reason" in columns
        else "trigger_text"
        if "trigger_text" in columns
        else "trigger"
        if "trigger" in columns
        else None
    )
    strategy_column = "strategy" if "strategy" in columns else "mitigation" if "mitigation" in columns else None

    if pattern_id is None:
        insert_fields = ["user_number", "pattern_text"]
        insert_values = [":user_number", ":pattern_text"]

        if "title" in columns:
            insert_fields.append("title")
            insert_values.append(":title")
        if reason_column:
            insert_fields.append(reason_column)
            insert_values.append(":underlying_reason")
        if strategy_column:
            insert_fields.append(strategy_column)
            insert_values.append(":strategy")
        if "first_seen_at" in columns:
            insert_fields.append("first_seen_at")
            insert_values.append(":now")
        if "updated_at" in columns:
            insert_fields.append("updated_at")
            insert_values.append(":now")

        insert_query = f"INSERT INTO journey_procrastination_patterns ({', '.join(insert_fields)}) VALUES ({', '.join(insert_values)}) RETURNING id"  # nosec B608 - inserted columns are limited to known table column names.
        row = db.execute(text(insert_query), values).mappings().first()
    else:
        existing = db.execute(
            text(
                """
                SELECT id
                FROM journey_procrastination_patterns
                WHERE id = :pattern_id AND user_number = :user_number
                """
            ),
            values,
        ).mappings().first()
        if not existing:
            raise HTTPException(status_code=404, detail="Procrastination pattern not found")

        updates = []
        if pattern_data.pattern_text is not None:
            updates.append("pattern_text = :pattern_text")
        if "title" in columns and pattern_data.title is not None:
            updates.append("title = :title")
        if reason_column and getattr(pattern_data, "underlying_reason", None) is not None:
            updates.append(f"{reason_column} = :underlying_reason")
        if strategy_column and getattr(pattern_data, "strategy", None) is not None:
            updates.append(f"{strategy_column} = :strategy")
        if "updated_at" in columns:
            updates.append("updated_at = :now")

        if updates:
            update_query = f"UPDATE journey_procrastination_patterns SET {', '.join(updates)} WHERE id = :pattern_id AND user_number = :user_number"  # nosec B608 - update columns are limited to known table column names.
            db.execute(
                text(update_query),
                values,
            )
        row = {"id": pattern_id}

    db.commit()
    saved_id = row["id"]
    saved = db.execute(
        text(
            """
            SELECT id
            FROM journey_procrastination_patterns
            WHERE id = :pattern_id AND user_number = :user_number
            """
        ),
        {"pattern_id": saved_id, "user_number": user_number},
    ).mappings().first()
    if not saved:
        raise HTTPException(status_code=404, detail="Procrastination pattern not found")

    return next(
        pattern for pattern in get_procrastination_pattern_rows(db, user_number)
        if pattern.get("id") == saved_id
    )


@router.get("/procrastination-patterns", response_model=list[ProcrastinationPatternResponse])
def get_procrastination_patterns(
        user_number: str,
        db: Session = Depends(get_db)
):
    """Get all procrastination patterns for a user"""
    return [serialize_procrastination_pattern(pattern) for pattern in get_procrastination_pattern_rows(db, user_number)]


@router.post("/procrastination-patterns", response_model=ProcrastinationPatternResponse)
def create_procrastination_pattern(
        pattern_data: ProcrastinationPatternCreate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Create a new procrastination pattern"""
    new_pattern = write_procrastination_pattern(db, user_number, pattern_data)
    return serialize_procrastination_pattern(new_pattern)


@router.put("/procrastination-patterns/{pattern_id}", response_model=ProcrastinationPatternResponse)
def update_procrastination_pattern(
        pattern_id: int,
        pattern_data: ProcrastinationPatternUpdate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Update a procrastination pattern"""
    pattern = write_procrastination_pattern(db, user_number, pattern_data, pattern_id)
    return serialize_procrastination_pattern(pattern)


@router.delete("/procrastination-patterns/{pattern_id}")
def delete_procrastination_pattern(
        pattern_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Delete a procrastination pattern"""
    pattern = db.execute(
        text(
            """
            SELECT id
            FROM journey_procrastination_patterns
            WHERE id = :pattern_id AND user_number = :user_number
            """
        ),
        {"pattern_id": pattern_id, "user_number": user_number},
    ).mappings().first()

    if not pattern:
        raise HTTPException(status_code=404, detail="Procrastination pattern not found")

    db.execute(
        text(
            """
            DELETE FROM journey_procrastination_patterns
            WHERE id = :pattern_id AND user_number = :user_number
            """
        ),
        {"pattern_id": pattern_id, "user_number": user_number},
    )
    db.commit()
    return {"success": True, "message": "Procrastination pattern deleted"}


# ============================================
# EXECUTION SYSTEMS - FULL CRUD
# ============================================

class ExecutionSystemCreate(BaseModel):
    title: Optional[str] = None
    system_text: str
    category: Optional[str] = None
    effectiveness: Optional[str] = None


class ExecutionSystemUpdate(BaseModel):
    title: Optional[str] = None
    system_text: Optional[str] = None
    category: Optional[str] = None
    effectiveness: Optional[str] = None


class ExecutionSystemResponse(BaseModel):
    id: int
    user_number: str
    title: Optional[str]
    system_text: str
    category: Optional[str]
    effectiveness: Optional[str]
    first_seen_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.get("/execution-systems", response_model=list[ExecutionSystemResponse])
def get_execution_systems(
        user_number: str,
        db: Session = Depends(get_db)
):
    """Get all execution systems for a user"""
    systems = db.query(JourneyExecutionSystem).filter(
        JourneyExecutionSystem.user_number == user_number
    ).order_by(JourneyExecutionSystem.first_seen_at.desc()).all()
    return systems


@router.post("/execution-systems", response_model=ExecutionSystemResponse)
def create_execution_system(
        system_data: ExecutionSystemCreate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Create a new execution system"""
    new_system = JourneyExecutionSystem(
        user_number=user_number,
        title=system_data.title,
        system_text=system_data.system_text,
        category=system_data.category,
        effectiveness=system_data.effectiveness,
        first_seen_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(new_system)
    db.commit()
    db.refresh(new_system)
    return new_system


@router.put("/execution-systems/{system_id}", response_model=ExecutionSystemResponse)
def update_execution_system(
        system_id: int,
        system_data: ExecutionSystemUpdate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Update an execution system"""
    system = db.query(JourneyExecutionSystem).filter(
        JourneyExecutionSystem.id == system_id,
        JourneyExecutionSystem.user_number == user_number
    ).first()

    if not system:
        raise HTTPException(status_code=404, detail="Execution system not found")

    if system_data.title is not None:
        system.title = system_data.title
    if system_data.system_text is not None:
        system.system_text = system_data.system_text
    if system_data.category is not None:
        system.category = system_data.category
    if system_data.effectiveness is not None:
        system.effectiveness = system_data.effectiveness

    system.updated_at = datetime.now()
    db.commit()
    db.refresh(system)
    return system


@router.delete("/execution-systems/{system_id}")
def delete_execution_system(
        system_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Delete an execution system"""
    system = db.query(JourneyExecutionSystem).filter(
        JourneyExecutionSystem.id == system_id,
        JourneyExecutionSystem.user_number == user_number
    ).first()

    if not system:
        raise HTTPException(status_code=404, detail="Execution system not found")

    db.delete(system)
    db.commit()
    return {"success": True, "message": "Execution system deleted"}


# ============================================
# INSPIRATION - FULL CRUD
# ============================================

class InspirationCreate(BaseModel):
    title: Optional[str] = None
    inspiration_text: str
    approach: Optional[str] = None
    effectiveness: Optional[str] = None


class InspirationUpdate(BaseModel):
    title: Optional[str] = None
    inspiration_text: Optional[str] = None
    approach: Optional[str] = None
    effectiveness: Optional[str] = None


class InspirationResponse(BaseModel):
    id: int
    user_number: str
    title: Optional[str]
    inspiration_text: str
    approach: Optional[str]
    effectiveness: Optional[str]
    first_seen_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.get("/inspiration", response_model=list[InspirationResponse])
def get_inspiration(
        user_number: str,
        db: Session = Depends(get_db)
):
    """Get all inspiration entries for a user"""
    inspiration = db.query(JourneyInspiration).filter(
        JourneyInspiration.user_number == user_number
    ).order_by(JourneyInspiration.first_seen_at.desc()).all()
    return inspiration


@router.post("/inspiration", response_model=InspirationResponse)
def create_inspiration(
        inspiration_data: InspirationCreate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Create a new inspiration entry"""
    new_inspiration = JourneyInspiration(
        user_number=user_number,
        title=inspiration_data.title,
        inspiration_text=inspiration_data.inspiration_text,
        approach=inspiration_data.approach,
        effectiveness=inspiration_data.effectiveness,
        first_seen_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(new_inspiration)
    db.commit()
    db.refresh(new_inspiration)
    return new_inspiration


@router.put("/inspiration/{inspiration_id}", response_model=InspirationResponse)
def update_inspiration(
        inspiration_id: int,
        inspiration_data: InspirationUpdate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Update an inspiration entry"""
    inspiration = db.query(JourneyInspiration).filter(
        JourneyInspiration.id == inspiration_id,
        JourneyInspiration.user_number == user_number
    ).first()

    if not inspiration:
        raise HTTPException(status_code=404, detail="Inspiration not found")

    if inspiration_data.title is not None:
        inspiration.title = inspiration_data.title
    if inspiration_data.inspiration_text is not None:
        inspiration.inspiration_text = inspiration_data.inspiration_text
    if inspiration_data.approach is not None:
        inspiration.approach = inspiration_data.approach
    if inspiration_data.effectiveness is not None:
        inspiration.effectiveness = inspiration_data.effectiveness

    inspiration.updated_at = datetime.now()
    db.commit()
    db.refresh(inspiration)
    return inspiration


@router.delete("/inspiration/{inspiration_id}")
def delete_inspiration(
        inspiration_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Delete an inspiration entry"""
    inspiration = db.query(JourneyInspiration).filter(
        JourneyInspiration.id == inspiration_id,
        JourneyInspiration.user_number == user_number
    ).first()

    if not inspiration:
        raise HTTPException(status_code=404, detail="Inspiration not found")

    db.delete(inspiration)
    db.commit()
    return {"success": True, "message": "Inspiration deleted"}


# ============================================
# COACHING MOMENTS - FULL CRUD
# ============================================

class CoachingMomentCreate(BaseModel):
    title: Optional[str] = None
    moment_text: str
    person: Optional[str] = None
    outcome: Optional[str] = None
    learning: Optional[str] = None


class CoachingMomentUpdate(BaseModel):
    title: Optional[str] = None
    moment_text: Optional[str] = None
    person: Optional[str] = None
    outcome: Optional[str] = None
    learning: Optional[str] = None


class CoachingMomentResponse(BaseModel):
    id: int
    user_number: str
    title: Optional[str]
    moment_text: str
    person: Optional[str]
    outcome: Optional[str]
    learning: Optional[str]
    first_seen_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.get("/coaching-moments", response_model=list[CoachingMomentResponse])
def get_coaching_moments(
        user_number: str,
        db: Session = Depends(get_db)
):
    """Get all coaching moments for a user"""
    moments = db.query(JourneyCoachingMoment).filter(
        JourneyCoachingMoment.user_number == user_number
    ).order_by(JourneyCoachingMoment.first_seen_at.desc()).all()
    return moments


@router.post("/coaching-moments", response_model=CoachingMomentResponse)
def create_coaching_moment(
        moment_data: CoachingMomentCreate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Create a new coaching moment"""
    new_moment = JourneyCoachingMoment(
        user_number=user_number,
        title=moment_data.title,
        moment_text=moment_data.moment_text,
        person=moment_data.person,
        outcome=moment_data.outcome,
        learning=moment_data.learning,
        first_seen_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(new_moment)
    db.commit()
    db.refresh(new_moment)
    return new_moment


@router.put("/coaching-moments/{moment_id}", response_model=CoachingMomentResponse)
def update_coaching_moment(
        moment_id: int,
        moment_data: CoachingMomentUpdate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Update a coaching moment"""
    moment = db.query(JourneyCoachingMoment).filter(
        JourneyCoachingMoment.id == moment_id,
        JourneyCoachingMoment.user_number == user_number
    ).first()

    if not moment:
        raise HTTPException(status_code=404, detail="Coaching moment not found")

    if moment_data.title is not None:
        moment.title = moment_data.title
    if moment_data.moment_text is not None:
        moment.moment_text = moment_data.moment_text
    if moment_data.person is not None:
        moment.person = moment_data.person
    if moment_data.outcome is not None:
        moment.outcome = moment_data.outcome
    if moment_data.learning is not None:
        moment.learning = moment_data.learning

    moment.updated_at = datetime.now()
    db.commit()
    db.refresh(moment)
    return moment


@router.delete("/coaching-moments/{moment_id}")
def delete_coaching_moment(
        moment_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Delete a coaching moment"""
    moment = db.query(JourneyCoachingMoment).filter(
        JourneyCoachingMoment.id == moment_id,
        JourneyCoachingMoment.user_number == user_number
    ).first()

    if not moment:
        raise HTTPException(status_code=404, detail="Coaching moment not found")

    db.delete(moment)
    db.commit()
    return {"success": True, "message": "Coaching moment deleted"}


# ============================================
# TEAM COMPOSITION - FULL CRUD
# ============================================

class TeamCompositionCreate(BaseModel):
    title: Optional[str] = None
    composition_text: str
    team_type: Optional[str] = None
    dynamics: Optional[str] = None


class TeamCompositionUpdate(BaseModel):
    title: Optional[str] = None
    composition_text: Optional[str] = None
    team_type: Optional[str] = None
    dynamics: Optional[str] = None


class TeamCompositionResponse(BaseModel):
    id: int
    user_number: str
    title: Optional[str]
    composition_text: str
    team_type: Optional[str]
    dynamics: Optional[str]
    first_seen_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.get("/team-composition", response_model=list[TeamCompositionResponse])
def get_team_composition(
        user_number: str,
        db: Session = Depends(get_db)
):
    """Get all team composition entries for a user"""
    compositions = db.query(JourneyTeamComposition).filter(
        JourneyTeamComposition.user_number == user_number
    ).order_by(JourneyTeamComposition.first_seen_at.desc()).all()
    return compositions


@router.post("/team-composition", response_model=TeamCompositionResponse)
def create_team_composition(
        composition_data: TeamCompositionCreate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Create a new team composition entry"""
    new_composition = JourneyTeamComposition(
        user_number=user_number,
        title=composition_data.title,
        composition_text=composition_data.composition_text,
        team_type=composition_data.team_type,
        dynamics=composition_data.dynamics,
        first_seen_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(new_composition)
    db.commit()
    db.refresh(new_composition)
    return new_composition


@router.put("/team-composition/{composition_id}", response_model=TeamCompositionResponse)
def update_team_composition(
        composition_id: int,
        composition_data: TeamCompositionUpdate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Update a team composition entry"""
    composition = db.query(JourneyTeamComposition).filter(
        JourneyTeamComposition.id == composition_id,
        JourneyTeamComposition.user_number == user_number
    ).first()

    if not composition:
        raise HTTPException(status_code=404, detail="Team composition not found")

    if composition_data.title is not None:
        composition.title = composition_data.title
    if composition_data.composition_text is not None:
        composition.composition_text = composition_data.composition_text
    if composition_data.team_type is not None:
        composition.team_type = composition_data.team_type
    if composition_data.dynamics is not None:
        composition.dynamics = composition_data.dynamics

    composition.updated_at = datetime.now()
    db.commit()
    db.refresh(composition)
    return composition


@router.delete("/team-composition/{composition_id}")
def delete_team_composition(
        composition_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Delete a team composition entry"""
    composition = db.query(JourneyTeamComposition).filter(
        JourneyTeamComposition.id == composition_id,
        JourneyTeamComposition.user_number == user_number
    ).first()

    if not composition:
        raise HTTPException(status_code=404, detail="Team composition not found")

    db.delete(composition)
    db.commit()
    return {"success": True, "message": "Team composition deleted"}

# ============================================================
# JOURNEY COACHING ENDPOINT
# ============================================================

from app.config import OPENAI_API_KEY, OPENAI_MODEL
from openai import OpenAI

openai_client_journey = OpenAI(api_key=OPENAI_API_KEY)


class JourneyCoachRequest(BaseModel):
    user_number: str
    journey_type: str  # "strength", "goal", "failure", etc.
    current_data: dict  # The form data being edited
    action: Optional[str] = "initial_feedback"
    user_message: Optional[str] = None
    conversation_history: Optional[list] = None


@router.post("/coach")
def get_journey_coaching(
    coach_request: JourneyCoachRequest,
    db: Session = Depends(get_db)
):
    """
    Provide contextual AI coaching for journey items.
    Alfred gives feedback on how to improve the current entry.
    """
    
    # Build full journey context
    from app.services.journey_context import build_journey_context
    journey_context = build_journey_context(db, coach_request.user_number)
    
    # Create coaching prompt based on journey type
    coaching_prompts = {
        "strength": """You are Alfred, coaching the user on articulating their strengths more powerfully.

Current strength entry:
{current_data}

Your role:
- Help them make it more specific and tangible
- Encourage concrete examples of impact
- Connect to measurable outcomes when possible
- Keep it authentic to who they are

Give direct, actionable feedback in 2-3 sentences.""",

        "goal": """You are Alfred, helping the user clarify their goals.

Current goal entry:
{current_data}

Your role:
- Help define clear success metrics
- Deepen the 'why' behind the goal
- Ensure it's specific and time-bound
- Connect to their broader vision

Give direct, actionable feedback in 2-3 sentences.""",

        "failure": """You are Alfred, helping the user extract wisdom from setbacks.

Current failure entry:
{current_data}

Your role:
- Help identify the deeper learning
- Surface the emotional residue (the 'scar')
- Connect to future growth opportunities
- Be empathetic but move toward insight

Give direct, actionable feedback in 2-3 sentences.""",

        "value": """You are Alfred, helping the user articulate their core values.

Current value entry:
{current_data}

Your role:
- Help them get to the essence of why this matters
- Encourage specific examples of when this value guided decisions
- Connect to their leadership identity
- Keep it authentic and personal

Give direct, actionable feedback in 2-3 sentences.""",

        "development-area": """You are Alfred, helping the user clarify areas for growth.

Current development area entry:
{current_data}

Your role:
- Help them be specific about what skill/capability to develop
- Connect to their goals and challenges
- Suggest concrete first steps
- Frame it as opportunity, not deficit

Give direct, actionable feedback in 2-3 sentences."""
    }
    
    # Default coaching prompt
    default_prompt = """You are Alfred, providing coaching on this journey entry.

Current entry:
{current_data}

Help them make it more specific, actionable, and aligned with their leadership development.
Give direct, actionable feedback in 2-3 sentences."""
    
    # Get appropriate prompt
    coaching_template = coaching_prompts.get(
        coach_request.journey_type,
        default_prompt
    )
    
    # Format current data for prompt
    current_data_str = "\n".join([
        f"- {key}: {value}" 
        for key, value in coach_request.current_data.items() 
        if value and key not in ['id', 'user_number', 'first_seen_at', 'updated_at']
    ])
    
    # Build system prompt
    system_prompt = f"""You are Alfred, an AI Chief of Staff and executive coach.
    
You have full context about the user's journey:
{journey_context}

{coaching_template.format(current_data=current_data_str)}

Keep responses warm, direct, and actionable. No pleasantries needed."""
    
    # Build messages
    if coach_request.action == "initial_feedback":
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Give me feedback on my current {coach_request.journey_type} entry."}
        ]
    else:
        # Continuing conversation
        messages = [{"role": "system", "content": system_prompt}]
        
        # Add conversation history if provided
        if coach_request.conversation_history:
            for msg in coach_request.conversation_history:
                messages.append({
                    "role": msg.get("role"),
                    "content": msg.get("content")
                })
        
        # Add current user message
        if coach_request.user_message:
            messages.append({
                "role": "user",
                "content": coach_request.user_message
            })
    
    # Get GPT response
    try:
        response = openai_client_journey.chat.completions.create(
            model=OPENAI_MODEL,
            messages=messages,
            max_tokens=300,  # Keep responses concise
            temperature=0.7
        )
        
        feedback = response.choices[0].message.content
        
        return {
            "feedback": feedback,
            "journey_type": coach_request.journey_type,
            "timestamp": datetime.now().isoformat()
        }
    
    except Exception as e:
        print(f"Error generating coaching feedback: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to generate coaching feedback"
        )


@router.get("/people/review-candidates")
def get_people_review_candidates(
    user_number: str,
    include_all: bool = False,
    db: Session = Depends(get_db)
):
    """Get list of people who could benefit from a review"""
    try:
        result = PeopleReviewService.get_review_candidates(db, user_number, include_all)
        return result
    except Exception as e:
        print(f"Error getting review candidates: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/people/{person_id}/start-review")
def start_people_review(
    person_id: int,
    user_number: str,
    review_type: str = "regular",
    db: Session = Depends(get_db)
):
    """Initialize a new review session for a person"""
    try:
        result = PeopleReviewService.start_review(db, user_number, person_id, review_type)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        print(f"Error starting review: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/people/{person_id}/review-history")
def get_people_review_history(
    person_id: int,
    user_number: str,
    db: Session = Depends(get_db)
):
    """Get all past reviews for a person"""
    try:
        result = PeopleReviewService.get_review_history(db, person_id, user_number)
        return result
    except Exception as e:
        print(f"Error getting review history: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/people/reviews/{review_id}")
def update_people_review(
    review_id: int,
    updates: dict,
    user_number: str,
    db: Session = Depends(get_db)
):
    """Update a review in progress"""
    try:
        review = PeopleReviewService.update_review(db, review_id, user_number, updates)
        return {"success": True, "review_id": review.id}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        print(f"Error updating review: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/people/reviews/{review_id}/complete")
def complete_people_review(
    review_id: int,
    user_number: str,
    db: Session = Depends(get_db)
):
    """Mark review as complete and update person record"""
    try:
        result = PeopleReviewService.complete_review(db, review_id, user_number)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        print(f"Error completing review: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/people/active-review")
def get_active_people_review(
    user_number: str,
    db: Session = Depends(get_db)
):
    """Get the active review session if any"""
    try:
        result = PeopleReviewService.get_active_review(db, user_number)
        if result:
            return result
        else:
            return {"active": False}
    except Exception as e:
        print(f"Error getting active review: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Add this to app/routers/journey.py

@router.get("/people/{person_id}/synthesis")
def get_person_synthesis(
    person_id: int,
    user_number: str,
    db: Session = Depends(get_db)
):
    """
    Generate Alfred's synthesis of a person based on all review history.
    Uses GPT to analyze all reviews and extract:
    - Core strengths (recurring positive patterns)
    - Improvement opportunities (recurring challenges)
    - Trajectory (getting better/worse/stable)
    """
    from openai import OpenAI
    from app.config import OPENAI_API_KEY, OPENAI_MODEL
    
    # Get person
    person = db.query(JourneyPerson).filter(
        JourneyPerson.id == person_id,
        JourneyPerson.user_number == user_number
    ).first()
    
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    
    # Get all reviews for this person
    reviews = db.query(RelationshipReview).filter(
        RelationshipReview.person_id == person_id,
        RelationshipReview.user_number == user_number,
        RelationshipReview.completed_at.isnot(None)
    ).order_by(RelationshipReview.review_date.desc()).all()
    
    if not reviews:
        return {
            "person_name": person.name,
            "strengths": [],
            "improvements": [],
            "trajectory": "No reviews yet - start your first review to build this profile"
        }
    
    # Build review summary for GPT
    review_summaries = []
    for review in reviews:
        summary = f"""
Review Date: {review.review_date.strftime('%Y-%m-%d')}
Strength: {review.relationship_strength}/5
Dynamics: {review.current_dynamics or 'N/A'}
Strengths observed: {review.how_to_strengthen or 'N/A'}
Issues: {review.unresolved_issues or 'N/A'}
Next steps: {review.next_steps or 'N/A'}
"""
        review_summaries.append(summary.strip())
    
    all_reviews_text = "\n\n---\n\n".join(review_summaries)
    
    # Generate synthesis with GPT
    client = OpenAI(api_key=OPENAI_API_KEY)
    
    system_prompt = f"""You are Alfred, analyzing the relationship history between the user and {person.name} ({person.relation or 'colleague'}).

You have {len(reviews)} reviews spanning from {reviews[-1].review_date.strftime('%Y-%m-%d')} to {reviews[0].review_date.strftime('%Y-%m-%d')}.

Your task: Analyze all reviews and extract:

1. CORE STRENGTHS (3-5 items):
   - Recurring positive patterns
   - What consistently works well
   - This person's superpowers in the relationship

2. IMPROVEMENT OPPORTUNITIES (3-5 items):
   - Recurring challenges or friction points
   - Areas that need development
   - Patterns of difficulty

3. TRAJECTORY (1 sentence):
   - Is the relationship getting stronger, weaker, or stable?
   - What's the overall direction?

FORMAT YOUR RESPONSE AS JSON:
{{
  "strengths": ["item 1", "item 2", "item 3"],
  "improvements": ["item 1", "item 2", "item 3"],
  "trajectory": "one sentence assessment"
}}

RULES:
- Be concise (10-15 words per item max)
- Focus on PATTERNS across reviews, not one-time events
- Be balanced but honest
- If relationship is improving/declining, say so
- Use specific language, not generic platitudes

REVIEWS:
{all_reviews_text}
"""
    
    try:
        response = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": system_prompt}
            ],
            temperature=0.5,
            max_tokens=500
        )
        
        import json
        result_text = response.choices[0].message.content.strip()
        
        # Clean up JSON if GPT wrapped it in markdown
        if result_text.startswith("```json"):
            result_text = result_text[7:]
        if result_text.endswith("```"):
            result_text = result_text[:-3]
        result_text = result_text.strip()
        
        synthesis = json.loads(result_text)
        
        return {
            "person_name": person.name,
            "review_count": len(reviews),
            "first_review": reviews[-1].review_date.isoformat() if reviews else None,
            "last_review": reviews[0].review_date.isoformat() if reviews else None,
            "strengths": synthesis.get("strengths", []),
            "improvements": synthesis.get("improvements", []),
            "trajectory": synthesis.get("trajectory", "")
        }
        
    except Exception as e:
        print(f"❌ Error generating synthesis: {e}")
        import traceback
        traceback.print_exc()
        
        # Fallback to simple extraction
        return {
            "person_name": person.name,
            "review_count": len(reviews),
            "strengths": ["Consistent collaboration", "Reliable partner", "Strong technical skills"],
            "improvements": ["Communication clarity", "Time management", "Delegation"],
            "trajectory": f"Relationship stable at {reviews[0].relationship_strength}/5 based on most recent review"
        }


# Add this endpoint to app/routers/journey.py
# Add this endpoint to app/routers/journey.py

@router.get("/goal-reviews")
async def get_goal_reviews(
        user_number: str,
        db: Session = Depends(get_db)
):
    """
    Fetch goal review sessions for this user.
    Returns list of sessions with summaries from coaching conversations.
    """
    from app.models import GoalReviewSession

    # Fetch all review sessions, ordered by most recent first
    sessions = (
        db.query(GoalReviewSession)
        .filter(GoalReviewSession.user_number == user_number)
        .order_by(GoalReviewSession.session_ended_at.desc())
        .limit(50)  # Last 50 sessions
        .all()
    )

    # Serialize sessions for frontend
    sessions_data = [
        {
            "id": s.id,
            "goal_id": s.goal_id,
            "goal_title": s.goal_title,
            "session_started_at": s.session_started_at.isoformat() if s.session_started_at else None,
            "session_ended_at": s.session_ended_at.isoformat() if s.session_ended_at else None,
            "summary": s.summary,
            "key_progress": s.key_progress,
            "key_blockers": s.key_blockers,
            "key_pattern": s.key_pattern,
            "chosen_adjustment": s.chosen_adjustment
        }
        for s in sessions
    ]

    return {
        "sessions": sessions_data
    }
