from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from app.models import (
    Habit,
    JournalEntry,
    JourneyGoal,
    JourneyPerson,
    Message,
    Task,
    User,
    VisionRoadmapWave,
    WaveGoal,
)


STARTER_SEED_KEY = "starter_examples_seeded_v1"
ROADMAP_SEED_KEY = "starter_roadmaps_seeded_v1"
STARTER_TASK_TITLES = [
    "Migrate my current task list to Alfred",
    "Define my top 3 goals for this year",
    "Complete my first journal reflection",
    "Review my Leadership Journey wheel",
    "Start preparing for my Yellow Belt",
    "Create my first recurring habit",
    "Review and sort my task list for the week",
]

SAMPLE_GOAL_SPECS = [
    {
        "key": "software_business",
        "vision": "Build My Own Software Business",
        "description": "Create a profitable software business that generates recurring revenue, meaningful impact, and greater freedom over how I spend my time.",
        "why": "Create a profitable software business that generates recurring revenue, meaningful impact, and greater freedom over how I spend my time.",
        "pillars": [
            {
                "title": "Build a First MVP",
                "aliases": ["Build a first MVP"],
                "outcomes": [
                    "Validate a real customer problem",
                    "Define MVP scope",
                    "Build the first usable MVP",
                    "Launch beta version",
                    "Collect feedback from first users",
                ],
            },
            {
                "title": "Acquire First Paying Customers",
                "aliases": ["Acquire first paying customers"],
                "outcomes": [
                    "Define ideal customer profile",
                    "Build outreach list",
                    "Run first customer interviews",
                    "Sign first customer",
                    "Reach 10 active paying customers",
                ],
            },
            {
                "title": "Build a Repeatable Growth Engine",
                "aliases": ["Build a repeatable growth engine"],
                "outcomes": [
                    "Create website and positioning",
                    "Build content strategy",
                    "Launch acquisition channels",
                    "Create customer onboarding process",
                    "Reach $1,000 MRR",
                ],
            },
        ],
        "roadmap": [
            {
                "title": "Wave 1 - Validate The Opportunity",
                "goal": "Confirm that a real market opportunity exists.",
                "target": "Months 1-2",
                "pillar": "Build a First MVP",
                "outcomes": [
                    "Validate customer problem",
                    "Interview 20 potential users",
                    "Define target audience",
                    "Prioritize MVP features",
                ],
            },
            {
                "title": "Wave 2 - Build The MVP",
                "goal": "Create the first working product.",
                "target": "Months 3-4",
                "pillar": "Build a First MVP",
                "outcomes": [
                    "Design MVP",
                    "Build MVP",
                    "Launch beta version",
                    "Collect user feedback",
                ],
            },
            {
                "title": "Wave 3 - Acquire First Customers",
                "goal": "Get real users and prove willingness to pay.",
                "target": "Months 5-6",
                "pillar": "Acquire First Paying Customers",
                "outcomes": [
                    "Launch outreach campaign",
                    "Run demos",
                    "Close first customer",
                    "Reach 10 active users",
                ],
            },
            {
                "title": "Wave 4 - Build The Growth Engine",
                "goal": "Create repeatable acquisition and retention.",
                "target": "Months 7-12",
                "pillar": "Build a Repeatable Growth Engine",
                "outcomes": [
                    "Website",
                    "Content strategy",
                    "Customer onboarding",
                    "Analytics dashboard",
                    "Reach $1,000 MRR",
                ],
            },
        ],
    },
    {
        "key": "marathon",
        "vision": "Run My First Marathon",
        "description": "Improve health, discipline, resilience, and confidence.",
        "why": "Improve health, discipline, resilience, and confidence.",
        "pillars": [
            {
                "title": "Build Endurance",
                "aliases": ["Build endurance gradually"],
                "outcomes": [
                    "Run consistently 3x per week",
                    "Complete first 5K",
                    "Complete first 10K",
                    "Complete first Half Marathon",
                ],
            },
            {
                "title": "Improve Recovery & Nutrition",
                "aliases": ["Improve nutrition and recovery"],
                "outcomes": [
                    "Sleep 7+ hours",
                    "Improve nutrition habits",
                    "Establish mobility routine",
                    "Reduce injury risk",
                ],
            },
            {
                "title": "Complete Marathon",
                "aliases": ["Prevent injuries through consistency and mobility"],
                "outcomes": [
                    "Select race",
                    "Complete training plan",
                    "Complete 30K long run",
                    "Complete Marathon",
                ],
            },
        ],
        "roadmap": [
            {
                "title": "Wave 1 - Build Consistency",
                "goal": "Build the running rhythm that makes the marathon possible.",
                "target": "Months 1-2",
                "pillar": "Build Endurance",
                "outcomes": ["Run 3x per week", "Complete 5K"],
            },
            {
                "title": "Wave 2 - Build Endurance",
                "goal": "Extend distance while keeping training sustainable.",
                "target": "Months 3-4",
                "pillar": "Build Endurance",
                "outcomes": ["Complete 10K", "Increase weekly mileage"],
            },
            {
                "title": "Wave 3 - Half Marathon",
                "goal": "Turn endurance into race-ready confidence.",
                "target": "Months 5-6",
                "pillar": "Build Endurance",
                "outcomes": ["Complete Half Marathon", "Refine pacing strategy"],
            },
            {
                "title": "Wave 4 - Marathon Preparation",
                "goal": "Complete the final preparation block and finish the marathon.",
                "target": "Months 7-12",
                "pillar": "Complete Marathon",
                "outcomes": [
                    "Complete marathon training block",
                    "Run 30K long run",
                    "Complete Marathon",
                ],
            },
        ],
    },
]


def ensure_starter_examples_seeded(db: Session, user: User) -> bool:
    """Seed editable starter content once for a newly created user."""
    if not user or not user.id or not user.phone_number:
        return False

    onboarding_data = dict(user.onboarding_data or {})
    seeded_anything = False
    is_new_starter_seed = not onboarding_data.get(STARTER_SEED_KEY)

    created_goals = _seed_goals(
        db,
        user.phone_number,
        allow_missing_visions=is_new_starter_seed,
    )

    if is_new_starter_seed:
        _seed_tasks(db, user.phone_number, created_goals)
        _seed_habits(db, user.phone_number)
        _seed_journal_examples(db, user)
        _seed_people(db, user.phone_number)

        onboarding_data[STARTER_SEED_KEY] = {
            "seeded_at": datetime.utcnow().isoformat(),
            "version": 1,
        }
        seeded_anything = True

    if not onboarding_data.get(ROADMAP_SEED_KEY):
        if _seed_roadmaps(db, user.phone_number, created_goals):
            onboarding_data[ROADMAP_SEED_KEY] = {
                "seeded_at": datetime.utcnow().isoformat(),
                "version": 1,
            }
            seeded_anything = True

    user.onboarding_data = onboarding_data
    return seeded_anything


def ensure_starter_roadmaps_seeded(db: Session, user: User) -> bool:
    """Backfill starter roadmaps for users who already received the starter examples."""
    if not user or not user.id or not user.phone_number:
        return False

    onboarding_data = dict(user.onboarding_data or {})
    if onboarding_data.get(ROADMAP_SEED_KEY):
        return False

    has_starter_context = bool(onboarding_data.get(STARTER_SEED_KEY)) or _has_sample_visions(db, user.phone_number)
    if not has_starter_context:
        return False

    goals = _seed_goals(db, user.phone_number, allow_missing_visions=False)
    if not _seed_roadmaps(db, user.phone_number, goals):
        return False

    onboarding_data[ROADMAP_SEED_KEY] = {
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


def _seed_goals(db: Session, user_number: str, allow_missing_visions: bool) -> dict[str, dict]:
    seeded: dict[str, dict] = {}
    for spec in SAMPLE_GOAL_SPECS:
        vision = _find_or_create_goal(
            db,
            user_number=user_number,
            title=spec["vision"],
            goal_text=spec["description"],
            time_horizon="vision",
            why=spec["why"],
            allow_create=allow_missing_visions,
        )
        if not vision:
            continue

        entry = {"vision": vision, "pillars": {}, "outcomes": {}}
        seeded[spec["key"]] = entry

        for pillar_spec in spec["pillars"]:
            pillar = _find_or_create_goal(
                db,
                user_number=user_number,
                title=pillar_spec["title"],
                goal_text=pillar_spec["title"],
                time_horizon="pillar",
                parent_goal_id=vision.id,
                aliases=pillar_spec.get("aliases", []),
                allow_create=True,
            )
            if not pillar:
                continue
            entry["pillars"][pillar_spec["title"]] = pillar

            for outcome_title in pillar_spec["outcomes"]:
                outcome = _find_or_create_goal(
                    db,
                    user_number=user_number,
                    title=outcome_title,
                    goal_text=outcome_title,
                    time_horizon="outcome",
                    parent_goal_id=pillar.id,
                    allow_create=True,
                )
                if outcome:
                    entry["outcomes"][outcome_title] = outcome

        _ensure_roadmap_outcome_goals(db, user_number, spec, entry)

    return seeded


def _seed_roadmaps(db: Session, user_number: str, seeded_goals: dict[str, dict]) -> bool:
    seeded_any = False
    today = date.today()
    target_windows = [
        (0, 59),
        (60, 119),
        (120, 179),
        (180, 365),
    ]

    for spec in SAMPLE_GOAL_SPECS:
        goal_entry = seeded_goals.get(spec["key"])
        if not goal_entry or not goal_entry.get("vision"):
            continue

        vision = goal_entry["vision"]
        existing_wave = db.query(VisionRoadmapWave).filter(
            VisionRoadmapWave.user_number == user_number,
            VisionRoadmapWave.vision_goal_id == vision.id,
        ).first()
        if existing_wave:
            continue

        for index, wave_spec in enumerate(spec["roadmap"]):
            start_offset, end_offset = target_windows[min(index, len(target_windows) - 1)]
            wave = VisionRoadmapWave(
                user_number=user_number,
                vision_goal_id=vision.id,
                title=wave_spec["title"],
                description=f"{wave_spec['goal']}\n\nTarget: {wave_spec['target']}",
                sequence_order=index,
                status="not_started",
                target_start_date=today + timedelta(days=start_offset),
                target_end_date=today + timedelta(days=end_offset),
            )
            db.add(wave)
            db.flush()

            for goal_index, outcome_title in enumerate(wave_spec["outcomes"]):
                outcome = goal_entry["outcomes"].get(outcome_title)
                if not outcome:
                    continue
                db.add(WaveGoal(
                    wave_id=wave.id,
                    goal_id=outcome.id,
                    sequence_order=goal_index,
                    status="not_started",
                ))

            seeded_any = True

    return seeded_any


def _ensure_roadmap_outcome_goals(
        db: Session,
        user_number: str,
        spec: dict,
        goal_entry: dict,
) -> None:
    for wave_spec in spec["roadmap"]:
        pillar = goal_entry["pillars"].get(wave_spec["pillar"])
        if not pillar:
            continue

        for outcome_title in wave_spec["outcomes"]:
            outcome = _find_or_create_goal(
                db,
                user_number=user_number,
                title=outcome_title,
                goal_text=outcome_title,
                time_horizon="outcome",
                parent_goal_id=pillar.id,
                allow_create=True,
            )
            if outcome:
                goal_entry["outcomes"][outcome_title] = outcome


def _find_or_create_goal(
        db: Session,
        user_number: str,
        title: str,
        goal_text: str,
        time_horizon: str,
        parent_goal_id: int | None = None,
        why: str | None = None,
        aliases: list[str] | None = None,
        allow_create: bool = True,
) -> JourneyGoal | None:
    goal = _find_goal_by_title(
        db,
        user_number=user_number,
        title=title,
        time_horizon=time_horizon,
        parent_goal_id=parent_goal_id,
        aliases=aliases or [],
    )
    if goal:
        goal.title = title
        goal.goal_text = goal_text
        if why is not None:
            goal.why = why
        goal.updated_at = datetime.utcnow()
        return goal

    if not allow_create:
        return None

    goal = JourneyGoal(
        user_number=user_number,
        title=title,
        goal_text=goal_text,
        why=why,
        time_horizon=time_horizon,
        parent_goal_id=parent_goal_id,
        sort_order=_next_goal_sort_order(db, user_number),
    )
    db.add(goal)
    db.flush()
    return goal


def _find_goal_by_title(
        db: Session,
        user_number: str,
        title: str,
        time_horizon: str,
        parent_goal_id: int | None,
        aliases: list[str],
) -> JourneyGoal | None:
    titles = {_normalize_title(title)}
    titles.update(_normalize_title(alias) for alias in aliases)
    query = db.query(JourneyGoal).filter(
        JourneyGoal.user_number == user_number,
        JourneyGoal.time_horizon == time_horizon,
    )
    if parent_goal_id is None:
        query = query.filter(JourneyGoal.parent_goal_id.is_(None))
    else:
        query = query.filter(JourneyGoal.parent_goal_id == parent_goal_id)

    for goal in query.all():
        if _normalize_title(goal.title) in titles:
            return goal
    return None


def _has_sample_visions(db: Session, user_number: str) -> bool:
    for spec in SAMPLE_GOAL_SPECS:
        if _find_goal_by_title(
            db,
            user_number=user_number,
            title=spec["vision"],
            time_horizon="vision",
            parent_goal_id=None,
            aliases=[],
        ):
            return True
    return False


def _next_goal_sort_order(db: Session, user_number: str) -> int:
    latest = db.query(JourneyGoal).filter(
        JourneyGoal.user_number == user_number,
    ).order_by(JourneyGoal.sort_order.desc()).first()
    if not latest or latest.sort_order is None:
        return 0
    return latest.sort_order + 1


def _normalize_title(title: str | None) -> str:
    return (title or "").strip().casefold()


def _seed_tasks(db: Session, user_number: str, goals: dict[str, dict]) -> None:
    software_goal = goals.get("software_business", {}).get("vision")
    starter_note = "Starter example from Alfred. Edit or delete this whenever you are ready."
    task_specs = [
        ("Migrate my current task list to Alfred", None, "high"),
        ("Define my top 3 goals for this year", software_goal, "high"),
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
