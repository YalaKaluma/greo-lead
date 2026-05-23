from difflib import SequenceMatcher
from typing import Any, Dict, List


def _similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def _goal_alignment(candidate: Dict[str, Any], context: Dict[str, Any]) -> float:
    text = " ".join([
        candidate.get("title") or "",
        candidate.get("description") or "",
        candidate.get("rationale") or "",
        candidate.get("domain") or "",
    ]).lower()

    linked_goal_id = candidate.get("linked_goal_id")
    if linked_goal_id:
        return 9.0

    score = 4.0
    for goal in context.get("goals", []):
        goal_text = " ".join([
            str(goal.get("title") or ""),
            str(goal.get("goal_text") or ""),
            str(goal.get("why") or ""),
        ]).lower()
        if not goal_text.strip():
            continue
        overlap = len(set(text.split()) & set(goal_text.split()))
        score = max(score, min(8.5, 4.0 + overlap * 0.7))
    return score


def _duplicate_penalty(candidate: Dict[str, Any], context: Dict[str, Any]) -> float:
    title = candidate.get("title") or ""
    for task in context.get("open_tasks", []):
        if _similarity(title, task.get("title") or "") >= 0.78:
            return 3.0
    return 0.0


def score_opportunities_with_mtn(
    candidates: List[Dict[str, Any]],
    context: Dict[str, Any],
) -> List[Dict[str, Any]]:
    scored = []
    open_task_count = len(context.get("open_tasks", []))

    for candidate in candidates:
        title = candidate.get("title") or ""
        rationale = candidate.get("rationale") or ""
        description = candidate.get("description") or ""
        text = f"{title} {description} {rationale}".lower()

        strategic_alignment = _goal_alignment(candidate, context)
        leverage = 7.0
        if any(word in text for word in ["unblock", "unlock", "clarify", "decision", "brief", "delegate", "ship"]):
            leverage += 1.2
        if any(word in text for word in ["review", "draft", "send", "schedule", "decide"]):
            leverage += 0.4

        cost_of_delay = 5.5
        if any(word in text for word in ["today", "deadline", "risk", "delay", "follow up", "blocked"]):
            cost_of_delay += 1.3

        effort_feasibility = 7.0
        if len(title.split()) > 14 or any(word in text for word in ["build entire", "redesign", "complete all"]):
            effort_feasibility -= 1.5
        if open_task_count > 20:
            effort_feasibility -= 0.5

        emotional_weight = 5.5
        recent_journal = " ".join(
            str(entry.get("text") or entry.get("ai_summary") or "")
            for entry in context.get("recent_journal_entries", [])
        ).lower()
        if recent_journal and any(word in recent_journal for word in ["stuck", "overwhelmed", "avoid", "anxious", "tired"]):
            emotional_weight += 0.8
        if any(word in text for word in ["relationship", "recover", "rest", "team", "conversation"]):
            emotional_weight += 0.5

        compounding_effect = 6.2
        if any(word in text for word in ["system", "template", "process", "foundation", "reusable", "automate"]):
            compounding_effect += 1.5

        duplicate_penalty = _duplicate_penalty(candidate, context)
        mtn_score = (
            strategic_alignment * 0.30
            + leverage * 0.25
            + cost_of_delay * 0.15
            + effort_feasibility * 0.15
            + emotional_weight * 0.05
            + compounding_effect * 0.10
            - duplicate_penalty
        )
        mtn_score = round(max(0.0, min(10.0, mtn_score)), 1)

        scored.append({
            **candidate,
            "mtn_score": mtn_score,
            "scoring_details": {
                "strategic_alignment": round(strategic_alignment, 1),
                "leverage": round(leverage, 1),
                "cost_of_delay": round(cost_of_delay, 1),
                "effort_feasibility_today": round(effort_feasibility, 1),
                "emotional_or_cognitive_weight": round(emotional_weight, 1),
                "compounding_effect": round(compounding_effect, 1),
                "duplicate_penalty": duplicate_penalty,
            },
        })

    return scored
