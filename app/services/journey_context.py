# app/services/journey_context.py

#from app.services import journey_service
import app.services.journey_service as journey_service


def build_journey_context(db, user_number):
    """Returns a multi-line string summarizing the user’s structured memory."""

    strengths = journey_service.get_strengths(db, user_number)
    projects = journey_service.get_projects(db, user_number)
    people = journey_service.get_people(db, user_number)
    goals = journey_service.get_goals(db, user_number)
    failures = journey_service.get_failures(db, user_number)
    dev_areas = journey_service.get_development_areas(db, user_number)

    # Convert to readable text
    strengths_txt = ", ".join([s.strength for s in strengths]) if strengths else "None logged yet."
    projects_txt = "\n".join([f"- {p.project_name} (goal: {p.goal or 'not defined'})" for p in projects]) if projects else "None."
    people_txt = "\n".join([f"- {p.name} (email: {p.email}, phone: {p.phone})" for p in people]) if people else "None."
#    goals_txt = "\n".join([f"- {g.goal} (why: {g.why or 'not provided'})" for g in goals]) if goals else "None."
    goals_txt = "\n".join([f"- {g.goal_text} (why: {g.why or 'not provided'})" for g in goals]) if goals else "None."
    dev_areas_txt = ", ".join([d.skill for d in dev_areas]) if dev_areas else "None."

    if failures:
        failures_txt = "\n".join([
#            f"- {f.event} | learning: {f.learning or 'none'} | scar: {f.scar or 'none'}"
            f"- {f.failure_text} | learning: {f.learning or 'none'} | scar: {f.scar or 'none'}"
            for f in failures
        ])
    else:
        failures_txt = "No failures logged yet."

    # Build unified context
    context = f"""
USER JOURNEY CONTEXT
====================

STRENGTHS:
{strengths_txt}

DEVELOPMENT AREAS:
{dev_areas_txt}

GOALS:
{goals_txt}

PROJECTS:
{projects_txt}

IMPORTANT PEOPLE:
{people_txt}

FAILURES / LEARNINGS / SCARS:
{failures_txt}
"""

    return context.strip()
