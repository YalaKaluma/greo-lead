from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import Meeting, MeetingActionItem, Task
from app.services.priority_llm_service import PriorityLLMService
from app.services.priority_service import PriorityService
from app.services.timezone_service import get_user_timezone, today_for_timezone


def score_pending_meeting_action_items(
    db: Session,
    user_number: str,
    *,
    meeting_id: int | None = None,
    limit: int = 50,
) -> int:
    query = db.query(MeetingActionItem).join(Meeting).filter(
        Meeting.user_number == user_number,
        MeetingActionItem.created_task_id.is_(None),
        MeetingActionItem.ignored_at.is_(None),
        MeetingActionItem.mtn_score.is_(None),
    )
    if meeting_id is not None:
        query = query.filter(MeetingActionItem.meeting_id == meeting_id)
    actions = query.limit(limit).all()
    if not actions:
        return 0

    context = PriorityService(db).create_context_snapshot(user_number)
    today = today_for_timezone(get_user_timezone(db, user_number))
    temporary_tasks = [Task(
        id=-action.id,
        user_number=user_number,
        title=action.description,
        notes=f"Meeting: {action.meeting.title}\nOwner: {action.owner_name or 'Unclear'}",
        due_date=datetime.combine(action.due_date or today, datetime.min.time()),
        priority=action.priority or "Medium",
        status="open",
        goal_id=action.goal_id,
        delegated_to=action.delegated_to or action.owner_name,
        created_at=action.created_at or datetime.now(timezone.utc),
    ) for action in actions]
    result = PriorityLLMService().score_tasks(temporary_tasks, context)
    score_by_action_id = {-int(item["task_id"]): item for item in result["scores"]}
    scored_at = datetime.now(timezone.utc)
    for action in actions:
        score = score_by_action_id.get(action.id)
        if not score:
            continue
        action.mtn_score = score["top10_likelihood"]
        action.mtn_reason = score.get("primary_reason")
        action.mtn_risk_if_ignored = score.get("risk_if_ignored")
        action.mtn_scored_at = scored_at
    return len(score_by_action_id)
