import json
import logging
import time
from pathlib import Path
from typing import Any, Optional

import yaml

from app.config import OPENAI_API_KEY, OPENAI_MODEL
from app.utils.safe_errors import log_failure


PASSING_SCORE = 3
logger = logging.getLogger(__name__)


DEFAULT_PROMPT = {
    "system": (
        "You are Alfred, a supportive, encouraging, and growth-oriented leadership coach. "
        "Challenge users to go deeper when appropriate, but reward sincere effort and progress rather than seeking perfection."
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
        "Score 1 is superficial and needs revision. Score 2 is emerging understanding and needs revision. "
        "Score 3 is sufficient for progression and passes. Score 4 is strong reflection and passes. "
        "Score 5 is transformational reflection and passes."
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


def fallback_review(response_text: str, attempt_number: int = 1) -> dict[str, Any]:
    words = len((response_text or "").split())
    lower_response = (response_text or "").lower()
    has_specific_marker = any(marker in lower_response for marker in [
        "for example",
        "last week",
        "yesterday",
        "i noticed",
        "i changed",
        "next time",
        "this week",
    ])
    has_ownership_marker = any(marker in lower_response for marker in ["i own", "my part", "i should", "i could", "i learned"])
    has_next_action = any(marker in lower_response for marker in ["i will", "next", "this week", "from now on"])
    score = 4 if words >= 120 and has_specific_marker else 3 if words >= 60 and has_specific_marker else 2
    if score == 3 and has_specific_marker and has_ownership_marker and has_next_action:
        score = 4
    passed = score >= PASSING_SCORE
    feedback = (
        f"Review {attempt_number}: Strong work. Your answer gives enough concrete evidence for Alfred to see what happened, what you learned, "
        "and how you will apply it next. Keep carrying this into the next trial."
        if passed else
        f"Review {attempt_number}: Good start. The answer is not yet concrete enough to pass this trial. "
        f"You wrote about {words} words; Alfred still needs at least one relevant personal example, a clearer insight, "
        "or one action you will take before resubmitting."
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


def normalize_review(raw: dict[str, Any], response_text: str, attempt_number: int = 1) -> dict[str, Any]:
    score = clean_score(raw.get("score"))
    passed = score >= PASSING_SCORE
    feedback = str(raw.get("feedback") or "").strip()
    if not feedback:
        feedback = fallback_review(response_text, attempt_number)["feedback"]
    return {
        "passed": passed,
        "score": score,
        "strengths": listify(raw.get("strengths")),
        "growth_edges": listify(raw.get("growth_edges")),
        "required_improvements": listify(raw.get("required_improvements")),
        "feedback": feedback,
        "review_source": raw.get("review_source") or "ai",
        "attempt_number": attempt_number,
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
    attempt_number: int = 1,
    trace_id: Optional[str] = None,
) -> dict[str, Any]:
    if not OPENAI_API_KEY:
        logger.warning(
            "[belt_trial_reviewer:%s] openai_key_missing attempt=%s response_len=%s",
            trace_id or "no-trace",
            attempt_number,
            len(response_text or ""),
        )
        return normalize_review(fallback_review(response_text, attempt_number), response_text, attempt_number)

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
    user_prompt = (
        f"Review attempt number: {attempt_number}\n"
        "This may be a resubmission. Review only the current response below; do not reuse prior feedback.\n\n"
        f"{user_prompt}"
    )

    try:
        from openai import OpenAI

        started = time.perf_counter()
        logger.info(
            "[belt_trial_reviewer:%s] openai_start model=%s attempt=%s timeout_seconds=25 response_len=%s",
            trace_id or "no-trace",
            OPENAI_MODEL,
            attempt_number,
            len(response_text or ""),
        )
        client = OpenAI(
            api_key=OPENAI_API_KEY,
            timeout=25.0,
            max_retries=0,
        )
        response = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": prompt_config["system"]},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.2,
            max_tokens=900,
        )
        elapsed_ms = round((time.perf_counter() - started) * 1000)
        raw_text = response.choices[0].message.content or "{}"
        normalized = normalize_review(parse_review_response(raw_text), response_text, attempt_number)
        logger.info(
            "[belt_trial_reviewer:%s] openai_success elapsed_ms=%s attempt=%s status=%s score=%s feedback_len=%s",
            trace_id or "no-trace",
            elapsed_ms,
            attempt_number,
            "passed" if normalized.get("passed") else "needs_revision",
            normalized.get("score"),
            len(normalized.get("feedback") or ""),
        )
        return normalized
    except Exception as error:
        log_failure("belt_trial_review", error)
        normalized = normalize_review(fallback_review(response_text, attempt_number), response_text, attempt_number)
        logger.info(
            "[belt_trial_reviewer:%s] fallback_complete attempt=%s status=%s score=%s feedback_len=%s",
            trace_id or "no-trace",
            attempt_number,
            "passed" if normalized.get("passed") else "needs_revision",
            normalized.get("score"),
            len(normalized.get("feedback") or ""),
        )
        return normalized
