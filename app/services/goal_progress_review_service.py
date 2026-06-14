from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.models import (
    JourneyGoal,
    Message,
    MessageSignalFlag,
    OpportunitySuggestion,
    Task,
    User,
    VisionRoadmapWave,
)


class GoalProgressReviewService:
    """Builds Alfred's executive briefing for a single Vision."""

    COMPLETED_TASK_STATUSES = {"completed", "complete", "done"}
    COMPLETED_OUTCOME_STATUSES = {"done", "completed", "complete"}

    @classmethod
    def build(cls, db: Session, user_number: str, vision_id: int) -> dict[str, Any]:
        vision = (
            db.query(JourneyGoal)
            .filter(JourneyGoal.id == vision_id, JourneyGoal.user_number == user_number)
            .first()
        )
        if not vision:
            raise ValueError("Vision not found")

        goals = (
            db.query(JourneyGoal)
            .filter(JourneyGoal.user_number == user_number)
            .all()
        )
        descendants = cls._collect_descendants(goals, vision_id)
        scoped_goal_ids = [vision_id, *[goal.id for goal in descendants]]
        pillars = [goal for goal in descendants if cls._level(goal) == "pillar"]
        outcomes = [goal for goal in descendants if cls._level(goal) == "outcome"]

        tasks = (
            db.query(Task)
            .filter(Task.user_number == user_number, Task.goal_id.in_(scoped_goal_ids))
            .all()
        )
        waves = (
            db.query(VisionRoadmapWave)
            .filter(
                VisionRoadmapWave.user_number == user_number,
                VisionRoadmapWave.vision_goal_id == vision_id,
            )
            .order_by(VisionRoadmapWave.sequence_order, VisionRoadmapWave.created_at)
            .all()
        )

        recent_outcomes = cls._recent_outcomes(outcomes, waves, pillars)
        completed_tasks = cls._completed_tasks(tasks, goals)
        upcoming_tasks = cls._upcoming_tasks(tasks, goals)
        wave_summary = cls._wave_summary(waves)
        recommendations = cls._recommendations(db, user_number, scoped_goal_ids)
        journal_insights = cls._journal_insights(db, user_number, vision, descendants)
        goal_health = cls._goal_health(outcomes, tasks, waves, recent_outcomes, recommendations)
        status = cls._overall_status(goal_health, wave_summary, recommendations)

        return {
            "status": status,
            "executive_summary": cls._executive_summary(
                vision=vision,
                pillars=pillars,
                recent_outcomes=recent_outcomes,
                completed_tasks=completed_tasks,
                upcoming_tasks=upcoming_tasks,
                recommendations=recommendations,
                wave_summary=wave_summary,
            ),
            "key_risks": cls._key_risks(recommendations, journal_insights, upcoming_tasks),
            "key_wins": cls._key_wins(recent_outcomes, completed_tasks),
            "recommended_focus": cls._recommended_focus(recommendations, upcoming_tasks, wave_summary),
            "goal_health": goal_health,
            "wave_summary": wave_summary,
            "recent_outcomes": recent_outcomes,
            "completed_tasks": completed_tasks[:10],
            "upcoming_tasks": upcoming_tasks,
            "recommendations": recommendations,
            "journal_insights": journal_insights,
        }

    @classmethod
    def _level(cls, goal: JourneyGoal) -> str:
        value = (goal.time_horizon or "").strip().lower()
        return {"long": "vision", "medium": "pillar", "short": "outcome"}.get(value, value)

    @classmethod
    def _title(cls, goal: Optional[JourneyGoal]) -> Optional[str]:
        if not goal:
            return None
        return goal.title or goal.goal_text

    @classmethod
    def _collect_descendants(cls, goals: list[JourneyGoal], root_id: int) -> list[JourneyGoal]:
        by_parent: dict[int, list[JourneyGoal]] = {}
        for goal in goals:
            if goal.parent_goal_id:
                by_parent.setdefault(goal.parent_goal_id, []).append(goal)

        collected: list[JourneyGoal] = []
        stack = list(by_parent.get(root_id, []))
        while stack:
            goal = stack.pop(0)
            collected.append(goal)
            stack.extend(by_parent.get(goal.id, []))
        return collected

    @classmethod
    def _parent_pillar(cls, outcome: JourneyGoal, pillars: list[JourneyGoal]) -> Optional[JourneyGoal]:
        return next((pillar for pillar in pillars if pillar.id == outcome.parent_goal_id), None)

    @classmethod
    def _outcome_wave_statuses(cls, waves: list[VisionRoadmapWave]) -> dict[int, tuple[str, Optional[datetime]]]:
        statuses: dict[int, tuple[str, Optional[datetime]]] = {}
        for wave in waves:
            for link in wave.goals or []:
                statuses[link.goal_id] = (link.status or "not_started", link.updated_at)
        return statuses

    @classmethod
    def _recent_outcomes(
        cls,
        outcomes: list[JourneyGoal],
        waves: list[VisionRoadmapWave],
        pillars: list[JourneyGoal],
    ) -> list[dict[str, Any]]:
        wave_statuses = cls._outcome_wave_statuses(waves)
        completed = []
        for outcome in outcomes:
            status, completed_at = wave_statuses.get(outcome.id, ("not_started", None))
            if status not in cls.COMPLETED_OUTCOME_STATUSES:
                continue
            pillar = cls._parent_pillar(outcome, pillars)
            completed.append({
                "id": outcome.id,
                "title": cls._title(outcome),
                "completed_at": cls._iso(completed_at or outcome.updated_at),
                "pillar": cls._title(pillar),
            })
        return sorted(completed, key=lambda item: item.get("completed_at") or "", reverse=True)[:8]

    @classmethod
    def _completed_tasks(cls, tasks: list[Task], goals: list[JourneyGoal]) -> list[dict[str, Any]]:
        goals_by_id = {goal.id: goal for goal in goals}
        completed = [
            {
                "id": task.id,
                "title": task.title,
                "completed_at": cls._iso(task.updated_at),
                "linked_outcome": cls._title(goals_by_id.get(task.goal_id)),
                "goal_id": task.goal_id,
            }
            for task in tasks
            if (task.status or "").strip().lower() in cls.COMPLETED_TASK_STATUSES
        ]
        return sorted(completed, key=lambda item: item.get("completed_at") or "", reverse=True)

    @classmethod
    def _upcoming_tasks(cls, tasks: list[Task], goals: list[JourneyGoal]) -> dict[str, list[dict[str, Any]]]:
        goals_by_id = {goal.id: goal for goal in goals}
        now = datetime.utcnow()
        next_30 = now + timedelta(days=30)

        active_tasks = [
            task for task in tasks
            if (task.status or "open").strip().lower() not in cls.COMPLETED_TASK_STATUSES
        ]
        active_tasks.sort(key=lambda task: (
            0 if task.in_top10 else 1,
            task.top10_position or 99,
            task.due_date or datetime.max,
            -(float(task.move_the_needle_score or 0)),
        ))

        def serialize(task: Task) -> dict[str, Any]:
            return {
                "id": task.id,
                "title": task.title,
                "due_date": cls._iso(task.due_date),
                "linked_outcome": cls._title(goals_by_id.get(task.goal_id)),
                "goal_id": task.goal_id,
                "mtn_score": float(task.move_the_needle_score) if task.move_the_needle_score is not None else None,
            }

        coming_next = [
            serialize(task)
            for task in active_tasks
            if task.due_date and now <= task.due_date <= next_30
        ]
        coming_next.sort(key=lambda item: item.get("due_date") or "")

        return {
            "immediate_focus": [serialize(task) for task in active_tasks[:10]],
            "coming_next": coming_next[:10],
        }

    @classmethod
    def _wave_summary(cls, waves: list[VisionRoadmapWave]) -> dict[str, Any]:
        current_wave = next((wave for wave in waves if (wave.status or "").lower() == "active"), None)
        if not current_wave:
            current_wave = next((wave for wave in waves if (wave.status or "").lower() == "in_progress"), None)
        if not current_wave:
            current_wave = next((wave for wave in waves if (wave.status or "").lower() != "completed"), None)
        if not current_wave and waves:
            current_wave = waves[-1]

        if not current_wave:
            return {
                "current_wave": None,
                "status": "not_started",
                "completed_outcomes": 0,
                "total_outcomes": 0,
                "next_milestone": None,
            }

        links = sorted(current_wave.goals or [], key=lambda item: (item.sequence_order or 0, item.created_at or datetime.min))
        completed = [link for link in links if (link.status or "").lower() in cls.COMPLETED_OUTCOME_STATUSES]
        next_link = next((link for link in links if (link.status or "").lower() not in cls.COMPLETED_OUTCOME_STATUSES), None)

        return {
            "current_wave": {
                "id": current_wave.id,
                "title": current_wave.title,
                "description": current_wave.description,
            },
            "status": current_wave.status or "not_started",
            "completed_outcomes": len(completed),
            "total_outcomes": len(links),
            "next_milestone": cls._title(next_link.goal) if next_link and next_link.goal else None,
        }

    @classmethod
    def _recommendations(cls, db: Session, user_number: str, scoped_goal_ids: list[int]) -> list[dict[str, Any]]:
        user = db.query(User).filter(User.phone_number == user_number).first()
        if not user:
            return []

        suggestions = (
            db.query(OpportunitySuggestion)
            .filter(
                OpportunitySuggestion.user_id == user.id,
                OpportunitySuggestion.status == "suggested",
                OpportunitySuggestion.linked_goal_id.in_(scoped_goal_ids),
            )
            .order_by(desc(OpportunitySuggestion.mtn_score), desc(OpportunitySuggestion.created_at))
            .limit(3)
            .all()
        )

        return [
            {
                "id": suggestion.id,
                "title": suggestion.title,
                "reason": suggestion.rationale,
                "impact": suggestion.description,
                "domain": suggestion.domain,
                "mtn_score": cls._decimal_to_float(suggestion.mtn_score),
                "linked_goal_id": suggestion.linked_goal_id,
                "status": suggestion.status,
            }
            for suggestion in suggestions
        ]

    @classmethod
    def _journal_insights(
        cls,
        db: Session,
        user_number: str,
        vision: JourneyGoal,
        descendants: list[JourneyGoal],
    ) -> list[dict[str, Any]]:
        keywords = cls._keywords(" ".join(filter(None, [cls._title(vision), vision.why, *[cls._title(goal) or "" for goal in descendants]])))
        query = (
            db.query(MessageSignalFlag)
            .join(Message, Message.id == MessageSignalFlag.message_id)
            .filter(
                Message.user_number == user_number,
                MessageSignalFlag.is_met == True,
                MessageSignalFlag.source_type == "journal",
            )
            .order_by(MessageSignalFlag.confidence_score.desc(), MessageSignalFlag.updated_at.desc())
            .limit(30)
        )

        candidates = []
        for flag in query.all():
            text = " ".join(filter(None, [flag.evidence_excerpt, flag.reasoning_summary, flag.message.content if flag.message else None]))
            score = cls._keyword_score(text, keywords)
            if keywords and score == 0:
                continue
            candidates.append({
                "date": cls._iso(flag.updated_at or flag.created_at),
                "journal_excerpt": flag.evidence_excerpt or cls._truncate(flag.message.content if flag.message else "", 180),
                "impact_assessment": flag.reasoning_summary or f"Signal detected: {flag.signal_type.replace('_', ' ')}.",
                "signal_type": flag.signal_type,
                "confidence_score": float(flag.confidence_score or 0),
                "_keyword_score": score,
            })
        candidates.sort(
            key=lambda item: (
                item.get("_keyword_score", 0),
                item.get("confidence_score", 0),
                item.get("date") or "",
            ),
            reverse=True,
        )
        return [
            {key: value for key, value in item.items() if key != "_keyword_score"}
            for item in candidates[:5]
        ]

    @classmethod
    def _goal_health(
        cls,
        outcomes: list[JourneyGoal],
        tasks: list[Task],
        waves: list[VisionRoadmapWave],
        recent_outcomes: list[dict[str, Any]],
        recommendations: list[dict[str, Any]],
    ) -> dict[str, str]:
        active_tasks = [task for task in tasks if (task.status or "open").lower() not in cls.COMPLETED_TASK_STATUSES]
        completed_tasks = [task for task in tasks if (task.status or "").lower() in cls.COMPLETED_TASK_STATUSES]
        overdue_tasks = [task for task in active_tasks if task.due_date and task.due_date < datetime.utcnow()]
        wave_links = [link for wave in waves for link in (wave.goals or [])]
        completed_wave_links = [link for link in wave_links if (link.status or "").lower() in cls.COMPLETED_OUTCOME_STATUSES]

        momentum = "green" if recent_outcomes or completed_tasks else "yellow"
        execution = "red" if len(overdue_tasks) >= 5 else "yellow" if overdue_tasks else "green"
        commercial = "yellow" if any((item.get("domain") or "").lower() in {"commercial", "sales", "pipeline", "revenue"} for item in recommendations) else "green"
        outcome = "green" if recent_outcomes else "yellow" if completed_wave_links else "red" if outcomes else "yellow"

        statuses = [momentum, execution, commercial, outcome]
        overall = "red" if "red" in statuses else "yellow" if statuses.count("yellow") >= 2 else "green"
        return {
            "momentum": momentum,
            "execution": execution,
            "commercial_progress": commercial,
            "outcome_achievement": outcome,
            "overall_goal_health": overall,
        }

    @classmethod
    def _overall_status(cls, goal_health: dict[str, str], wave_summary: dict[str, Any], recommendations: list[dict[str, Any]]) -> str:
        if goal_health.get("overall_goal_health") == "red":
            return "at_risk"
        if recommendations and goal_health.get("commercial_progress") == "yellow":
            return "constrained"
        if wave_summary.get("completed_outcomes", 0) > 0 and goal_health.get("momentum") == "green":
            return "accelerating"
        return "steady"

    @classmethod
    def _executive_summary(
        cls,
        vision: JourneyGoal,
        pillars: list[JourneyGoal],
        recent_outcomes: list[dict[str, Any]],
        completed_tasks: list[dict[str, Any]],
        upcoming_tasks: dict[str, list[dict[str, Any]]],
        recommendations: list[dict[str, Any]],
        wave_summary: dict[str, Any],
    ) -> str:
        vision_title = cls._title(vision) or "this Vision"
        strongest_pillar = recent_outcomes[0].get("pillar") if recent_outcomes else (cls._title(pillars[0]) if pillars else None)
        current_wave = (wave_summary.get("current_wave") or {}).get("title")
        focus = recommendations[0]["title"] if recommendations else (
            upcoming_tasks.get("immediate_focus", [{}])[0].get("title") if upcoming_tasks.get("immediate_focus") else None
        )

        parts = [f"Over the last 30 days, Alfred sees {vision_title} moving with {len(completed_tasks)} completed task(s) and {len(recent_outcomes)} outcome(s) achieved."]
        if strongest_pillar:
            parts.append(f"The strongest visible progress is around {strongest_pillar}.")
        if current_wave:
            parts.append(f"The current roadmap emphasis is {current_wave}, with {wave_summary.get('completed_outcomes', 0)} of {wave_summary.get('total_outcomes', 0)} outcomes completed.")
        if focus:
            parts.append(f"Recommended focus is to move {focus} forward next.")
        return " ".join(parts)

    @classmethod
    def _key_risks(cls, recommendations: list[dict[str, Any]], journal_insights: list[dict[str, Any]], upcoming_tasks: dict[str, list[dict[str, Any]]]) -> list[str]:
        risks = []
        if journal_insights:
            risks.append(journal_insights[0]["impact_assessment"])
        if recommendations:
            risks.append(recommendations[0].get("reason") or recommendations[0]["title"])
        if not upcoming_tasks.get("immediate_focus"):
            risks.append("No active execution tasks are linked to this Vision.")
        return [risk for risk in risks if risk][:3]

    @classmethod
    def _key_wins(cls, recent_outcomes: list[dict[str, Any]], completed_tasks: list[dict[str, Any]]) -> list[str]:
        wins = [item["title"] for item in recent_outcomes[:3]]
        if len(wins) < 3:
            wins.extend(item["title"] for item in completed_tasks[: 3 - len(wins)])
        return wins

    @classmethod
    def _recommended_focus(cls, recommendations: list[dict[str, Any]], upcoming_tasks: dict[str, list[dict[str, Any]]], wave_summary: dict[str, Any]) -> str:
        if recommendations:
            return recommendations[0]["title"]
        if wave_summary.get("next_milestone"):
            return wave_summary["next_milestone"]
        if upcoming_tasks.get("immediate_focus"):
            return upcoming_tasks["immediate_focus"][0]["title"]
        return "Create the next concrete task linked to this Vision."

    @staticmethod
    def _iso(value: Any) -> Optional[str]:
        if not value:
            return None
        if hasattr(value, "isoformat"):
            return value.isoformat()
        return str(value)

    @staticmethod
    def _decimal_to_float(value: Any) -> Optional[float]:
        if value is None:
            return None
        if isinstance(value, Decimal):
            return float(value)
        return float(value)

    @staticmethod
    def _truncate(value: str, limit: int) -> str:
        value = value or ""
        return value if len(value) <= limit else f"{value[:limit].rstrip()}..."

    @staticmethod
    def _keywords(text: str) -> set[str]:
        stop_words = {"the", "and", "for", "with", "that", "this", "from", "into", "goal", "vision", "pillar", "outcome"}
        return {
            word.strip(".,:;!?()[]{}").lower()
            for word in text.split()
            if len(word.strip(".,:;!?()[]{}")) > 4 and word.strip(".,:;!?()[]{}").lower() not in stop_words
        }

    @classmethod
    def _keyword_score(cls, text: str, keywords: set[str]) -> int:
        lowered = (text or "").lower()
        return sum(1 for keyword in keywords if keyword in lowered)
