from difflib import SequenceMatcher
from typing import Any, Dict, List


def _similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def select_top_opportunities(
    scored_candidates: List[Dict[str, Any]],
    limit: int = 3,
) -> List[Dict[str, Any]]:
    ordered = sorted(scored_candidates, key=lambda item: item.get("mtn_score") or 0, reverse=True)
    selected: List[Dict[str, Any]] = []
    domains = set()

    for candidate in ordered:
        title = candidate.get("title") or ""
        domain = (candidate.get("domain") or "").strip().lower()

        if any(_similarity(title, chosen.get("title") or "") >= 0.72 for chosen in selected):
            continue
        if len(selected) >= 2 and domain and domains == {domain}:
            continue
        if candidate.get("scoring_details", {}).get("effort_feasibility_today", 10) < 4.5:
            continue

        selected.append(candidate)
        if domain:
            domains.add(domain)
        if len(selected) >= limit:
            break

    if len(selected) < limit:
        for candidate in ordered:
            if candidate in selected:
                continue
            if any(_similarity(candidate.get("title") or "", chosen.get("title") or "") >= 0.72 for chosen in selected):
                continue
            selected.append(candidate)
            if len(selected) >= limit:
                break

    return selected
