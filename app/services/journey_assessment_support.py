from app.services.journey_support import *

def gather_belt_assessment_evidence(db: Session, user_number: str, current_belt: str) -> dict:
    trials = db.query(JourneyBeltTrial).filter(
        JourneyBeltTrial.user_number == user_number,
        JourneyBeltTrial.target_belt == current_belt,
    ).order_by(JourneyBeltTrial.updated_at.desc()).all()

    subdomains = {}
    for dimension_id, dimension in JOURNEY_DIMENSIONS.items():
        subdomains[dimension["name"]] = {}
        for topic in dimension["topics"]:
            subdomains[dimension["name"]][topic["label"]] = serialize_items(
                get_topic_items_for_evidence(db, user_number, topic),
                limit=10,
            )

    return {
        "user_number": user_number,
        "current_belt": current_belt,
        "assessment_scope": "Score only current belt curriculum evidence: completed belt trials, reflection answers, real-world trial submissions, and belt-specific development exercises.",
        "leadership_wheel": {
            dimension["name"]: [topic["label"] for topic in dimension["topics"]]
            for dimension in JOURNEY_DIMENSIONS.values()
        },
        "belt_trials": serialize_items(trials, limit=50),
        "belt_subdomain_evidence": subdomains,
        "vision_goal_tree": serialize_vision_tree_for_assessment(db, user_number),
    }


def parse_assessment_response(raw_text: str) -> dict:
    cleaned = (raw_text or "").strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    if cleaned.startswith("```"):
        cleaned = cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    return json.loads(cleaned.strip())


def display_belt_name(belt_id: str) -> str:
    return f"{(belt_id or '').replace('_', ' ').title()} Belt"


def direct_address_text(value: Any) -> Any:
    if isinstance(value, str):
        replacements = {
            "the user is": "you are",
            "the user has": "you have",
            "the user shows": "you show",
            "the user demonstrates": "you demonstrate",
            "the user needs": "you need",
            "the user's": "your",
            "The user is": "You are",
            "The user has": "You have",
            "The user shows": "You show",
            "The user demonstrates": "You demonstrate",
            "The user needs": "You need",
            "The user's": "Your",
            "the user": "you",
            "The user": "You",
        }
        text = value
        for old, new in replacements.items():
            text = text.replace(old, new)
        return text
    if isinstance(value, list):
        return [direct_address_text(item) for item in value]
    if isinstance(value, dict):
        return {key: direct_address_text(item) for key, item in value.items()}
    return value


def default_subdomain_actions(domain_name: str, subdomain_name: str) -> list[str]:
    lower = subdomain_name.lower()
    if "vision" == lower:
        return ["Update your Vision page.", "Create 3 roadmap milestones connected to your vision."]
    if "team" in lower:
        return ["Add or update key people on My Team.", "Complete one team review or relationship check-in."]
    if "delegate" in lower or "coach" in lower:
        return ["Run one coaching session on delegation.", "Add one Coach & Delegate reflection after a real delegation moment."]
    if "execution" in lower or "prioritization" in lower:
        return ["Create a 7-day execution challenge in your task list.", "Review your top priorities daily for one week."]
    if "procrastination" in lower:
        return ["Add one procrastination reflection after an avoidance moment.", "Create one task that breaks a delayed item into a first action."]
    if "energy" in lower or "recovery" in lower:
        return ["Track one recovery habit for 7 days.", "Add one journal entry after a stressful or draining day."]
    if "failure" in lower or "development" in lower:
        return ["Update your development plan.", "Add one reflection under Failures & Scars or Development Opportunities."]
    return [f"Add one reflection for {subdomain_name}.", f"Create one task in Alfred connected to {domain_name}."]


def build_subdomain_feedback(domain_name: str, subdomain_name: str, evidence_items: list[dict[str, Any]]) -> dict:
    has_evidence = bool(evidence_items)
    return {
        "score": 3 if has_evidence else 1,
        "status": "meaningful foundation" if has_evidence else "needs deeper work",
        "current_readiness": (
            f"Your {subdomain_name} reflection gives Alfred an early foundation to coach from, but it needs sharper examples and clearer next steps."
            if has_evidence else
            f"Your current belt work in {subdomain_name} is still too thin or incomplete for Alfred to coach from with confidence."
        ),
        "why": (
            f"The submitted Journey work touches {subdomain_name}, but it needs more honest detail, concrete situations, and reflection on the pattern underneath."
            if has_evidence else
            f"This part of the wheel needs more belt-specific reflection, not stronger leadership performance. Add enough detail for Alfred to understand what you are noticing and what you want to change."
        ),
        "improve": default_subdomain_actions(domain_name, subdomain_name),
    }


def score_to_status(score: Any) -> str:
    try:
        score_value = int(score)
    except (TypeError, ValueError):
        score_value = 3
    if score_value <= 1:
        return "needs deeper work"
    if score_value == 2:
        return "emerging reflection"
    if score_value == 3:
        return "meaningful foundation"
    if score_value == 4:
        return "deeply explored"
    return "exceptional reflection"


def clean_score(score: Any, default: int = 3) -> int:
    try:
        return max(1, min(5, int(score)))
    except (TypeError, ValueError):
        return default


def normalize_subdomain_score(raw_subdomain: Any, default_feedback: dict) -> dict:
    if not isinstance(raw_subdomain, dict):
        raw_subdomain = {}
    score = clean_score(raw_subdomain.get("score"), default_feedback["score"])
    improve = raw_subdomain.get("improve") or raw_subdomain.get("next_actions_in_alfred") or default_feedback["improve"]
    if isinstance(improve, str):
        improve = [improve]
    return {
        "score": score,
        "status": raw_subdomain.get("status") or score_to_status(score),
        "current_readiness": raw_subdomain.get("current_readiness") or raw_subdomain.get("assessment") or default_feedback["current_readiness"],
        "why": raw_subdomain.get("why") or raw_subdomain.get("evidence_observed") or default_feedback["why"],
        "improve": improve[:3] if isinstance(improve, list) else default_feedback["improve"],
    }


def normalize_wheel_scores(result: dict, evidence: dict) -> dict:
    raw = result.get("wheel_scores") or result.get("wheel_feedback") or {}
    evidence_by_domain = evidence.get("belt_subdomain_evidence") or evidence.get("subdomain_evidence") or {}
    wheel_scores = {}

    for domain in JOURNEY_DIMENSIONS.values():
        domain_name = domain["name"]
        raw_domain = raw.get(domain_name) if isinstance(raw.get(domain_name), dict) else {}
        evidence_domain = evidence_by_domain.get(domain_name) or {}
        subdomains = {}

        for topic in domain["topics"]:
            subdomain_name = topic["label"]
            raw_subdomain = (raw_domain.get("subdomains") or {}).get(subdomain_name)
            default_feedback = build_subdomain_feedback(
                domain_name,
                subdomain_name,
                evidence_domain.get(subdomain_name) or [],
            )
            subdomains[subdomain_name] = normalize_subdomain_score(raw_subdomain, default_feedback)

        scores = [item["score"] for item in subdomains.values()]
        domain_score = clean_score(raw_domain.get("domain_score"), round(sum(scores) / len(scores)) if scores else 3)
        wheel_scores[domain_name] = {
            "domain_score": domain_score,
            "summary": raw_domain.get("summary") or raw_domain.get("overall_assessment") or f"Your {domain_name} Journey work is {score_to_status(domain_score)} based on reflection depth, specificity, and actionability.",
            "subdomains": subdomains,
        }

    return direct_address_text(wheel_scores)


def flatten_wheel_scores(wheel_scores: dict) -> list[dict[str, Any]]:
    items = []
    for domain_name, domain in wheel_scores.items():
        for subdomain_name, feedback in (domain.get("subdomains") or {}).items():
            items.append({
                "domain": domain_name,
                "subdomain": subdomain_name,
                "score": clean_score(feedback.get("score")),
                "feedback": feedback,
            })
    return items


def compute_journey_depth_score(wheel_scores: dict) -> int:
    scores = [item["score"] for item in flatten_wheel_scores(wheel_scores)]
    if not scores:
        return 0
    return round((sum(scores) / len(scores)) * 20)


def recommendation_from_score(score: int) -> str:
    if score >= 60:
        return "ready_for_promotion"
    if score >= 50:
        return "almost_ready"
    if score >= 35:
        return "not_ready"
    return "needs_more_evidence"


def derive_promotion_limiters(wheel_scores: dict, result: dict) -> list[dict[str, Any]]:
    raw_limiters = result.get("promotion_limiters")
    if isinstance(raw_limiters, list) and raw_limiters:
        return direct_address_text(raw_limiters[:3])

    limiters = []
    for item in sorted(flatten_wheel_scores(wheel_scores), key=lambda entry: entry["score"])[:3]:
        feedback = item["feedback"]
        improve = feedback.get("improve") or default_subdomain_actions(item["domain"], item["subdomain"])
        limiters.append({
            "domain": item["domain"],
            "subdomain": item["subdomain"],
            "score": item["score"],
            "why_it_limits_promotion": feedback.get("why") or f"{item['subdomain']} needs clearer, more specific Journey work before it can support promotion.",
            "what_to_do_next": improve[0] if improve else f"Add one concrete {item['subdomain']} reflection inside Alfred.",
        })
    return direct_address_text(limiters)


def derive_strongest_areas(wheel_scores: dict, result: dict) -> list[dict[str, Any]]:
    raw_strongest = result.get("strongest_areas")
    if isinstance(raw_strongest, list) and raw_strongest:
        return direct_address_text(raw_strongest[:3])

    strongest = []
    for item in sorted(flatten_wheel_scores(wheel_scores), key=lambda entry: entry["score"], reverse=True)[:3]:
        feedback = item["feedback"]
        strongest.append({
            "domain": item["domain"],
            "subdomain": item["subdomain"],
            "score": item["score"],
            "why_it_is_strong": feedback.get("why") or f"{item['subdomain']} is one of the deepest, most coachable areas in your current belt work.",
        })
    return direct_address_text(strongest)


def derive_priority_actions(wheel_scores: dict, result: dict) -> list[dict[str, str]]:
    raw_actions = result.get("priority_next_actions")
    if isinstance(raw_actions, list) and raw_actions:
        return direct_address_text(raw_actions[:5])

    actions = []
    for item in sorted(flatten_wheel_scores(wheel_scores), key=lambda entry: entry["score"])[:5]:
        feedback = item["feedback"]
        next_action = (feedback.get("improve") or default_subdomain_actions(item["domain"], item["subdomain"]))[0]
        actions.append({
            "domain": item["domain"],
            "subdomain": item["subdomain"],
            "action": next_action,
            "why_it_matters": "This is one of the clearest places to make your Journey work deeper, more specific, and easier for Alfred to coach from.",
        })
    return direct_address_text(actions[:5])


def wheel_scores_to_legacy_feedback(wheel_scores: dict) -> dict:
    legacy = {}
    for domain_name, domain in wheel_scores.items():
        subdomains = {}
        for subdomain_name, feedback in (domain.get("subdomains") or {}).items():
            subdomains[subdomain_name] = {
                "score": feedback.get("score"),
                "assessment": feedback.get("current_readiness"),
                "evidence_observed": feedback.get("why"),
                "missing_evidence": feedback.get("why"),
                "next_actions_in_alfred": feedback.get("improve") or [],
            }
        legacy[domain_name] = {
            "overall_assessment": domain.get("summary"),
            "strengths": [],
            "growth_edges": [],
            "subdomains": subdomains,
        }
    return legacy


def is_placeholder_text(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    stripped = value.strip().lower()
    return stripped.startswith("write ") or "based only on the submitted journey work" in stripped


def clean_profile(profile: dict) -> dict:
    if not isinstance(profile, dict):
        profile = {}
    cleaned = {
        "headline": profile.get("headline"),
        "description": profile.get("description"),
        "likely_strengths": profile.get("likely_strengths"),
        "likely_risks": profile.get("likely_risks"),
        "current_growth_edge": profile.get("current_growth_edge"),
    }
    if is_placeholder_text(cleaned["headline"]):
        cleaned["headline"] = None
    if is_placeholder_text(cleaned["description"]):
        cleaned["description"] = None
    if is_placeholder_text(cleaned["current_growth_edge"]):
        cleaned["current_growth_edge"] = None
    cleaned["likely_strengths"] = [
        item for item in (cleaned["likely_strengths"] or [])
        if not is_placeholder_text(item)
    ]
    cleaned["likely_risks"] = [
        item for item in (cleaned["likely_risks"] or [])
        if not is_placeholder_text(item)
    ]
    return cleaned


def normalize_assessment_result(result: dict, evidence: dict, target_belt: str) -> dict:
    result = direct_address_text(result or {})
    wheel_scores = normalize_wheel_scores(result, evidence)
    journey_depth_score = compute_journey_depth_score(wheel_scores)
    recommendation = recommendation_from_score(journey_depth_score)
    profile = clean_profile(result.get("leadership_profile") or {})
    profile = {
        **{
            "headline": "The Reflective Builder",
            "description": "Your Journey work suggests you are building self-awareness through the current belt. Your next edge is turning insight into clearer examples and more actionable reflection.",
            "likely_strengths": ["Willingness to reflect", "Interest in intentional growth"],
            "likely_risks": ["Insight that stays abstract", "Uneven reflection depth across the wheel"],
            "current_growth_edge": "Turning reflection into specific, coachable next steps.",
        },
        **{key: value for key, value in profile.items() if value},
    }
    direct_summary = result.get("direct_summary") or result.get("summary") or result.get("assessment_summary") or ""
    if is_placeholder_text(direct_summary):
        direct_summary = ""
    if not direct_summary:
        direct_summary = (
            "Alfred reviewed the depth, honesty, specificity, and actionability of your current belt work. "
            "Use the heatmap to see which sections are already coachable and which need deeper reflection."
        )
    limiters = derive_promotion_limiters(wheel_scores, result)
    strongest = derive_strongest_areas(wheel_scores, result)
    priority_actions = derive_priority_actions(wheel_scores, result)
    developmental_scores = result.get("journey_depth_scores") or result.get("developmental_dimension_scores") or result.get("dimension_scores") or {
        "reflection_depth": 3,
        "specificity": 3,
        "authenticity_honesty": 3,
        "intentionality": 3,
        "completeness": 3,
        "actionability": 3,
        "self_awareness": 3,
    }
    coaching_note = result.get("alfred_coaching_note") or result.get("final_coaching_note") or (
        "Focus on the lowest-scoring sections in the heatmap. Add one concrete example, one pattern you notice, and one next action Alfred can help you practice."
    )

    return {
        **result,
        "recommendation": recommendation,
        "readiness_score": journey_depth_score,
        "target_belt": result.get("target_belt") or display_belt_name(target_belt),
        "direct_summary": direct_summary,
        "leadership_profile": direct_address_text(profile),
        "wheel_scores": wheel_scores,
        "wheel_feedback": result.get("wheel_feedback") or wheel_scores_to_legacy_feedback(wheel_scores),
        "promotion_limiters": limiters,
        "strongest_areas": strongest,
        "priority_next_actions": priority_actions,
        "developmental_dimension_scores": direct_address_text(developmental_scores),
        "journey_depth_scores": direct_address_text(developmental_scores),
        "dimension_scores": direct_address_text(developmental_scores),
        "alfred_coaching_note": direct_address_text(coaching_note),
    }


def fallback_assessment_from_evidence(evidence: dict) -> dict:
    trial_count = len(evidence.get("belt_trials") or [])
    score = min(84, 55 + trial_count * 3)
    base = {
        "recommendation": recommendation_from_score(score),
        "readiness_score": score,
        "direct_summary": "Your current belt work is ready to review, but some parts of the wheel need deeper, more specific reflection before promotion. This is about strengthening the homework, not judging your leadership worth.",
        "leadership_profile": {
            "headline": "The Reflective Builder",
            "description": "Your Journey work suggests you are engaging seriously with the current belt. Your next edge is making your reflections more concrete, honest, and actionable.",
            "likely_strengths": ["Willingness to reflect", "Interest in structured growth"],
            "likely_risks": ["Staying at the level of insight", "Writing answers that are too abstract for coaching"],
            "current_growth_edge": "Turning completed exercises into specific, coachable reflection.",
        },
        "journey_depth_scores": {
            "reflection_depth": 3,
            "specificity": 3,
            "authenticity_honesty": 3,
            "intentionality": 3,
            "completeness": 3,
            "actionability": 3,
            "self_awareness": 3,
        },
        "priority_next_actions": [
            {
                "domain": "Learning & Development",
                "subdomain": "Development Plan",
                "action": "Update your Development Plan with 3 specific behaviors you want to practice and why each one matters.",
                "why_it_matters": "Specific practice goals make your Journey work more actionable and easier for Alfred to coach.",
            }
        ],
        "alfred_coaching_note": "Use the lowest-scoring areas in the heatmap as your reflection plan. Add one concrete example, one pattern you notice, and one next action Alfred can help you practice.",
    }
    return normalize_assessment_result(base, evidence, evidence.get("target_belt") or "")



