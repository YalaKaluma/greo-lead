from __future__ import annotations

import json
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any, Optional

from openai import OpenAI
from sqlalchemy import desc, or_
from sqlalchemy.orm import Session

from app.config import OPENAI_API_KEY, OPENAI_MODEL
from app.models import (
    GoalReviewSession,
    JournalEntry,
    JourneyGoal,
    LeadershipCoachingSession,
    Message,
    OpportunitySuggestion,
    Task,
    User,
    VisionProgressReview,
    VisionRoadmapWave,
)
from app.services.goal_progress_review_service import GoalProgressReviewService

client = OpenAI(api_key=OPENAI_API_KEY)


class VisionProgressReviewService:
    COMPLETED_TASK_STATUSES = {"completed", "complete", "done"}
    STATUS_VALUES = {
        "accelerating": "accelerating",
        "on track": "on_track",
        "on_track": "on_track",
        "at risk": "at_risk",
        "at_risk": "at_risk",
        "stalled": "stalled",
    }
    HEALTH_VALUES = {
        "green": "green",
        "yellow": "yellow",
        "red": "red",
    }

    @classmethod
    def get_latest_or_generated(cls, db: Session, user_number: str, vision_id: int) -> dict[str, Any]:
        saved = cls._latest_saved(db, user_number, vision_id)
        if saved:
            return cls._serialize_saved(saved, db)
        return GoalProgressReviewService.build(db, user_number, vision_id)

    @classmethod
    def refresh_vision_progress_review(cls, db: Session, user_number: str, vision_id: int) -> dict[str, Any]:
        context = cls.build_vision_progress_context(db, user_number, vision_id)
        review = cls.generate_vision_progress_review(context)
        saved = cls.save_vision_progress_review(db, context, review)
        return cls._serialize_saved(saved, db)

    @classmethod
    def build_vision_progress_context(cls, db: Session, user_number: str, vision_id: int) -> dict[str, Any]:
        user = db.query(User).filter(User.phone_number == user_number).first()
        if not user:
            raise ValueError("User not found")

        vision = db.query(JourneyGoal).filter(
            JourneyGoal.id == vision_id,
            JourneyGoal.user_number == user_number,
        ).first()
        if not vision:
            raise ValueError("Vision not found")

        period_end = datetime.utcnow()
        period_start = period_end - timedelta(days=7)
        goals = db.query(JourneyGoal).filter(JourneyGoal.user_number == user_number).all()
        descendants = GoalProgressReviewService._collect_descendants(goals, vision_id)
        scoped_goal_ids = [vision_id, *[goal.id for goal in descendants]]
        pillars = [goal for goal in descendants if GoalProgressReviewService._level(goal) == "pillar"]
        outcomes = [goal for goal in descendants if GoalProgressReviewService._level(goal) == "outcome"]
        goals_by_id = {goal.id: goal for goal in goals}

        tasks = db.query(Task).filter(
            Task.user_number == user_number,
            Task.goal_id.in_(scoped_goal_ids),
        ).all()
        waves = db.query(VisionRoadmapWave).filter(
            VisionRoadmapWave.user_number == user_number,
            VisionRoadmapWave.vision_goal_id == vision_id,
        ).order_by(VisionRoadmapWave.sequence_order, VisionRoadmapWave.created_at).all()
        mechanical = GoalProgressReviewService.build(db, user_number, vision_id)

        completed_recent = [
            task for task in tasks
            if (task.status or "").strip().lower() in cls.COMPLETED_TASK_STATUSES
            and (task.updated_at or task.created_at or period_start) >= period_start
        ]
        upcoming = [
            task for task in tasks
            if (task.status or "open").strip().lower() not in cls.COMPLETED_TASK_STATUSES
        ]
        upcoming.sort(key=lambda task: (
            0 if task.in_top10 else 1,
            task.top10_position or 99,
            task.due_date or datetime.max,
            -(float(task.move_the_needle_score or 0)),
        ))

        latest_review = cls._latest_saved(db, user_number, vision_id)
        goal_reviews = db.query(GoalReviewSession).filter(
            GoalReviewSession.user_number == user_number,
            GoalReviewSession.goal_id.in_(scoped_goal_ids),
        ).order_by(desc(GoalReviewSession.session_ended_at)).limit(3).all()
        coaching_sessions = db.query(LeadershipCoachingSession).filter(
            LeadershipCoachingSession.user_number == user_number,
        ).order_by(desc(LeadershipCoachingSession.session_date)).limit(3).all()
        journal_entries = db.query(JournalEntry).filter(
            JournalEntry.user_id == user.id,
            JournalEntry.created_at >= period_start,
        ).order_by(desc(JournalEntry.created_at)).limit(10).all()
        journal_messages = db.query(Message).filter(
            Message.user_number == user_number,
            Message.message_type == "journal",
            Message.timestamp >= period_start,
        ).order_by(desc(Message.timestamp)).limit(10).all()
        opportunities = db.query(OpportunitySuggestion).filter(
            OpportunitySuggestion.user_id == user.id,
            OpportunitySuggestion.status == "suggested",
            or_(
                OpportunitySuggestion.linked_goal_id.in_(scoped_goal_ids),
                OpportunitySuggestion.linked_goal_id.is_(None),
            ),
        ).order_by(desc(OpportunitySuggestion.mtn_score), desc(OpportunitySuggestion.created_at)).limit(8).all()

        return {
            "user": {"id": user.id, "user_number": user_number, "name": user.name, "profession": user.profession},
            "review_period": {
                "start": period_start.isoformat(),
                "end": period_end.isoformat(),
            },
            "vision": cls._goal_to_dict(vision),
            "pillars": [cls._goal_to_dict(goal) for goal in pillars],
            "outcomes": [cls._goal_to_dict(goal) for goal in outcomes],
            "current_roadmap_wave": mechanical.get("wave_summary"),
            "roadmap_waves": [cls._wave_to_dict(wave) for wave in waves],
            "completed_tasks_last_7_days": [cls._task_to_dict(task, goals_by_id) for task in completed_recent[:15]],
            "upcoming_tasks": [cls._task_to_dict(task, goals_by_id) for task in upcoming[:20]],
            "latest_outcomes_achieved": mechanical.get("recent_outcomes", []),
            "latest_journal_entries_last_7_days": [
                cls._journal_to_dict(entry) for entry in journal_entries
            ] + [
                cls._message_to_dict(message) for message in journal_messages
            ],
            "latest_goal_review_sessions": [cls._goal_review_to_dict(item) for item in goal_reviews],
            "latest_coaching_sessions": [cls._coaching_to_dict(item) for item in coaching_sessions],
            "current_mtn_actions": [cls._opportunity_to_dict(item) for item in opportunities],
            "previous_progress_review": cls._saved_summary(latest_review) if latest_review else None,
            "mechanical_snapshot": mechanical,
            "scoped_goal_ids": scoped_goal_ids,
        }

    @classmethod
    def generate_vision_progress_review(cls, context: dict[str, Any]) -> dict[str, Any]:
        system_prompt = """You are Alfred, a strategic chief of staff and executive coach.

Generate a leadership-style 7-day progress review for the user's Vision. Be specific, grounded in the data, and action-oriented. Avoid generic or mechanical phrasing.

Return JSON only with this exact shape:
{
  "status": "Accelerating | On Track | At Risk | Stalled",
  "executive_summary": "...",
  "key_wins": ["...", "...", "..."],
  "key_risks": ["...", "..."],
  "recommended_focus": "...",
  "mtn_actions": [
    {
      "title": "...",
      "why_it_matters": "...",
      "suggested_next_step": "...",
      "linked_goal_id": null
    }
  ],
  "health_scores": {
    "momentum": "Green | Yellow | Red",
    "execution": "Green | Yellow | Red",
    "commercial_progress": "Green | Yellow | Red",
    "outcome_achievement": "Green | Yellow | Red",
    "overall_goal_health": "Green | Yellow | Red"
  }
}

Answer these questions inside the report:
- How are we progressing against this Vision over the last 7 days?
- What changed since the last review?
- What are the strongest signs of momentum?
- What are the main risks, blockers, or drift signals?
- What are the top 3 MTN actions Alfred recommends now?
- Why are these MTN actions the right next moves?
- What should the user focus on this week?"""

        response = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json.dumps(context, default=cls._json_default, ensure_ascii=False)},
            ],
            response_format={"type": "json_object"},
            temperature=0.35,
        )
        parsed = json.loads(response.choices[0].message.content)
        parsed["_raw_openai"] = {
            "model": OPENAI_MODEL,
            "content": response.choices[0].message.content,
            "usage": response.usage.model_dump() if response.usage else None,
        }
        return cls._normalize_review(parsed, context.get("scoped_goal_ids", []))

    @classmethod
    def save_vision_progress_review(cls, db: Session, context: dict[str, Any], review: dict[str, Any]) -> VisionProgressReview:
        user = context["user"]
        vision_id = context["vision"]["id"]
        period = context["review_period"]
        mtn_actions = cls._persist_mtn_actions(db, user["id"], review.get("mtn_actions", []), context)
        saved = VisionProgressReview(
            user_id=user["id"],
            user_number=user["user_number"],
            vision_id=vision_id,
            review_period_start=datetime.fromisoformat(period["start"]),
            review_period_end=datetime.fromisoformat(period["end"]),
            status=review["status"],
            executive_summary=review["executive_summary"],
            key_wins=review.get("key_wins", []),
            key_risks=review.get("key_risks", []),
            recommended_focus=review.get("recommended_focus"),
            mtn_actions=mtn_actions,
            health_scores=review.get("health_scores", {}),
            raw_context=context,
            raw_llm_response=review.get("_raw_openai", review),
            created_at=datetime.utcnow(),
        )
        db.add(saved)
        db.commit()
        db.refresh(saved)
        return saved

    @classmethod
    def _persist_mtn_actions(cls, db: Session, user_id: int, actions: list[dict[str, Any]], context: dict[str, Any]) -> list[dict[str, Any]]:
        saved_actions = []
        compact_context = {
            "vision_id": context["vision"]["id"],
            "review_period": context["review_period"],
            "source": "vision_progress_review",
        }
        for action in actions[:3]:
            suggestion = OpportunitySuggestion(
                user_id=user_id,
                surface="vision_progress_review",
                type="task",
                title=action["title"],
                description=action.get("suggested_next_step"),
                rationale=action.get("why_it_matters"),
                domain="Vision",
                linked_goal_id=action.get("linked_goal_id"),
                mtn_score=9,
                status="suggested",
                generated_context=compact_context,
                scoring_details={"source": "ai_progress_review"},
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
            db.add(suggestion)
            db.flush()
            saved_actions.append({
                "id": suggestion.id,
                "title": action["title"],
                "why_it_matters": action.get("why_it_matters"),
                "suggested_next_step": action.get("suggested_next_step"),
                "linked_goal_id": action.get("linked_goal_id"),
                "status": "suggested",
            })
        return saved_actions

    @classmethod
    def _latest_saved(cls, db: Session, user_number: str, vision_id: int) -> Optional[VisionProgressReview]:
        return db.query(VisionProgressReview).filter(
            VisionProgressReview.user_number == user_number,
            VisionProgressReview.vision_id == vision_id,
        ).order_by(desc(VisionProgressReview.created_at)).first()

    @classmethod
    def _serialize_saved(cls, saved: VisionProgressReview, db: Session) -> dict[str, Any]:
        fallback = GoalProgressReviewService.build(db, saved.user_number, saved.vision_id)
        return {
            **fallback,
            "id": saved.id,
            "source": "ai_saved",
            "review_period_start": cls._iso(saved.review_period_start),
            "review_period_end": cls._iso(saved.review_period_end),
            "created_at": cls._iso(saved.created_at),
            "status": saved.status,
            "executive_summary": saved.executive_summary,
            "key_wins": saved.key_wins or [],
            "key_risks": saved.key_risks or [],
            "recommended_focus": saved.recommended_focus,
            "goal_health": saved.health_scores or {},
            "health_scores": saved.health_scores or {},
            "recommendations": [
                {
                    "id": item.get("id"),
                    "title": item.get("title"),
                    "reason": item.get("why_it_matters"),
                    "impact": item.get("suggested_next_step"),
                    "linked_goal_id": item.get("linked_goal_id"),
                    "status": item.get("status", "suggested"),
                }
                for item in (saved.mtn_actions or [])
            ],
            "mtn_actions": saved.mtn_actions or [],
        }

    @classmethod
    def _normalize_review(cls, review: dict[str, Any], scoped_goal_ids: list[int]) -> dict[str, Any]:
        status_key = str(review.get("status") or "On Track").strip().lower()
        normalized_status = cls.STATUS_VALUES.get(status_key, "on_track")
        scoped = set(scoped_goal_ids or [])

        health = review.get("health_scores") or {}
        normalized_health = {}
        for key in ["momentum", "execution", "commercial_progress", "outcome_achievement", "overall_goal_health"]:
            value = str(health.get(key) or "Yellow").strip().lower()
            normalized_health[key] = cls.HEALTH_VALUES.get(value, "yellow")

        actions = []
        for item in review.get("mtn_actions") or []:
            if not isinstance(item, dict) or not item.get("title"):
                continue
            linked_goal_id = item.get("linked_goal_id")
            try:
                linked_goal_id = int(linked_goal_id) if linked_goal_id not in (None, "", "null") else None
            except (TypeError, ValueError):
                linked_goal_id = None
            if linked_goal_id not in scoped:
                linked_goal_id = None
            actions.append({
                "title": str(item.get("title", "")).strip(),
                "why_it_matters": str(item.get("why_it_matters") or "").strip(),
                "suggested_next_step": str(item.get("suggested_next_step") or "").strip(),
                "linked_goal_id": linked_goal_id,
            })

        return {
            **review,
            "status": normalized_status,
            "executive_summary": str(review.get("executive_summary") or "").strip(),
            "key_wins": [str(item).strip() for item in (review.get("key_wins") or []) if str(item).strip()][:3],
            "key_risks": [str(item).strip() for item in (review.get("key_risks") or []) if str(item).strip()][:4],
            "recommended_focus": str(review.get("recommended_focus") or "").strip(),
            "mtn_actions": actions[:3],
            "health_scores": normalized_health,
        }

    @staticmethod
    def _goal_to_dict(goal: JourneyGoal) -> dict[str, Any]:
        return {
            "id": goal.id,
            "title": goal.title or goal.goal_text,
            "goal_text": goal.goal_text,
            "why": goal.why,
            "time_horizon": GoalProgressReviewService._level(goal),
            "parent_goal_id": goal.parent_goal_id,
            "updated_at": VisionProgressReviewService._iso(goal.updated_at),
        }

    @staticmethod
    def _task_to_dict(task: Task, goals_by_id: dict[int, JourneyGoal]) -> dict[str, Any]:
        goal = goals_by_id.get(task.goal_id)
        return {
            "id": task.id,
            "title": task.title,
            "notes": task.notes,
            "status": task.status,
            "priority": task.priority,
            "due_date": VisionProgressReviewService._iso(task.due_date),
            "updated_at": VisionProgressReviewService._iso(task.updated_at),
            "goal_id": task.goal_id,
            "linked_goal": goal.title or goal.goal_text if goal else None,
            "in_top10": task.in_top10,
            "top10_position": task.top10_position,
            "move_the_needle_score": float(task.move_the_needle_score) if task.move_the_needle_score is not None else None,
        }

    @staticmethod
    def _wave_to_dict(wave: VisionRoadmapWave) -> dict[str, Any]:
        return {
            "id": wave.id,
            "title": wave.title,
            "description": wave.description,
            "status": wave.status,
            "target_start_date": VisionProgressReviewService._iso(wave.target_start_date),
            "target_end_date": VisionProgressReviewService._iso(wave.target_end_date),
            "outcomes": [
                {
                    "goal_id": link.goal_id,
                    "title": GoalProgressReviewService._title(link.goal),
                    "status": link.status,
                    "updated_at": VisionProgressReviewService._iso(link.updated_at),
                }
                for link in (wave.goals or [])
            ],
        }

    @staticmethod
    def _opportunity_to_dict(item: OpportunitySuggestion) -> dict[str, Any]:
        return {
            "id": item.id,
            "title": item.title,
            "description": item.description,
            "rationale": item.rationale,
            "linked_goal_id": item.linked_goal_id,
            "mtn_score": float(item.mtn_score) if item.mtn_score is not None else None,
            "created_at": VisionProgressReviewService._iso(item.created_at),
        }

    @staticmethod
    def _journal_to_dict(entry: JournalEntry) -> dict[str, Any]:
        return {
            "id": entry.id,
            "source": "journal_entry",
            "text": entry.text,
            "ai_summary": entry.ai_summary,
            "created_at": VisionProgressReviewService._iso(entry.created_at),
        }

    @staticmethod
    def _message_to_dict(message: Message) -> dict[str, Any]:
        return {
            "id": message.id,
            "source": "journal_message",
            "text": message.content,
            "created_at": VisionProgressReviewService._iso(message.timestamp),
        }

    @staticmethod
    def _goal_review_to_dict(item: GoalReviewSession) -> dict[str, Any]:
        return {
            "id": item.id,
            "goal_id": item.goal_id,
            "summary": item.summary,
            "key_progress": item.key_progress,
            "key_blockers": item.key_blockers,
            "chosen_adjustment": item.chosen_adjustment,
            "session_ended_at": VisionProgressReviewService._iso(item.session_ended_at),
        }

    @staticmethod
    def _coaching_to_dict(item: LeadershipCoachingSession) -> dict[str, Any]:
        return {
            "id": item.id,
            "quadrant": item.quadrant,
            "situation": item.situation,
            "insights": item.insights,
            "practice": item.practice,
            "completed_at": VisionProgressReviewService._iso(item.completed_at or item.session_date),
        }

    @staticmethod
    def _saved_summary(saved: VisionProgressReview) -> dict[str, Any]:
        return {
            "status": saved.status,
            "executive_summary": saved.executive_summary,
            "key_wins": saved.key_wins,
            "key_risks": saved.key_risks,
            "recommended_focus": saved.recommended_focus,
            "mtn_actions": saved.mtn_actions,
            "health_scores": saved.health_scores,
            "created_at": VisionProgressReviewService._iso(saved.created_at),
        }

    @staticmethod
    def _iso(value: Any) -> Optional[str]:
        if not value:
            return None
        if hasattr(value, "isoformat"):
            return value.isoformat()
        return str(value)

    @staticmethod
    def _json_default(value: Any) -> Any:
        if isinstance(value, Decimal):
            return float(value)
        if hasattr(value, "isoformat"):
            return value.isoformat()
        return str(value)
