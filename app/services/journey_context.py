import app.services.journey_service as journey_service


def _bullets(lines, empty="None logged yet."):
    if not lines:
        return empty
    return "\n".join([f"- {x}" for x in lines])


def _format_goal_review_sessions(sessions) -> str:
    """
    Format goal review sessions for context.
    Shows last 3 reviews with key takeaways.
    """
    if not sessions:
        return ""

    lines = []
    for session in sessions:
        # Format the date nicely
        date_str = session.session_ended_at.strftime("%B %d, %Y")

        lines.append(f"📅 {session.goal_title} - {date_str}")

        # Summary (only if meaningful)
        if session.summary and session.summary != "Session completed early - summary not generated":
            # Truncate if too long
            summary = session.summary[:200] + "..." if len(session.summary) > 200 else session.summary
            lines.append(f"   {summary}")

        # Progress (convert bullet points to inline if present)
        if session.key_progress and session.key_progress != "Not captured":
            # Replace newlines with " | " for inline display
            progress = session.key_progress.replace("\n", " | ").replace("• ", "")
            if len(progress) > 150:
                progress = progress[:150] + "..."
            lines.append(f"   ✅ Progress: {progress}")

        # Blockers
        if session.key_blockers and session.key_blockers != "Not captured":
            blockers = session.key_blockers.replace("\n", " | ").replace("• ", "")
            if len(blockers) > 150:
                blockers = blockers[:150] + "..."
            lines.append(f"   🚧 Blockers: {blockers}")

        # Pattern (this is gold - always include if present)
        if session.key_pattern and session.key_pattern != "Not captured":
            lines.append(f"   🔍 Pattern: {session.key_pattern}")

        # Commitment (the most important piece)
        if session.chosen_adjustment and session.chosen_adjustment != "Not captured":
            lines.append(f"   💪 Committed to: {session.chosen_adjustment}")

        lines.append("")  # Blank line between sessions

    return "\n".join(lines)


def build_journey_context(db, user_number):
    """
    Returns a multi-line string summarizing the user's structured memory.

    NOTE: Format is intentionally structured with labeled sections to improve
    prompt adherence and make memory easier for the model to use explicitly.

    Now includes goal review history for continuity across sessions.
    """
    from app.models import GoalReviewSession

    strengths = journey_service.get_strengths(db, user_number)
    projects = journey_service.get_projects(db, user_number)
    people = journey_service.get_people(db, user_number)
    goals = journey_service.get_goals(db, user_number)
    failures = journey_service.get_failures(db, user_number)
    dev_areas = journey_service.get_development_areas(db, user_number)

    strengths_lines = [s.strength for s in strengths] if strengths else []
    dev_area_lines = [d.skill for d in dev_areas] if dev_areas else []

    goals_lines = []
    if goals:
        for g in goals:
            why = g.why or "not provided"
            goals_lines.append(f"{g.goal_text} (why: {why})")

    projects_lines = []
    if projects:
        for p in projects:
            goal = p.goal or "not defined"
            projects_lines.append(f"{p.project_name} (goal: {goal})")

    people_lines = []
    if people:
        for p in people:
            # Avoid "None" spam in the text
            email = p.email or "n/a"
            phone = p.phone or "n/a"
            people_lines.append(f"{p.name} (email: {email}, phone: {phone})")

    failures_lines = []
    if failures:
        for f in failures:
            learning = f.learning or "none"
            scar = f.scar or "none"
            failures_lines.append(f"{f.failure_text} | learning: {learning} | scar: {scar}")

    # NEW: Load goal review history (most recent 3 sessions)
    goal_reviews = (
        db.query(GoalReviewSession)
        .filter(GoalReviewSession.user_number == user_number)
        .order_by(GoalReviewSession.session_ended_at.desc())
        .limit(3)  # Keep context manageable
        .all()
    )

    # Build the context string
    context = f"""
CONTEXT (User Journey Memory)
============================

RELEVANT GOALS:
{_bullets(goals_lines, empty="None logged yet.")}

ACTIVE PROJECTS:
{_bullets(projects_lines, empty="None logged yet.")}

STRENGTHS:
{_bullets(strengths_lines, empty="None logged yet.")}

DEVELOPMENT AREAS:
{_bullets(dev_area_lines, empty="None logged yet.")}

IMPORTANT PEOPLE:
{_bullets(people_lines, empty="None logged yet.")}

FAILURES / LEARNINGS / SCARS:
{_bullets(failures_lines, empty="None logged yet.")}
"""

    # NEW: Add goal review history if available
    if goal_reviews:
        review_section = f"""

RECENT GOAL REVIEWS:
{_format_goal_review_sessions(goal_reviews)}
(Use this history to reference past commitments and track patterns across reviews)
"""
        context += review_section

    return context.strip()