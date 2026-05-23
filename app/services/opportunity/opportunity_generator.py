import json
from typing import Any, Dict, List

from openai import OpenAI

from app.config import OPENAI_API_KEY, OPENAI_MODEL

client = OpenAI(api_key=OPENAI_API_KEY)


def _compact_context(context: Dict[str, Any]) -> str:
    return json.dumps(context, default=str, ensure_ascii=False)


def generate_candidate_opportunities(
    context: Dict[str, Any],
    opportunity_type: str,
    n: int = 10,
) -> List[Dict[str, Any]]:
    system_prompt = """You generate proactive, high-leverage opportunities for Alfred, an executive chief-of-staff product.

Return structured JSON only. The user needs concrete actions they can plausibly add to today's todo list.

Each opportunity must be:
- Concrete and actionable today
- High leverage, not generic productivity advice
- Non-duplicative with existing open tasks
- Aligned with goals and journey context
- Sensitive to recent journal or emotional context
- Small enough to be a daily todo item
- Written as an action-oriented task title

JSON format:
{
  "opportunities": [
    {
      "title": "Action-oriented title",
      "description": "One-sentence task description",
      "rationale": "Why this matters now",
      "domain": "Execution",
      "linked_goal_id": null
    }
  ]
}"""

    user_prompt = f"""Generate {n} candidate opportunities.

Opportunity type: {opportunity_type}

Context:
{_compact_context(context)}"""

    response = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.35,
    )

    result = json.loads(response.choices[0].message.content)
    opportunities = result.get("opportunities", [])
    if not isinstance(opportunities, list):
        return []

    cleaned = []
    for item in opportunities[:n]:
        if not isinstance(item, dict) or not item.get("title"):
            continue
        cleaned.append({
            "title": str(item.get("title", "")).strip(),
            "description": str(item.get("description") or "").strip(),
            "rationale": str(item.get("rationale") or "").strip(),
            "domain": str(item.get("domain") or "").strip() or None,
            "linked_goal_id": item.get("linked_goal_id"),
        })

    return cleaned
