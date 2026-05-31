from app.services.priority_service import PriorityService
from app.services.priority_llm_service import PriorityLLMService
from app.models import Task


class MorningBriefingService:

    def __init__(self, db):
        self.db = db
        self.priority_service = PriorityService(db)
        self.llm_service = PriorityLLMService()

    def generate_move_the_needle_context(self, user_number: str) -> str:
        try:
            context, recommendation, scores, _tokens_used = self.priority_service.run_prioritization(
                user_number=user_number,
                llm_service=self.llm_service,
                max_tasks=15,
                reuse_today=True
            )

            if not recommendation or not scores:
                return "No major move-the-needle opportunities identified today."

            scores = sorted(
                scores,
                key=lambda x: x.top10_likelihood,
                reverse=True
            )

            top_scores = scores[:3]

            lines = []
            lines.append(
                "I prioritized your todo list with the move-the-needle logic so today's top actions are already waiting in the Todo List. If any of these feel off, your feedback will help me tune the ranking."
            )
            lines.append("TOP MOVE-THE-NEEDLE OPPORTUNITIES:")

            for idx, score in enumerate(top_scores, 1):
                task = self.db.query(Task).get(score.task_id)

                if not task:
                    continue

                lines.append(f"""
{idx}. {task.title}
Why it matters: {score.primary_reason}
Risk of delay: {score.risk_if_ignored}
""")

            return "\n".join(lines)

        except Exception as e:
            return "Move-the-needle opportunities unavailable today."
