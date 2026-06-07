from datetime import datetime

from sqlalchemy.orm import Session

from app.models import Habit, JournalEntry, JourneyGoal, JourneyPerson, Message, Task, User


STARTER_SEED_KEY = "starter_examples_seeded_v1"
STARTER_TASK_TITLES = [
    "Migrate my current task list to Alfred",
    "Define my top 3 goals for this year",
    "Complete my first journal reflection",
    "Review my Leadership Journey wheel",
    "Start preparing for my Yellow Belt",
    "Create my first recurring habit",
    "Review and sort my task list for the week",
]


def ensure_starter_examples_seeded(db: Session, user: User) -> bool:
    """Seed editable starter content once for a newly created user."""
    if not user or not user.id or not user.phone_number:
        return False

    onboarding_data = dict(user.onboarding_data or {})
    if onboarding_data.get(STARTER_SEED_KEY):
        return False

    created_goals = _seed_goals(db, user.phone_number)
    _seed_tasks(db, user.phone_number, created_goals)
    _seed_habits(db, user.phone_number)
    _seed_journal_examples(db, user)
    _seed_people(db, user.phone_number)

    onboarding_data[STARTER_SEED_KEY] = {
        "seeded_at": datetime.utcnow().isoformat(),
        "version": 1,
    }
    user.onboarding_data = onboarding_data
    return True


def ensure_starter_tasks_visible_today(db: Session, user_number: str) -> int:
    """Make previously seeded undated starter tasks visible in the default task view."""
    if not user_number:
        return 0

    tasks = db.query(Task).filter(
        Task.user_number == user_number,
        Task.status == "open",
        Task.due_date.is_(None),
        Task.title.in_(STARTER_TASK_TITLES),
    ).all()

    now = datetime.utcnow()
    for task in tasks:
        task.due_date = now
        task.current_bucket = task.current_bucket or "today"
        task.updated_at = now

    return len(tasks)


def _seed_goals(db: Session, user_number: str) -> dict[str, JourneyGoal]:
    goal_specs = [
        {
            "key": "software_business",
            "vision": "Build my own software business",
            "description": "Create a profitable software business that generates recurring revenue and meaningful impact.",
            "why": "To gain more freedom, build something of my own, and create value at scale.",
            "pillars": [
                ("Build a first MVP", "Launch the first usable MVP"),
                ("Acquire first paying customers", "Sign the first 10 active users or customers"),
                ("Build a repeatable growth engine", "Reach the first $1,000 in monthly recurring revenue"),
            ],
        },
        {
            "key": "marathon",
            "vision": "Run my first marathon",
            "description": "Complete a marathon within the next 12 months by building endurance, consistency, and confidence.",
            "why": "To improve my health, discipline, resilience, and sense of personal achievement.",
            "pillars": [
                ("Build endurance gradually", "Run a 10K comfortably"),
                ("Improve nutrition and recovery", "Complete a half marathon"),
                ("Prevent injuries through consistency and mobility", "Complete the full marathon"),
            ],
        },
    ]

    created: dict[str, JourneyGoal] = {}
    sort_order = 0
    for spec in goal_specs:
        vision = JourneyGoal(
            user_number=user_number,
            title=spec["vision"],
            goal_text=spec["description"],
            why=spec["why"],
            time_horizon="vision",
            sort_order=sort_order,
        )
        db.add(vision)
        db.flush()
        created[spec["key"]] = vision
        sort_order += 1

        for pillar_title, outcome_title in spec["pillars"]:
            pillar = JourneyGoal(
                user_number=user_number,
                title=pillar_title,
                goal_text=pillar_title,
                time_horizon="pillar",
                parent_goal_id=vision.id,
                sort_order=sort_order,
            )
            db.add(pillar)
            db.flush()
            sort_order += 1

            outcome = JourneyGoal(
                user_number=user_number,
                title=outcome_title,
                goal_text=outcome_title,
                time_horizon="outcome",
                parent_goal_id=pillar.id,
                sort_order=sort_order,
            )
            db.add(outcome)
            db.flush()
            sort_order += 1

    return created


def _seed_tasks(db: Session, user_number: str, goals: dict[str, JourneyGoal]) -> None:
    starter_note = "Starter example from Alfred. Edit or delete this whenever you are ready."
    task_specs = [
        ("Migrate my current task list to Alfred", None, "high"),
        ("Define my top 3 goals for this year", goals.get("software_business"), "high"),
        ("Complete my first journal reflection", None, "medium"),
        ("Review my Leadership Journey wheel", None, "medium"),
        ("Start preparing for my Yellow Belt", None, "medium"),
        ("Create my first recurring habit", None, "medium"),
        ("Review and sort my task list for the week", None, "medium"),
    ]

    now = datetime.utcnow()
    for index, (title, goal, priority) in enumerate(task_specs):
        db.add(Task(
            user_number=user_number,
            title=title,
            notes=starter_note,
            due_date=now,
            status="open",
            priority=priority,
            goal_id=goal.id if goal else None,
            current_bucket="today" if index < 3 else "this_week",
            sort_order=index,
        ))


def _seed_habits(db: Session, user_number: str) -> None:
    for title in [
        "Morning workout",
        "Fill out my journal",
        "Review and sort my todo list",
        "Evening reflection",
    ]:
        db.add(Habit(
            user_number=user_number,
            title=title,
            frequency="daily",
            is_active=True,
        ))


def _seed_journal_examples(db: Session, user: User) -> None:
    examples = [
        {
            "title": "A productive but busy day",
            "body": "Had a busy day at work. Got a lot done and felt productive, but I did not take much time to think about whether I was working on the right things.",
            "score": 2.0,
            "level": 1,
            "label": "Description",
        },
        {
            "title": "Reacting versus leading",
            "body": "I noticed today that I spent most of my time reacting to requests instead of working on my most strategic priorities. The issue was not really lack of time. It was that I did not clearly decide what mattered most before the day started. Tomorrow I want to choose my top priority first, then protect time for it before opening myself up to everyone else's agenda.",
            "score": 8.0,
            "level": 4,
            "label": "Pattern Recognition",
        },
    ]

    for item in examples:
        text = f"{item['title']}\n\n{item['body']}"
        depth_explanation = "Starter example created by Alfred to demonstrate reflection depth."
        depth_recommendations = ["Edit or delete this example once you have added your own reflections."]

        db.add(JournalEntry(
            user_id=user.id,
            text=text,
            reflection_depth_score=item["score"],
            reflection_depth_level=item["level"],
            reflection_depth_label=item["label"],
            reflection_depth_explanation=depth_explanation,
            reflection_depth_recommendations=depth_recommendations,
            reflection_depth_scored_at=datetime.utcnow(),
        ))
        db.add(Message(
            sender="user",
            user_number=user.phone_number,
            content=text,
            message_type="journal",
            conversation_type="journal",
            is_read=True,
            reflection_depth_score=item["score"],
            reflection_depth_level=item["level"],
            reflection_depth_label=item["label"],
            reflection_depth_explanation=depth_explanation,
            reflection_depth_recommendations=depth_recommendations,
            reflection_depth_scored_at=datetime.utcnow(),
        ))


def _seed_people(db: Session, user_number: str) -> None:
    people = [
        {
            "name": "Sarah Chen",
            "relation": "Direct report",
            "strengths": "Analytical thinking\nReliability\nStrong ownership",
            "growth_areas": "Executive communication\nSpeaking up earlier when risks appear",
            "aspirations": "Wants to grow into a broader leadership role and become more confident presenting to senior stakeholders.",
        },
        {
            "name": "Michael Torres",
            "relation": "Peer",
            "strengths": "Relationship building\nStakeholder management\nPositive energy",
            "growth_areas": "Delegation\nFollowing through on decisions",
            "aspirations": "Wants to become more structured in how he leads cross-functional work.",
        },
    ]

    for person in people:
        db.add(JourneyPerson(
            user_number=user_number,
            name=person["name"],
            relation=person["relation"],
            strengths=person["strengths"],
            growth_areas=person["growth_areas"],
            aspirations=person["aspirations"],
            context="Starter example from Alfred. Edit or delete this profile whenever you are ready.",
        ))
