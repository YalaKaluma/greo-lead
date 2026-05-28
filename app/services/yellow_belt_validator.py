from __future__ import annotations

from collections.abc import Callable
from datetime import date, datetime
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models import (
    Habit,
    JourneyGoal,
    JourneyPerson,
    MessageSignalFlag,
    Task,
)


YELLOW_BELT_DIMENSION_SIGNALS = {
    "vision": [
        "vision_completed",
        "values_strengths_energy_journals",
        "fulfillment_reflections",
    ],
    "people": ["five_team_members_entered"],
    "execute": ["tasks_consistently_entered", "tasks_maintained"],
    "energy": ["high_energy_habits_identified", "three_energy_level_journals"],
    "learning": ["scars_failures_behavior_reflections"],
}

YELLOW_BELT_TRIAL_SIGNALS = {
    "energy": {
        "real_world": ["three_energy_level_journals"],
        "behavioral": ["high_energy_habits_identified"],
    },
}

SIGNAL_CONFIDENCE_THRESHOLD = 0.75


def _has_text(value: Any, min_chars: int = 1) -> bool:
    return len(str(value or "").strip()) >= min_chars


def _date_key(value: Optional[datetime]) -> Optional[date]:
    if value is None:
        return None
    return value.date() if hasattr(value, "date") else None


def _evidence_item(item: Any, fields: list[str]) -> dict[str, Any]:
    evidence = {"id": getattr(item, "id", None)}
    for field in fields:
        value = getattr(item, field, None)
        if isinstance(value, datetime):
            value = value.isoformat()
        evidence[field] = value
    return evidence


def _signal_result(
    signal: str,
    passed: bool,
    required: int,
    actual: int,
    message: str,
    evidence: Optional[list[dict[str, Any]]] = None,
    missing_fields: Optional[list[dict[str, Any]]] = None,
) -> dict[str, Any]:
    return {
        "signal": signal,
        "passed": passed,
        "score": 1.0 if passed else 0.0,
        "required": required,
        "actual": actual,
        "evidence": evidence or [],
        "missing_fields": missing_fields or [],
        "message": message,
    }


def _flag_date(flag: MessageSignalFlag) -> Optional[date]:
    timestamp = getattr(flag.message, "timestamp", None)
    return _date_key(timestamp) or _date_key(flag.created_at)


def _flag_evidence(flag: MessageSignalFlag) -> dict[str, Any]:
    confidence = flag.confidence_score or 0.0
    return {
        "id": flag.id,
        "message_id": flag.message_id,
        "source": flag.source_type,
        "signal_type": flag.signal_type,
        "confidence_score": confidence,
        "created_at": flag.created_at.isoformat() if flag.created_at else None,
        "message_timestamp": flag.message.timestamp.isoformat() if flag.message and flag.message.timestamp else None,
        "evidence_excerpt": flag.evidence_excerpt,
        "reasoning_summary": flag.reasoning_summary,
    }


def _signal_flag_result(
    db: Session,
    user_number: str,
    signal: str,
    signal_types: list[str],
    required: int,
    message_template: str,
    require_distinct_dates: bool = False,
) -> dict[str, Any]:
    flags = (
        db.query(MessageSignalFlag)
        .join(MessageSignalFlag.message)
        .filter(
            MessageSignalFlag.signal_type.in_(signal_types),
            MessageSignalFlag.is_met == True,
            MessageSignalFlag.confidence_score >= SIGNAL_CONFIDENCE_THRESHOLD,
            MessageSignalFlag.message.has(user_number=user_number),
        )
        .order_by(MessageSignalFlag.confidence_score.desc(), MessageSignalFlag.updated_at.desc())
        .all()
    )
    if require_distinct_dates:
        distinct_dates = {_flag_date(flag) for flag in flags if _flag_date(flag)}
        actual = len(distinct_dates) if distinct_dates else len(flags)
    else:
        actual = len(flags)
    passed = actual >= required
    confidence_scores = [flag.confidence_score for flag in flags if flag.confidence_score is not None]
    evidence = [_flag_evidence(flag) for flag in flags[:10]]
    if confidence_scores:
        evidence.append({
            "summary": "confidence_range",
            "min": min(confidence_scores),
            "max": max(confidence_scores),
            "count": len(confidence_scores),
        })
    return _signal_result(
        signal,
        passed,
        required,
        actual,
        message_template.format(actual=actual, remaining=max(required - actual, 0)),
        evidence,
    )


def validate_vision_completed(db: Session, user_number: str) -> dict[str, Any]:
    visions = [
        goal
        for goal in db.query(JourneyGoal).filter(JourneyGoal.user_number == user_number).all()
        if (goal.time_horizon or "").strip().lower() in {"vision", "long", "long_term"}
        and _has_text(goal.goal_text, min_chars=20)
    ]
    return _signal_result(
        "vision_completed",
        len(visions) >= 1,
        1,
        len(visions),
        "You have completed a vision record." if visions else "Add a completed vision with enough detail to guide your direction.",
        [_evidence_item(item, ["title", "goal_text", "time_horizon", "updated_at"]) for item in visions[:5]],
    )


def validate_values_strengths_energy_journals(db: Session, user_number: str) -> dict[str, Any]:
    return _signal_flag_result(
        db,
        user_number,
        "values_strengths_energy_journals",
        ["values_strengths_energy_reflection", "vision_depth", "fulfillment_reflection", "energy_awareness"],
        3,
        "You have completed {actual} values, strengths, vision, energy, or fulfillment journal reflections. Add {remaining} more.",
    )


def validate_fulfillment_reflections(db: Session, user_number: str) -> dict[str, Any]:
    return _signal_flag_result(
        db,
        user_number,
        "fulfillment_reflections",
        ["fulfillment_reflection"],
        1,
        "You have completed {actual} fulfillment-related reflection. Add {remaining} more fulfillment reflection.",
        require_distinct_dates=False,
    )


def validate_five_team_members_entered(db: Session, user_number: str) -> dict[str, Any]:
    people = db.query(JourneyPerson).filter(JourneyPerson.user_number == user_number).all()
    complete = []
    missing = []
    for person in people:
        missing_fields = []
        if not _has_text(person.name):
            missing_fields.append("name")
        if not _has_text(person.relation):
            missing_fields.append("relationship")
        has_explicit_profile = (
            _has_text(getattr(person, "strengths", None))
            and _has_text(getattr(person, "growth_areas", None))
            and _has_text(getattr(person, "aspirations", None))
        )
        has_legacy_context = _has_text(person.context, min_chars=80)
        if not has_explicit_profile and not has_legacy_context:
            if not _has_text(getattr(person, "strengths", None)):
                missing_fields.append("strengths")
            if not _has_text(getattr(person, "growth_areas", None)):
                missing_fields.append("growth_areas")
            if not _has_text(getattr(person, "aspirations", None)):
                missing_fields.append("aspirations")
        if missing_fields:
            missing.append({"id": person.id, "name": person.name, "missing": missing_fields})
        else:
            complete.append(person)

    return _signal_result(
        "five_team_members_entered",
        len(complete) >= 5,
        5,
        len(complete),
        (
            f"You have entered {len(complete)} complete team members with relationship context, strengths, growth areas, and aspirations."
            if len(complete) >= 5
            else f"Complete {max(5 - len(complete), 0)} more team member profiles with strengths, growth areas, and aspirations."
        ),
        [_evidence_item(item, ["name", "relation", "strengths", "growth_areas", "aspirations", "context", "updated_at"]) for item in complete[:10]],
        missing[:10],
    )


def validate_tasks_consistently_entered(db: Session, user_number: str) -> dict[str, Any]:
    tasks = db.query(Task).filter(Task.user_number == user_number).all()
    created_dates = {_date_key(task.created_at) for task in tasks if _date_key(task.created_at)}
    required = 20
    actual = len(tasks)
    passed = actual >= required and (len(created_dates) >= 7 if created_dates else True)
    message = (
        f"You have entered {actual} tasks across {len(created_dates)} days."
        if passed
        else f"Log {max(required - actual, 0)} more tasks; ideally build the list across at least 7 days."
    )
    return _signal_result(
        "tasks_consistently_entered",
        passed,
        required,
        actual,
        message,
        [_evidence_item(item, ["title", "status", "created_at", "updated_at"]) for item in tasks[:20]],
    )


def validate_tasks_maintained(db: Session, user_number: str) -> dict[str, Any]:
    tasks = db.query(Task).filter(Task.user_number == user_number).all()
    maintained = [
        task
        for task in tasks
        if task.status == "completed"
        or (task.updated_at and task.created_at and task.updated_at.date() != task.created_at.date())
        or task.last_prioritized_at
        or task.in_top10
    ]
    activity_dates = {
        _date_key(value)
        for task in maintained
        for value in [task.updated_at, task.last_prioritized_at, task.created_at]
        if _date_key(value)
    }
    actual = len(maintained)
    passed = actual >= 5 and (len(activity_dates) >= 3 if activity_dates else False)
    return _signal_result(
        "tasks_maintained",
        passed,
        5,
        actual,
        (
            f"You have maintained {actual} tasks across {len(activity_dates)} days."
            if passed
            else "Complete, reprioritize, reschedule, or update at least 5 tasks across 3 different days."
        ),
        [_evidence_item(item, ["title", "status", "in_top10", "updated_at", "last_prioritized_at"]) for item in maintained[:20]],
    )


def validate_high_energy_habits_identified(db: Session, user_number: str) -> dict[str, Any]:
    habits = db.query(Habit).filter(Habit.user_number == user_number, Habit.is_active == True).all()
    return _signal_result(
        "high_energy_habits_identified",
        len(habits) >= 3,
        3,
        len(habits),
        (
            f"You have tracked {len(habits)} active habits."
            if len(habits) >= 3
            else f"Track {max(3 - len(habits), 0)} more active habits in MyHabits."
        ),
        [_evidence_item(item, ["title", "frequency", "created_at", "updated_at"]) for item in habits[:10]],
    )


def validate_three_energy_level_journals(db: Session, user_number: str) -> dict[str, Any]:
    return _signal_flag_result(
        db,
        user_number,
        "three_energy_level_journals",
        ["energy_awareness"],
        3,
        "You have completed {actual} energy-level journal reflections. Add {remaining} more.",
    )


def validate_three_behavior_change_journals(db: Session, user_number: str) -> dict[str, Any]:
    return _signal_flag_result(
        db,
        user_number,
        "three_behavior_change_journals",
        ["behavior_change_reflection"],
        3,
        "You have completed {actual} behavior-change journal reflections. Add {remaining} more.",
    )


def validate_self_awareness_reflections(db: Session, user_number: str) -> dict[str, Any]:
    return _signal_flag_result(
        db,
        user_number,
        "self_awareness_reflections",
        ["self_awareness_reflection"],
        1,
        "You have completed {actual} self-awareness reflection. Add {remaining} more self-awareness reflection.",
        require_distinct_dates=False,
    )


def validate_scars_failures_behavior_reflections(db: Session, user_number: str) -> dict[str, Any]:
    return _signal_flag_result(
        db,
        user_number,
        "scars_failures_behavior_reflections",
        ["scars_failures_behavior_reflection"],
        3,
        "You have completed {actual} scars, failures, and behavior reflections. Add {remaining} more.",
    )


YELLOW_BELT_SIGNAL_VALIDATORS: dict[str, Callable[[Session, str], dict[str, Any]]] = {
    "vision_completed": validate_vision_completed,
    "values_strengths_energy_journals": validate_values_strengths_energy_journals,
    "fulfillment_reflections": validate_fulfillment_reflections,
    "five_team_members_entered": validate_five_team_members_entered,
    "tasks_consistently_entered": validate_tasks_consistently_entered,
    "tasks_maintained": validate_tasks_maintained,
    "high_energy_habits_identified": validate_high_energy_habits_identified,
    "three_energy_level_journals": validate_three_energy_level_journals,
    "three_behavior_change_journals": validate_three_behavior_change_journals,
    "self_awareness_reflections": validate_self_awareness_reflections,
    "scars_failures_behavior_reflections": validate_scars_failures_behavior_reflections,
}


def _next_action_for_signal(signal: dict[str, Any]) -> Optional[str]:
    if signal.get("passed"):
        return None
    remaining = max((signal.get("required") or 0) - (signal.get("actual") or 0), 0)
    actions = {
        "vision_completed": "Add a completed vision in My Journey.",
        "values_strengths_energy_journals": f"Add {remaining} more journal reflections about how values, strengths, or vision affected your energy and fulfillment.",
        "fulfillment_reflections": "Add one journal reflection about fulfillment or meaning.",
        "five_team_members_entered": f"Complete {remaining} more team member profiles with strengths, growth areas, and aspirations.",
        "tasks_consistently_entered": f"Log {remaining} more tasks in Alfred's todo list.",
        "tasks_maintained": "Update, complete, reprioritize, or reschedule tasks across at least 3 days.",
        "high_energy_habits_identified": f"Track {remaining} more active habits in MyHabits.",
        "three_energy_level_journals": f"Add {remaining} more journal reflections about your energy level and what drove it.",
        "three_behavior_change_journals": f"Add {remaining} more journal reflections about behavior change or limiting patterns.",
        "self_awareness_reflections": "Add one journal reflection that names what you noticed about your own patterns.",
        "scars_failures_behavior_reflections": f"Add {remaining} more journal reflections connecting scars or failures to current behavior.",
    }
    return actions.get(signal.get("signal"))


def validate_yellow_belt_dimension(db: Session, user_number: str, dimension_id: str) -> dict[str, Any]:
    signals = []
    for signal in YELLOW_BELT_DIMENSION_SIGNALS.get(dimension_id, []):
        validator = YELLOW_BELT_SIGNAL_VALIDATORS[signal]
        signals.append(validator(db, user_number))

    result = _aggregate_signal_results("yellow", dimension_id, signals)
    result["trial_types"] = {
        trial_type: validate_yellow_belt_trial_type(db, user_number, dimension_id, trial_type)
        for trial_type in YELLOW_BELT_TRIAL_SIGNALS.get(dimension_id, {})
    }
    return result


def validate_yellow_belt_trial_type(db: Session, user_number: str, dimension_id: str, trial_type: str) -> dict[str, Any]:
    signal_names = YELLOW_BELT_TRIAL_SIGNALS.get(dimension_id, {}).get(trial_type)
    if not signal_names:
        signal_names = YELLOW_BELT_DIMENSION_SIGNALS.get(dimension_id, []) if trial_type == "behavioral" else []

    signals = []
    for signal in signal_names:
        validator = YELLOW_BELT_SIGNAL_VALIDATORS[signal]
        signals.append(validator(db, user_number))

    return _aggregate_signal_results("yellow", dimension_id, signals, trial_type=trial_type)


def _aggregate_signal_results(
    belt: str,
    dimension_id: str,
    signals: list[dict[str, Any]],
    trial_type: Optional[str] = None,
) -> dict[str, Any]:
    passed_count = sum(1 for signal in signals if signal["passed"])
    total = len(signals)
    next_action = next((_next_action_for_signal(signal) for signal in signals if not signal["passed"]), None)
    return {
        "belt": belt,
        "dimension": dimension_id,
        "trial_type": trial_type,
        "passed": total > 0 and passed_count == total,
        "completion_percentage": round((passed_count / total) * 100) if total else 0,
        "signals": signals,
        "next_action": next_action,
    }


def validate_yellow_belt(db: Session, user_number: str) -> dict[str, Any]:
    dimensions = [
        validate_yellow_belt_dimension(db, user_number, dimension_id)
        for dimension_id in YELLOW_BELT_DIMENSION_SIGNALS
    ]
    passed_count = sum(1 for dimension in dimensions if dimension["passed"])
    total = len(dimensions)
    return {
        "belt": "yellow",
        "passed": total > 0 and passed_count == total,
        "completion_percentage": round((passed_count / total) * 100) if total else 0,
        "dimensions": dimensions,
        "next_action": next((dimension["next_action"] for dimension in dimensions if dimension["next_action"]), None),
    }
