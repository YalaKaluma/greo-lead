import app.services.journey_service as journey_service


def _bullets(lines, empty="None logged yet."):
    if not lines:
        return empty
    return "\n".join([f"- {x}" for x in lines])


def build_journey_context(db, user_number):
    """
    Returns a multi-line string summarizing the user’s structured memory.

    NOTE: Format is intentionally structured with labeled sections to improve
    prompt adherence and make memory easier for the model to use explicitly.
    """

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

    return context.strip()
