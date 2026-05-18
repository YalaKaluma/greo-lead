from app.services.priority_service import PriorityService
from app.services.priority_llm_service import PriorityLLMService


class MorningBriefingService:

    def __init__(self, db):
        self.db = db
        self.priority_service = PriorityService(db)
        self.llm_service = PriorityLLMService()

    def generate_move_the_needle_context(self, user_number: str) -> str:
        try:
            # Create prioritization snapshot
            context = self.priority_service.create_context_snapshot(user_number)

            # Get candidate tasks
            tasks = self.priority_service.get_tasks_for_scoring(user_number)

            # Safety limit
            tasks = tasks[:15]

            if not tasks:
                return "No major move-the-needle opportunities identified today."

            # Score tasks
            scoring_result = self.llm_service.score_tasks(tasks, context)

            scores = scoring_result["scores"]

            # Sort descending
            scores = sorted(
                scores,
                key=lambda x: x["top10_likelihood"],
                reverse=True
            )

            # Take top 3
            top_scores = scores[:3]

            # Build output
            lines = []
            lines.append("TOP MOVE-THE-NEEDLE OPPORTUNITIES:")

            for idx, score in enumerate(top_scores, 1):

                task = next(
                    (t for t in tasks if t.id == score["task_id"]),
                    None
                )

                if not task:
                    continue

                lines.append(f"""
{idx}. {task.title}
Why it matters: {score["primary_reason"]}
Risk of delay: {score["risk_if_ignored"]}
""")

            return "\n".join(lines)

        except Exception as e:
            return "Move-the-needle opportunities unavailable today."