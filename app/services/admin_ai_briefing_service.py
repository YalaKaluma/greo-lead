import json
from datetime import datetime, timedelta
from typing import Any

from fastapi import HTTPException
from openai import OpenAI
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import OPENAI_API_KEY, OPENAI_MODEL
from app.models import (
    AdminAIBriefing,
    Habit,
    HabitCompletion,
    JournalEntry,
    JourneyBeltTrial,
    JourneyGoal,
    LeadershipCoachingSession,
    Message,
    MessageFeedback,
    Task,
    TaskPriorityDecision,
    UsageEvent,
    User,
)
from app.services.admin_system_health_service import AdminSystemHealthService


BRIEFING_TYPES = {"feedback", "usage", "operations"}


class AdminAIBriefingService:
    def __init__(self, db: Session):
        self.db = db

    def latest(self, briefing_type: str) -> AdminAIBriefing | None:
        self._validate_type(briefing_type)
        return (
            self.db.query(AdminAIBriefing)
            .filter(AdminAIBriefing.briefing_type == briefing_type)
            .order_by(AdminAIBriefing.created_at.desc(), AdminAIBriefing.id.desc())
            .first()
        )

    def generate(self, briefing_type: str, admin_user: User) -> AdminAIBriefing:
        self._validate_type(briefing_type)
        if not OPENAI_API_KEY:
            raise HTTPException(status_code=503, detail="OpenAI is not configured.")

        snapshot = self._snapshot_for(briefing_type)
        prompt = self._prompt_for(briefing_type, snapshot)
        model = OPENAI_MODEL or "gpt-4o"

        client = OpenAI(api_key=OPENAI_API_KEY)
        response = client.chat.completions.create(
            model=model,
            temperature=0.2,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are Alfred's admin intelligence analyst. Be concise, specific, and operational. "
                        "Use only the provided data. If data is thin, say so plainly. "
                        "Return JSON with keys: title, summary, top_recommendations, codex_brief. "
                        "top_recommendations must be an array of exactly three short actionable strings. "
                        "codex_brief should be null unless the user asks for operational/Railway analysis."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
        )

        parsed = self._parse_ai_json(response.choices[0].message.content or "")
        briefing = AdminAIBriefing(
            briefing_type=briefing_type,
            admin_user_id=admin_user.id,
            title=parsed["title"],
            summary_text=parsed["summary"],
            codex_brief=parsed.get("codex_brief"),
            top_recommendations=parsed["top_recommendations"],
            source_snapshot=snapshot,
            model=model,
        )
        self.db.add(briefing)
        self.db.commit()
        self.db.refresh(briefing)
        return briefing

    def _snapshot_for(self, briefing_type: str) -> dict[str, Any]:
        if briefing_type == "feedback":
            return self._feedback_snapshot()
        if briefing_type == "usage":
            return self._usage_snapshot()
        return self._operations_snapshot()

    def _feedback_snapshot(self) -> dict[str, Any]:
        message_rows = (
            self.db.query(MessageFeedback, Message, User)
            .outerjoin(Message, MessageFeedback.message_id == Message.id)
            .outerjoin(User, MessageFeedback.user_id == User.id)
            .order_by(MessageFeedback.created_at.desc(), MessageFeedback.id.desc())
            .limit(80)
            .all()
        )
        message_feedback = []
        for feedback, message, user in message_rows:
            message_feedback.append({
                "rating": feedback.rating,
                "comment": feedback.feedback_text,
                "status": feedback.status,
                "source_context": feedback.source_context,
                "message_type": getattr(message, "message_type", None),
                "conversation_type": getattr(message, "conversation_type", None),
                "message_excerpt": (message.content[:220] if message and message.content else ""),
                "user": user.name if user else None,
                "created_at": feedback.created_at.isoformat() if feedback.created_at else None,
            })

        priority_rows = (
            self.db.query(TaskPriorityDecision, Task)
            .outerjoin(Task, TaskPriorityDecision.task_id == Task.id)
            .filter(TaskPriorityDecision.user_reason.isnot(None))
            .order_by(TaskPriorityDecision.decided_at.desc(), TaskPriorityDecision.id.desc())
            .limit(80)
            .all()
        )
        mtn_feedback = []
        for decision, task in priority_rows:
            payload = self._parse_json(decision.user_reason)
            if payload.get("source") != "mtn_tag_feedback":
                continue
            mtn_feedback.append({
                "rating": payload.get("rating"),
                "tag": payload.get("tag"),
                "comment": payload.get("feedback"),
                "status": decision.admin_review_status,
                "task_title": task.title if task else None,
                "created_at": decision.decided_at.isoformat() if decision.decided_at else None,
            })

        return {
            "message_feedback": message_feedback[:60],
            "mtn_feedback": mtn_feedback[:60],
            "counts": {
                "message_feedback": len(message_feedback),
                "mtn_feedback": len(mtn_feedback),
            },
        }

    def _usage_snapshot(self) -> dict[str, Any]:
        now = datetime.utcnow()
        since_30 = now - timedelta(days=30)
        users = self.db.query(User).order_by(User.created_at.desc().nullslast(), User.id.desc()).all()
        page_rows = (
            self.db.query(UsageEvent.page, func.count(UsageEvent.id))
            .filter(UsageEvent.created_at >= since_30, UsageEvent.page.isnot(None))
            .group_by(UsageEvent.page)
            .order_by(func.count(UsageEvent.id).desc())
            .all()
        )
        user_rows = []
        for user in users:
            identifiers = [value for value in [user.phone_number, user.email] if value]
            user_rows.append({
                "name": user.name or user.email or user.phone_number,
                "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
                "page_views": self._count(UsageEvent, UsageEvent.user_id == user.id, UsageEvent.event_type == "page_view"),
                "messages_sent": self._count(Message, Message.user_number.in_(identifiers), Message.sender != "assistant") if identifiers else 0,
                "tasks_completed": self._count(Task, Task.user_number.in_(identifiers), Task.status == "completed") if identifiers else 0,
                "habit_completions": (
                    self.db.query(func.count(HabitCompletion.id))
                    .join(Habit, HabitCompletion.habit_id == Habit.id)
                    .filter(Habit.user_number.in_(identifiers), HabitCompletion.status == "done")
                    .scalar()
                    or 0
                ) if identifiers else 0,
                "journal_entries": self._count(JournalEntry, JournalEntry.user_id == user.id),
                "journey_records": (
                    self._count(JourneyGoal, JourneyGoal.user_number.in_(identifiers))
                    + self._count(JourneyBeltTrial, JourneyBeltTrial.user_number.in_(identifiers))
                ) if identifiers else 0,
                "coaching_sessions": self._count(LeadershipCoachingSession, LeadershipCoachingSession.user_number.in_(identifiers)) if identifiers else 0,
            })

        return {
            "top_pages_30_days": [{"page": page, "count": count} for page, count in page_rows],
            "users": user_rows,
        }

    def _operations_snapshot(self) -> dict[str, Any]:
        health = AdminSystemHealthService(self.db).get_health_snapshot()
        return {
            "status": health.get("status"),
            "database": health.get("database"),
            "summary": health.get("summary"),
            "recent_errors": health.get("recent_errors", [])[:20],
            "deployment_status": health.get("deployment_status"),
            "railway_error_logs": (health.get("railway_logs") or {}).get("error_logs", [])[:20],
        }

    def _prompt_for(self, briefing_type: str, snapshot: dict[str, Any]) -> str:
        data = json.dumps(snapshot, default=str)[:14000]
        if briefing_type == "feedback":
            task = (
                "Summarize user feedback and MTN scoring feedback. Identify recurring friction, sentiment, "
                "and the three top product/coaching adjustments Alfred should make next."
            )
        elif briefing_type == "usage":
            task = (
                "Analyze usage and adoption. Look for potential bottlenecks, underused areas, inactive users, "
                "or places where the user journey appears to stall. Recommend three adoption interventions."
            )
        else:
            task = (
                "Analyze operational health. Use Alfred API events and Railway logs to identify the top three "
                "operational issues to investigate. Focus on reliability, errors, response time, and deployment signals. "
                "Also produce codex_brief: a practical implementation brief for Codex with context, observed evidence, "
                "files/areas likely involved if inferable, acceptance criteria, and a concise ordered investigation plan."
            )
        return f"{task}\n\nData snapshot:\n{data}"

    def _parse_ai_json(self, content: str) -> dict[str, Any]:
        stripped = content.strip()
        if stripped.startswith("```"):
            stripped = stripped.strip("`")
            stripped = stripped.replace("json\n", "", 1).replace("JSON\n", "", 1).strip()
        try:
            parsed = json.loads(stripped)
        except json.JSONDecodeError:
            parsed = {
                "title": "Admin Intelligence",
                "summary": content.strip(),
                "top_recommendations": [],
                "codex_brief": None,
            }
        recommendations = parsed.get("top_recommendations") or []
        if not isinstance(recommendations, list):
            recommendations = [str(recommendations)]
        recommendations = [str(item).strip() for item in recommendations if str(item).strip()][:3]
        while len(recommendations) < 3:
            recommendations.append("Collect more data before making a major change.")
        raw_codex_brief = parsed.get("codex_brief")
        if isinstance(raw_codex_brief, (dict, list)):
            codex_brief = json.dumps(raw_codex_brief, indent=2)
        elif raw_codex_brief is None:
            codex_brief = None
        else:
            codex_brief = str(raw_codex_brief).strip() or None

        return {
            "title": str(parsed.get("title") or "Admin Intelligence")[:160],
            "summary": str(parsed.get("summary") or "").strip() or "No summary returned.",
            "top_recommendations": recommendations,
            "codex_brief": codex_brief,
        }

    def _validate_type(self, briefing_type: str) -> None:
        if briefing_type not in BRIEFING_TYPES:
            raise HTTPException(status_code=422, detail="Invalid briefing type")

    def _count(self, model, *filters) -> int:
        return self.db.query(func.count(model.id)).filter(*filters).scalar() or 0

    def _parse_json(self, raw: str | None) -> dict[str, Any]:
        try:
            parsed = json.loads(raw or "{}")
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
