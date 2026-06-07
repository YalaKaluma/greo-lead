import json
from pathlib import Path
from typing import Any, Optional

import yaml

from app.config import OPENAI_API_KEY, OPENAI_MODEL


PASSING_SCORE = 4


DEFAULT_PROMPT = {
    "system": (
        "You are Alfred, a supportive but demanding leadership coach. Review one belt trial submission. "
        "Encourage what is real, name what is still too generic, and decide whether this specific trial is sufficient."
    ),
    "user_template": (
        "Review this Journey belt trial.\n\n"
        "Domain: {domain_name}\n"
        "Current belt being worked: {target_belt}\n"
        "Trial type: {trial_type}\n"
        "Trial title: {trial_title}\n"
        "Trial objective: {belt_objective}\n"
        "Prompt: {prompt}\n"
        "User response: {response_text}\n\n"
        "Criteria:\n"
        "- Reflection depth\n"
        "- Specificity and concreteness\n"
        "- Ownership/accountability\n"
        "- Evidence of behavior change or real-world application\n"
        "- Connection to the belt/domain objective\n"
        "- Clarity of next action\n\n"
        "Return valid JSON only with this shape:\n"
        "{{\n"
        '  "passed": false,\n'
        '  "score": 1,\n'
        '  "strengths": ["..."],\n'
        '  "growth_edges": ["..."],\n'
        '  "required_improvements": ["..."],\n'
        '  "feedback": "A direct coaching note written to the user."\n'
        "}}\n"
        "Use score 1-5. Passing requires a 4 or 5 and enough concrete evidence to satisfy this trial."
    ),
}


def load_trial_review_prompt() -> dict[str, str]:
    config_path = Path(__file__).parent.parent / "prompts" / "journey" / "belt_trial_review.yaml"
    try:
        with open(config_path, "r", encoding="utf-8") as file:
            loaded = yaml.safe_load(file) or {}
            return {
                "system": loaded.get("system") or DEFAULT_PROMPT["system"],
                "user_template": loaded.get("user_template") or DEFAULT_PROMPT["user_template"],
            }
    except FileNotFoundError:
        return DEFAULT_PROMPT


def parse_review_response(raw_text: str) -> dict[str, Any]:
    cleaned = (raw_text or "").strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    if cleaned.startswith("```"):
        cleaned = cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    return json.loads(cleaned.strip())


def clean_score(value: Any, default: int = 2) -> int:
    try:
        return max(1, min(5, int(value)))
    except (TypeError, ValueError):
        return default


def listify(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item or "").strip()]
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return []


def fallback_review(response_text: str) -> dict[str, Any]:
    words = len((response_text or "").split())
    has_specific_marker = any(marker in (response_text or "").lower() for marker in [
        "for example",
        "last week",
        "yesterday",
        "i noticed",
        "i changed",
        "next time",
        "this week",
    ])
    score = 4 if words >= 120 and has_specific_marker else 3 if words >= 80 else 2
    passed = score >= PASSING_SCORE
    feedback = (
        "Strong work. Your answer gives enough concrete evidence for Alfred to see what happened, what you learned, "
        "and how you will apply it next. Keep carrying this into the next trial."
        if passed else
        "Good start. The answer is not yet concrete enough to pass this trial. Add one real situation, name the pattern "
        "you noticed, own your part in it, and describe one behavior you will change before resubmitting."
    )
    return {
        "passed": passed,
        "score": score,
        "strengths": ["You have started the reflection and identified a relevant leadership theme."],
        "growth_edges": ["The answer needs more concrete lived evidence and a clearer next action."],
        "required_improvements": [] if passed else [
            "Add one specific real-life example.",
            "Explain what pattern you noticed and what you own in it.",
            "Name one behavior you will change or practice next.",
        ],
        "feedback": feedback,
        "review_source": "fallback",
    }


def normalize_review(raw: dict[str, Any], response_text: str) -> dict[str, Any]:
    score = clean_score(raw.get("score"))
    passed = bool(raw.get("passed")) and score >= PASSING_SCORE
    feedback = str(raw.get("feedback") or "").strip()
    if not feedback:
        feedback = fallback_review(response_text)["feedback"]
    return {
        "passed": passed,
        "score": score,
        "strengths": listify(raw.get("strengths")),
        "growth_edges": listify(raw.get("growth_edges")),
        "required_improvements": listify(raw.get("required_improvements")),
        "feedback": feedback,
        "review_source": raw.get("review_source") or "ai",
    }


def review_belt_trial(
    *,
    domain_name: str,
    target_belt: str,
    trial_type: str,
    trial_title: str,
    belt_objective: Optional[str],
    prompt: str,
    response_text: str,
) -> dict[str, Any]:
    if not OPENAI_API_KEY:
        return normalize_review(fallback_review(response_text), response_text)

    prompt_config = load_trial_review_prompt()
    user_prompt = prompt_config["user_template"].format(
        domain_name=domain_name,
        target_belt=target_belt,
        trial_type=trial_type,
        trial_title=trial_title,
        belt_objective=belt_objective or "No belt objective supplied.",
        prompt=prompt,
        response_text=response_text,
    )

    try:
        from openai import OpenAI

        client = OpenAI(api_key=OPENAI_API_KEY)
        response = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": prompt_config["system"]},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.2,
            max_tokens=900,
        )
        raw_text = response.choices[0].message.content or "{}"
        return normalize_review(parse_review_response(raw_text), response_text)
    except Exception as error:
        print(f"Error reviewing belt trial: {error}")
        return normalize_review(fallback_review(response_text), response_text)
