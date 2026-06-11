from __future__ import annotations

import argparse
import random
import sys
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import text

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.db import SessionLocal
from app.models import (
    BeltAssessment,
    ConversationState,
    DailyEnergyCheckin,
    GoalReviewSession,
    Habit,
    HabitCoachingReview,
    HabitCompletion,
    JournalEntry,
    JourneyBeltTrial,
    JourneyCoachingMoment,
    JourneyDevelopmentArea,
    JourneyEnergyDrain,
    JourneyEnergySource,
    JourneyExecutionSystem,
    JourneyFailure,
    JourneyGoal,
    JourneyInspiration,
    JourneyOpportunity,
    JourneyPerson,
    JourneyProcrastinationPattern,
    JourneyRecoveryMethod,
    JourneyStrength,
    JourneyTeamComposition,
    JourneyValue,
    LeadershipCoachingSession,
    Message,
    OpportunitySuggestion,
    RelationshipReview,
    SubscriptionStatus,
    Task,
    TaskPrioritizationContext,
    TaskPriorityRecommendation,
    TaskPriorityScore,
    UsageEvent,
    User,
    VisionProgressReview,
    VisionRoadmapWave,
    WaveGoal,
)
from app.utils.security import hash_password
from scripts.synthetic_users.load_persona import load_persona
from scripts.synthetic_users.reset_user import reset_synthetic_user


DEFAULT_PASSWORD = "DemoPass123!"
BELT_ORDER = ["white", "yellow", "green", "brown", "black"]
JOURNEY_DIMENSIONS = ["vision", "people", "execute", "energy", "learning"]


class SyntheticUserSeeder:
    def __init__(self, db, persona: dict[str, Any], persona_name: str):
        self.db = db
        self.persona = persona
        self.persona_name = persona_name
        self.metadata = persona.get("metadata") or {}
        self.months = int(self.metadata.get("created_over_months") or persona.get("created_over_months") or 9)
        self.today = date.today()
        self.start_date = self.today - timedelta(days=max(30, self.months * 30))
        self.rng = random.Random(persona_name)
        self.user: User | None = None
        self.goals_by_title: dict[str, JourneyGoal] = {}
        self.vision_goals: dict[str, JourneyGoal] = {}
        self.outcomes: list[JourneyGoal] = []

    def seed(self) -> User:
        self.ensure_schema()
        user_spec = self.persona["user"]
        existing = self.db.query(User).filter(User.email == user_spec["email"]).first()
        if existing:
            if not existing.is_synthetic_user:
                raise ValueError(f"Refusing to overwrite {user_spec['email']}: existing user is not synthetic.")
            reset_synthetic_user(self.db, user_spec["email"], delete_user=True)

        self.user = self.load_user()
        self.load_goals()
        self.load_roadmap()
        self.load_tasks()
        self.load_habits()
        self.load_journal()
        self.load_people()
        self.load_journey()
        self.load_opportunities()
        self.load_behavioral_telemetry()
        self.db.commit()
        self.db.refresh(self.user)
        return self.user

    def ensure_schema(self) -> None:
        required_columns = {
            "users": {"is_synthetic_user", "synthetic_user_type"},
            "journey_procrastination_patterns": {"underlying_reason", "strategy"},
            "journey_energy_drains": {"mitigation"},
            "journey_execution_systems": {"effectiveness"},
            "journey_inspiration": {"approach", "effectiveness"},
            "journey_coaching_moments": {"outcome", "learning"},
            "journey_team_composition": {"dynamics"},
        }
        missing: list[str] = []
        for table_name, expected_columns in required_columns.items():
            existing_columns = set(
                self.db.execute(
                    text(
                        """
                        SELECT column_name
                        FROM information_schema.columns
                        WHERE table_schema = current_schema()
                          AND table_name = :table_name
                        """
                    ),
                    {"table_name": table_name},
                ).scalars().all()
            )
            for column_name in sorted(expected_columns - existing_columns):
                missing.append(f"{table_name}.{column_name}")

        if missing:
            raise RuntimeError(
                "Synthetic user schema is missing columns. Run db_migrations before seeding: "
                + ", ".join(missing)
            )

    def load_user(self) -> User:
        user_spec = self.persona["user"]
        first_name = user_spec.get("first_name") or (user_spec.get("name") or "Synthetic").split(" ")[0]
        last_name = user_spec.get("last_name") or "User"
        name = user_spec.get("name") or f"{first_name} {last_name}".strip()
        phone_number = user_spec.get("phone_number") or f"synthetic:{self.persona_name}"
        synthetic_type = self.metadata.get("synthetic_type") or "demo"

        created_at = datetime.combine(self.start_date, time(hour=9))
        trial_start = created_at
        user = User(
            phone_number=phone_number,
            email=user_spec["email"],
            name=name,
            profession=user_spec.get("profession") or self.metadata.get("profession"),
            password_hash=hash_password(user_spec.get("password") or DEFAULT_PASSWORD),
            is_synthetic_user=True,
            synthetic_user_type=synthetic_type,
            onboarding_completed=True,
            onboarding_step="COMPLETED",
            onboarding_data={
                "synthetic_persona": self.persona_name,
                "focus": self.metadata.get("focus") or [],
                "current_belt": (self.persona.get("leadership_journey") or {}).get("current_belt"),
            },
            subscription_status=SubscriptionStatus.TRIAL,
            trial_start_date=trial_start,
            trial_end_date=trial_start + timedelta(days=365),
            tour_completed=True,
            tour_current_step=None,
            tour_completed_steps=["goals", "tasks", "team", "journey", "habits", "journal"],
            last_login_at=datetime.utcnow() - timedelta(days=1),
            last_active_at=datetime.utcnow() - timedelta(hours=2),
            created_at=created_at,
            updated_at=datetime.utcnow(),
        )
        self.db.add(user)
        self.db.flush()
        return user

    @property
    def user_number(self) -> str:
        return self.user.phone_number

    def load_goals(self) -> None:
        vision_specs = self.persona.get("visions")
        if not vision_specs:
            legacy_vision = self.persona.get("vision") or {}
            vision_specs = [{
                **legacy_vision,
                "pillars": self.persona.get("pillars") or [],
                "roadmap": self.persona.get("roadmap") or [],
            }]

        for value_spec in self.persona.get("values") or []:
            self.db.add(JourneyValue(
                user_number=self.user_number,
                title=value_spec["title"],
                value_text=value_spec.get("description") or value_spec["title"],
                why=value_spec.get("why"),
                first_seen_at=self._dt_months_ago(self.months - 1),
            ))

        for vision_index, vision_spec in enumerate(vision_specs):
            vision_title = vision_spec.get("title") or "Build a Life of Impact"
            vision = self._goal(
                title=vision_title,
                goal_text=vision_spec.get("description") or vision_title,
                why=vision_spec.get("why"),
                time_horizon="vision",
                sort_order=vision_index,
                first_seen_at=self._dt_months_ago(self.months),
            )
            self.vision_goals[vision_title] = vision

            for pillar_index, pillar_spec in enumerate(vision_spec.get("pillars") or []):
                pillar = self._goal(
                    title=pillar_spec["title"],
                    goal_text=pillar_spec.get("description") or pillar_spec["title"],
                    why=pillar_spec.get("why"),
                    time_horizon="pillar",
                    parent_goal_id=vision.id,
                    sort_order=pillar_index,
                    first_seen_at=self._dt_months_ago(self.months - 1),
                )
                for outcome_index, outcome in enumerate(pillar_spec.get("outcomes") or []):
                    outcome_spec = outcome if isinstance(outcome, dict) else {"title": outcome}
                    goal = self._goal(
                        title=outcome_spec["title"],
                        goal_text=outcome_spec.get("description") or outcome_spec["title"],
                        why=outcome_spec.get("why"),
                        time_horizon="outcome",
                        parent_goal_id=pillar.id,
                        sort_order=outcome_index,
                        first_seen_at=self._dt_months_ago(max(1, self.months - 2)),
                    )
                    self.outcomes.append(goal)

    def load_roadmap(self) -> None:
        vision_specs = self.persona.get("visions")
        if not vision_specs:
            vision_specs = [{
                "title": next(iter(self.vision_goals.keys()), None),
                "roadmap": self.persona.get("roadmap") or self._default_roadmap(),
            }]

        for vision_spec in vision_specs:
            vision = self.vision_goals.get(vision_spec.get("title"))
            if not vision:
                continue
            waves = vision_spec.get("roadmap") or self._default_roadmap()
            self._load_vision_roadmap(vision, waves)

    def _load_vision_roadmap(self, vision: JourneyGoal, waves: list[dict[str, Any]]) -> None:
        for index, wave_spec in enumerate(waves[:4]):
            start = self.start_date + timedelta(days=index * 90)
            end = start + timedelta(days=89)
            status = wave_spec.get("status") or ("completed" if end < self.today - timedelta(days=30) else "active" if start <= self.today else "not_started")
            wave = VisionRoadmapWave(
                user_number=self.user_number,
                vision_goal_id=vision.id,
                title=wave_spec.get("title") or f"Wave {index + 1}",
                description=wave_spec.get("description") or "Synthetic roadmap wave.",
                sequence_order=index,
                status=status,
                target_start_date=start,
                target_end_date=end,
                created_at=datetime.combine(start, time(hour=9)),
            )
            self.db.add(wave)
            self.db.flush()
            titles = wave_spec.get("goals") or [goal.title for goal in self.outcomes[index::3]][:3]
            for goal_index, title in enumerate(titles):
                goal = self.goals_by_title.get(title)
                if not goal:
                    continue
                self.db.add(WaveGoal(
                    wave_id=wave.id,
                    goal_id=goal.id,
                    sequence_order=goal_index,
                    status="done" if status == "completed" else "ongoing" if goal_index == 0 and status == "active" else "not_started",
                ))

    def load_tasks(self) -> None:
        task_specs = self.persona.get("tasks") or []
        for index, spec in enumerate(task_specs):
            age_days = int(spec.get("created_days_ago", self.rng.randint(2, 45)))
            created_at = datetime.utcnow() - timedelta(days=age_days)
            status = self._task_status(spec)
            if status == "completed":
                completed_days_ago = int(spec.get("completed_days_ago", max(1, min(age_days - 1, self.rng.randint(1, 30)))))
                due_date = datetime.utcnow() - timedelta(days=completed_days_ago)
            else:
                due_date = datetime.utcnow() + timedelta(days=int(spec.get("due_in_days", self.rng.randint(1, 21))))
            if status == "completed":
                due_date = min(due_date, datetime.utcnow() - timedelta(days=1))
            goal = self.goals_by_title.get(spec.get("goal") or "") or self._sample_outcome(index)
            task = Task(
                user_number=self.user_number,
                title=spec["title"],
                notes=spec.get("notes") or self._task_note(spec["title"], status),
                project=spec.get("project"),
                delegated_to=spec.get("delegated_to"),
                due_date=due_date,
                status="completed" if status == "completed" else "open",
                created_at=created_at,
                updated_at=due_date if status == "completed" else datetime.utcnow() - timedelta(days=self.rng.randint(0, 5)),
                goal_id=goal.id if goal else None,
                priority=spec.get("priority") or self.rng.choice(["high", "medium", "medium", "low"]),
                current_bucket=spec.get("bucket") or ("today" if index < 3 and status != "completed" else "this_week"),
                in_top10=bool(spec.get("in_top10", index < 6 and status != "completed")),
                top10_position=index + 1 if index < 6 and status != "completed" else None,
                sort_order=index,
                strategic_intent=spec.get("strategic_intent") or f"Advance {goal.title if goal else 'the current transformation focus'}.",
                move_the_needle_score=float(spec.get("mtn_score", round(self.rng.uniform(0.45, 0.95), 2))),
                estimated_effort=spec.get("estimated_effort") or self.rng.choice(["small", "medium", "large"]),
                ai_enriched=True,
            )
            self.db.add(task)
            self.db.flush()
            if index < 8:
                self._task_priority_telemetry(task, index)

        self.load_task_history()

    def load_task_history(self) -> None:
        history = self.persona.get("task_history") or {}
        if history.get("enabled", True) is False:
            return
        days = int(history.get("days", 90))
        interval = int(history.get("interval_days", 5))
        start_score = float(history.get("start_mtn", 0.32))
        end_score = float(history.get("end_mtn", 0.92))
        tasks_per_day = int(history.get("tasks_per_day", 1))
        titles = history.get("titles") or [
            "Clarify weekly priorities",
            "Finish customer interview notes",
            "Review training block",
            "Update operating dashboard",
            "Complete focused outreach",
        ]
        completed_offsets = list(range(days, -1, -interval))
        for index, days_ago in enumerate(completed_offsets):
            progress = 1 - (days_ago / max(days, 1))
            weekday = (self.today - timedelta(days=days_ago)).weekday()
            weekly_variation = [-0.08, 0.04, -0.03, 0.08, 0.12, -0.12, -0.06][weekday]
            occasional_spike = 0.22 if index % 17 == 0 else 0.0
            occasional_dip = -0.18 if index % 13 == 0 else 0.0
            score = round(
                start_score
                + (end_score - start_score) * progress
                + weekly_variation
                + occasional_spike
                + occasional_dip
                + self.rng.uniform(-0.035, 0.035),
                2,
            )
            score = max(0.15, min(0.99, score))
            for repeat in range(tasks_per_day):
                repeat_variation = 1.0 if repeat == 0 else self.rng.uniform(0.82, 1.08)
                task_score = max(0.15, min(0.99, round(score * repeat_variation, 2)))
                completed_at = datetime.utcnow() - timedelta(days=days_ago, hours=self.rng.randint(1, 8), minutes=repeat * 17)
                created_at = completed_at - timedelta(days=self.rng.randint(2, 8))
                goal = self._sample_outcome(index + repeat)
                task = Task(
                    user_number=self.user_number,
                    title=titles[(index + repeat) % len(titles)],
                    notes="Synthetic completed task used to show MTN momentum improving over time.",
                    due_date=completed_at,
                    status="completed",
                    created_at=created_at,
                    updated_at=completed_at,
                    goal_id=goal.id if goal else None,
                    priority="high" if task_score >= 0.7 else "medium",
                    current_bucket="done",
                    sort_order=100 + (index * tasks_per_day) + repeat,
                    strategic_intent=f"Build visible progress on {goal.title if goal else 'the main goals'}.",
                    move_the_needle_score=task_score,
                    estimated_effort="medium",
                    ai_enriched=True,
                )
                self.db.add(task)
                self.db.flush()
                self._task_priority_telemetry(
                    task,
                    (index * tasks_per_day) + repeat,
                    scored_at=completed_at - timedelta(hours=3),
                    score=task_score,
                )

    def load_habits(self) -> None:
        horizon = (self.persona.get("habits_history_days") or self.months * 30)
        for index, spec in enumerate(self.persona.get("habits") or []):
            goal = self.goals_by_title.get(spec.get("goal") or "") or self._sample_outcome(index)
            habit = Habit(
                user_number=self.user_number,
                title=spec.get("name") or spec.get("title"),
                goal_id=goal.id if goal else None,
                frequency=spec.get("frequency") or "daily",
                is_active=spec.get("is_active", True),
                created_at=datetime.utcnow() - timedelta(days=horizon),
            )
            self.db.add(habit)
            self.db.flush()
            rate = float(spec.get("completion_rate", 0.7))
            for day_offset in range(horizon, -1, -1):
                current = self.today - timedelta(days=day_offset)
                if habit.frequency == "weekdays" and current.weekday() >= 5:
                    continue
                progress = 1 - day_offset / max(horizon, 1)
                if spec.get("trend_start_rate") is not None or spec.get("trend_end_rate") is not None:
                    start_rate = float(spec.get("trend_start_rate", max(0.1, rate - 0.25)))
                    end_rate = float(spec.get("trend_end_rate", rate))
                    target_rate = start_rate + (end_rate - start_rate) * progress
                else:
                    target_rate = rate - 0.06 + progress * 0.12
                done = self.rng.random() <= max(0.05, min(0.98, target_rate))
                self.db.add(HabitCompletion(
                    habit_id=habit.id,
                    date=current,
                    status="done" if done else "not_done",
                    created_at=datetime.combine(current, time(hour=20)),
                ))

    def load_journal(self) -> None:
        entries = self.persona.get("journal") or self._default_journal()
        for index, spec in enumerate(entries):
            age_days = int(spec.get("days_ago", self._spread_days(index, len(entries), min(89, self.months * 30))))
            created_at = datetime.utcnow() - timedelta(days=age_days)
            score = float(spec.get("depth_score", 2 + min(7, index)))
            level = int(spec.get("depth_level") or self._depth_level(score))
            label = spec.get("depth_label") or self._depth_label(level)
            text_body = spec.get("text") or spec.get("body") or "Synthetic reflection entry."
            text_value = f"{spec.get('title', 'Reflection')}\n\n{text_body}"
            depth_explanation = spec.get("depth_explanation") or f"Synthetic {label.lower()} reflection showing realistic growth over time."
            recommendations = spec.get("recommendations") or ["Continue naming the pattern and the next concrete experiment."]
            self.db.add(JournalEntry(
                user_id=self.user.id,
                text=text_value,
                ai_summary=spec.get("summary"),
                reflection_depth_score=score,
                reflection_depth_level=level,
                reflection_depth_label=label,
                reflection_depth_explanation=depth_explanation,
                reflection_depth_recommendations=recommendations,
                reflection_depth_scored_at=created_at + timedelta(minutes=1),
                created_at=created_at,
            ))
            self.db.add(Message(
                sender="user",
                user_number=self.user_number,
                content=text_value,
                message_type="journal",
                conversation_type="journal",
                is_read=True,
                timestamp=created_at.replace(tzinfo=timezone.utc),
                reflection_depth_score=score,
                reflection_depth_level=level,
                reflection_depth_label=label,
                reflection_depth_explanation=depth_explanation,
                reflection_depth_recommendations=recommendations,
                reflection_depth_scored_at=created_at + timedelta(minutes=1),
            ))

    def load_people(self) -> None:
        for index, spec in enumerate(self.persona.get("people") or []):
            first_seen = self._dt_months_ago(max(1, self.months - index))
            health = int(spec.get("relationship_health", self.rng.randint(3, 5)))
            person = JourneyPerson(
                user_number=self.user_number,
                name=spec["name"],
                email=spec.get("email"),
                phone=spec.get("phone"),
                relation=spec.get("relation"),
                context=spec.get("context"),
                strengths=self._lines(spec.get("strengths")),
                growth_areas=self._lines(spec.get("growth_areas")),
                aspirations=self._lines(spec.get("aspirations")),
                first_seen_at=first_seen,
                last_reviewed_at=datetime.utcnow() - timedelta(days=self.rng.randint(5, 45)),
                review_frequency=spec.get("review_frequency") or "monthly",
                relationship_health=health,
                needs_attention=health <= 2,
            )
            self.db.add(person)
            self.db.flush()
            self.db.add(RelationshipReview(
                user_number=self.user_number,
                person_id=person.id,
                review_date=datetime.now(timezone.utc) - timedelta(days=self.rng.randint(7, 75)),
                review_type="synthetic",
                relationship_strength=health,
                communication_frequency=spec.get("communication_frequency") or "weekly",
                last_meaningful_interaction=spec.get("last_meaningful_interaction") or "Recent check-in surfaced priorities and support needed.",
                mutual_value=spec.get("mutual_value") or "Clearer expectations, better feedback, and more intentional follow-through.",
                alignment_level=spec.get("alignment_level") or ("strong" if health >= 4 else "mixed"),
                strategic_importance=spec.get("strategic_importance") or "high",
                recent_interactions=spec.get("recent_interactions"),
                current_dynamics=spec.get("current_dynamics") or "Productive relationship with room for more direct conversations.",
                unresolved_issues=spec.get("unresolved_issues"),
                next_steps=spec.get("next_steps") or "Schedule a focused conversation and clarify the next support action.",
                how_to_strengthen=spec.get("how_to_strengthen") or "Be more explicit about appreciation, context, and expectations.",
                insights=spec.get("insights") or "The relationship improves when conversations move from status updates to intent and growth.",
            ))

    def load_journey(self) -> None:
        spec = self.persona.get("leadership_journey") or {}
        self.load_journey_evidence(spec.get("evidence") or {})
        current_belt = (spec.get("current_belt") or "yellow").lower()
        completed_belts = [belt for belt in BELT_ORDER if BELT_ORDER.index(belt) < BELT_ORDER.index(current_belt)] if current_belt in BELT_ORDER else ["white", "yellow"]
        promotion_targets = [
            belt
            for belt in BELT_ORDER
            if current_belt in BELT_ORDER
            and BELT_ORDER.index(belt) <= BELT_ORDER.index(current_belt)
            and belt != "white"
        ]
        for index, belt in enumerate(promotion_targets):
            accepted = self._dt_months_ago(max(1, self.months - index * 2))
            previous_belt = BELT_ORDER[max(0, BELT_ORDER.index(belt) - 1)] if belt in BELT_ORDER else "white"
            self.db.add(BeltAssessment(
                user_number=self.user_number,
                current_belt=previous_belt,
                target_belt=belt,
                status="accepted",
                readiness_score=82 + index * 4,
                recommendation="promote",
                assessment_summary=f"Completed {belt.title()} Belt synthetic progression with credible evidence and reflection.",
                strengths=["Consistent reflection", "Specific behavioral experiments"],
                growth_edges=["Sustain the practice under pressure"],
                required_next_actions=["Keep applying the current experiment in real situations."],
                accepted_at=accepted,
                created_at=accepted - timedelta(days=2),
                updated_at=accepted,
            ))

        for dim_index, dimension in enumerate(spec.get("dimensions") or JOURNEY_DIMENSIONS):
            for trial_type in ["reflection", "behavioral"]:
                started = datetime.utcnow() - timedelta(days=80 - dim_index * 3)
                self.db.add(JourneyBeltTrial(
                    user_number=self.user_number,
                    dimension_id=dimension,
                    target_belt="white",
                    trial_type=trial_type,
                    prompt=f"Synthetic white {trial_type} trial for {dimension}.",
                    response_text=self._trial_response("white", dimension, trial_type),
                    status="passed",
                    ai_feedback="Passed: the response gives enough specific evidence for White Belt awareness.",
                    score=5,
                    evidence={"synthetic": True, "persona": self.persona_name},
                    started_at=started,
                    submitted_at=started + timedelta(days=1),
                    reviewed_at=started + timedelta(days=2),
                ))

        active_belt = current_belt
        for dim_index, dimension in enumerate(spec.get("dimensions") or JOURNEY_DIMENSIONS):
            for trial_type in ["reflection", "real_world", "behavioral"]:
                status = "passed"
                started = datetime.utcnow() - timedelta(days=45 - dim_index * 4)
                self.db.add(JourneyBeltTrial(
                    user_number=self.user_number,
                    dimension_id=dimension,
                    target_belt=active_belt,
                    trial_type=trial_type,
                    prompt=f"Synthetic {active_belt} {trial_type} trial for {dimension}.",
                    response_text=self._trial_response(active_belt, dimension, trial_type),
                    status=status,
                    ai_feedback="Passed: specific evidence, honest pattern recognition, and a concrete behavior change." if status == "passed" else "Submitted and awaiting a stronger final pass with one more concrete example.",
                    score=5 if status == "passed" else 3,
                    evidence={"synthetic": True, "persona": self.persona_name},
                    started_at=started,
                    submitted_at=started + timedelta(days=2),
                    reviewed_at=started + timedelta(days=3) if status == "passed" else None,
                ))

        if current_belt != "black":
            target_belt = BELT_ORDER[min(BELT_ORDER.index(current_belt) + 1, len(BELT_ORDER) - 1)] if current_belt in BELT_ORDER else "green"
            assessment_at = datetime.utcnow() - timedelta(days=5)
            self.db.add(BeltAssessment(
                user_number=self.user_number,
                current_belt=current_belt,
                target_belt=target_belt,
                status="ready_for_promotion",
                readiness_score=84,
                recommendation="ready_for_promotion",
                assessment_summary=(
                    "Alex's current Journey work shows a clear shift from abstract ambition to visible practice. "
                    "The strongest signal is integration across business building and marathon training: both are now being used as daily evidence of focus, courage, and consistency."
                ),
                dimension_scores={
                    "vision": 86,
                    "people": 82,
                    "execute": 85,
                    "energy": 83,
                    "learning": 84,
                },
                strengths=[
                    "Connects business, training, and identity into one coherent operating system.",
                    "Uses concrete experiments instead of only abstract intentions.",
                    "Shows improving consistency in MTN actions, habits, and reflection depth.",
                ],
                growth_edges=[
                    "Keep making direct market-facing asks before over-polishing the offer.",
                    "Protect recovery as part of the ambition system, not as a reward after work is finished.",
                ],
                required_next_actions=[
                    "Submit the Green Belt assessment when ready.",
                    "Continue one daily market-facing action and one body-facing action for the next two weeks.",
                ],
                leadership_profile={
                    "style": "Practical systems builder",
                    "current_growth_edge": "Turning insight into visible asks and repeatable delivery.",
                    "likely_strengths": ["Clarity", "Operational rhythm", "Pattern recognition"],
                    "likely_risks": ["Over-polishing", "Carrying too much privately", "Recovery leakage"],
                },
                final_coaching_note="Your next level is not more planning. It is more clean contact with reality.",
                alfred_coaching_note="Keep using the business and marathon as paired practice fields for courage and consistency.",
                evidence_snapshot={"synthetic": True, "persona": self.persona_name},
                created_at=assessment_at,
                updated_at=assessment_at,
            ))

        for index, session in enumerate(spec.get("coaching_sessions") or []):
            session_date = datetime.now(timezone.utc) - timedelta(days=self._spread_days(index, len(spec.get("coaching_sessions") or []), 150))
            self.db.add(LeadershipCoachingSession(
                user_number=self.user_number,
                session_date=session_date,
                completed_at=session_date + timedelta(minutes=28),
                quadrant=session.get("quadrant") or "vision_goals",
                situation=session.get("situation"),
                reflection=session.get("reflection"),
                pattern=session.get("pattern"),
                underlying_belief=session.get("underlying_belief"),
                experiment=session.get("experiment"),
                development_level=session.get("development_level", 3),
                insights=session.get("insights"),
                practice=session.get("practice"),
                connected_facets=session.get("connected_facets") or [],
                journey_updates={"synthetic": True},
            ))

    def load_journey_evidence(self, evidence: dict[str, Any]) -> None:
        for item in evidence.get("strengths") or []:
            self.db.add(JourneyStrength(user_number=self.user_number, title=item.get("title"), strength=item["text"], source="synthetic_seed"))
        for item in evidence.get("failures") or []:
            self.db.add(JourneyFailure(user_number=self.user_number, title=item.get("title"), failure_text=item["text"], scar=item.get("scar"), learning=item.get("learning")))
        for item in evidence.get("development_areas") or []:
            self.db.add(JourneyDevelopmentArea(user_number=self.user_number, title=item.get("title"), skill=item["skill"], source="synthetic_seed"))
        for item in evidence.get("journey_opportunities") or []:
            self.db.add(JourneyOpportunity(user_number=self.user_number, opportunity_text=item["text"], category=item.get("category")))
        for item in evidence.get("energy_sources") or []:
            self.db.add(JourneyEnergySource(user_number=self.user_number, title=item.get("title"), source_text=item["text"], category=item.get("category")))
        for item in evidence.get("energy_drains") or []:
            self.db.add(JourneyEnergyDrain(user_number=self.user_number, title=item.get("title"), drain_text=item["text"], category=item.get("category"), mitigation=item.get("mitigation")))
        for item in evidence.get("recovery_methods") or []:
            self.db.add(JourneyRecoveryMethod(user_number=self.user_number, title=item.get("title"), method_text=item["text"], category=item.get("category"), frequency=item.get("frequency")))
        for item in evidence.get("procrastination_patterns") or []:
            self.db.add(JourneyProcrastinationPattern(user_number=self.user_number, title=item.get("title"), pattern_text=item["text"], underlying_reason=item.get("trigger") or item.get("underlying_reason"), strategy=item.get("mitigation") or item.get("strategy")))
        for item in evidence.get("execution_systems") or []:
            self.db.add(JourneyExecutionSystem(user_number=self.user_number, title=item.get("title"), system_text=item["text"], category=item.get("category"), effectiveness=item.get("effectiveness")))
        for item in evidence.get("inspiration") or []:
            self.db.add(JourneyInspiration(user_number=self.user_number, title=item.get("title"), inspiration_text=item["text"], approach=item.get("approach"), effectiveness=item.get("effectiveness")))
        for item in evidence.get("coaching_moments") or []:
            self.db.add(JourneyCoachingMoment(user_number=self.user_number, title=item.get("title"), moment_text=item["text"], person=item.get("person"), outcome=item.get("outcome"), learning=item.get("learning")))
        for item in evidence.get("team_composition") or []:
            self.db.add(JourneyTeamComposition(user_number=self.user_number, title=item.get("title"), composition_text=item["text"], team_type=item.get("team_type"), dynamics=item.get("dynamics")))

    def load_opportunities(self) -> None:
        for index, spec in enumerate(self.persona.get("opportunities") or []):
            goal = self.goals_by_title.get(spec.get("goal") or "") or self._sample_outcome(index)
            self.db.add(OpportunitySuggestion(
                user_id=self.user.id,
                surface=spec.get("surface") or "synthetic_user_seed",
                type=spec.get("type") or "action",
                title=spec["title"],
                description=spec.get("description"),
                rationale=spec.get("rationale") or "Generated to make the demo account feel actively coached.",
                domain=spec.get("domain") or self.rng.choice(["goals", "people", "habits", "tasks"]),
                linked_goal_id=goal.id if goal else None,
                mtn_score=spec.get("mtn_score", round(self.rng.uniform(0.55, 0.9), 2)),
                status=spec.get("status") or "suggested",
                generated_context={"synthetic_persona": self.persona_name},
                scoring_details={"confidence": "medium", "source": "seed_user"},
                created_at=datetime.utcnow() - timedelta(days=self.rng.randint(1, 30)),
            ))

    def load_behavioral_telemetry(self) -> None:
        for day_offset in range(min(120, self.months * 30), -1, -3):
            current = self.today - timedelta(days=day_offset)
            energy = 3 + (1 if day_offset < 45 and self.rng.random() > 0.35 else 0) - (1 if self.rng.random() < 0.12 else 0)
            self.db.add(DailyEnergyCheckin(
                user_number=self.user_number,
                date=current,
                energy_level=max(1, min(5, energy)),
                source="synthetic_seed",
                created_at=datetime.combine(current, time(hour=20)),
            ))

        self.db.add(ConversationState(
            user_number=self.user_number,
            current_state="IDLE",
            active_intents=[],
            state_context={"synthetic_persona": self.persona_name, "last_seeded_at": datetime.utcnow().isoformat()},
        ))
        self.db.add(HabitCoachingReview(
            user_id=self.user.id,
            user_number=self.user_number,
            review_period_start=datetime.utcnow() - timedelta(days=30),
            review_period_end=datetime.utcnow(),
            status="completed",
            executive_summary="Habit consistency is trending upward, with the strongest signal in morning routines and reflection.",
            key_wins=["More consistent weekly rhythm", "Reflection depth increased"],
            watchouts=["Travel and urgent work still disrupt routines"],
            recommended_focus="Protect the smallest viable version of each habit on disrupted days.",
            raw_context={"synthetic": True},
        ))
        vision = next((goal for goal in self.goals_by_title.values() if goal.time_horizon == "vision"), None)
        if vision:
            self.db.add(VisionProgressReview(
                user_id=self.user.id,
                user_number=self.user_number,
                vision_id=vision.id,
                review_period_start=datetime.utcnow() - timedelta(days=90),
                review_period_end=datetime.utcnow(),
                status="completed",
                executive_summary="Clear progress across the main transformation arc, with execution habits becoming more deliberate.",
                key_wins=["Roadmap moved from intent to weekly action", "Better prioritization language"],
                key_risks=["Too many active commitments can dilute momentum"],
                recommended_focus="Use the next wave to simplify commitments and increase deliberate practice.",
                health_scores={"clarity": 4, "momentum": 4, "focus": 3},
                raw_context={"synthetic": True},
            ))
        for index, event_type in enumerate(["login", "page_view", "habit_update", "journal_created", "task_completed"] * 4):
            self.db.add(UsageEvent(
                user_id=self.user.id,
                event_type=event_type,
                page=self.rng.choice(["goals", "tasks", "habits", "journal", "journey"]),
                feature="synthetic_activity",
                metadata_json={"persona": self.persona_name},
                created_at=datetime.utcnow() - timedelta(days=index * 6),
            ))

    def _goal(self, **kwargs) -> JourneyGoal:
        goal = JourneyGoal(user_number=self.user_number, **kwargs)
        self.db.add(goal)
        self.db.flush()
        self.goals_by_title[goal.title] = goal
        return goal

    def _default_roadmap(self) -> list[dict[str, Any]]:
        return [
            {"title": "Wave 1", "description": "Create clarity and early traction."},
            {"title": "Wave 2", "description": "Turn priorities into visible progress."},
            {"title": "Wave 3", "description": "Stabilize habits and leadership systems."},
        ]

    def _default_journal(self) -> list[dict[str, Any]]:
        return [
            {"title": "Overwhelmed", "body": "I have too many open loops and I am mostly reacting.", "depth_score": 2},
            {"title": "Aware", "body": "I can see the pattern: when priorities are vague, everything feels urgent.", "depth_score": 4},
            {"title": "Reflective", "body": "The real issue is not time. It is my discomfort choosing what will not get done.", "depth_score": 6},
            {"title": "Transformational", "body": "I am practicing clearer tradeoffs and noticing that leadership often begins with what I stop carrying.", "depth_score": 8},
        ]

    def _task_priority_telemetry(
            self,
            task: Task,
            index: int,
            scored_at: datetime | None = None,
            score: float | None = None,
    ) -> None:
        snapshot_at = scored_at or datetime.now(timezone.utc) - timedelta(days=index * 7)
        context = TaskPrioritizationContext(
            user_number=self.user_number,
            snapshot_at=snapshot_at,
            active_long_term_goals=[{"id": goal.id, "title": goal.title} for goal in self.goals_by_title.values() if goal.time_horizon == "vision"],
            active_short_term_goals=[],
            active_mid_term_goals=[{"id": goal.id, "title": goal.title} for goal in self.outcomes[:6]],
            total_open_tasks=12,
            tasks_in_top10=[task.id],
            tasks_with_due_dates=10,
            overdue_tasks=1,
            day_of_week=snapshot_at.strftime("%A"),
            week_of_year=int(snapshot_at.strftime("%U")),
            self_reported_energy=self.rng.choice(["high", "medium", "medium", "low"]),
        )
        self.db.add(context)
        self.db.flush()
        score = TaskPriorityScore(
            context_id=context.id,
            task_id=task.id,
            user_number=self.user_number,
            top10_likelihood=round(float(score if score is not None else task.move_the_needle_score or 0.7), 2),
            primary_reason="Synthetic MTN signal based on goal alignment and due-date pressure.",
            risk_if_ignored="Momentum slows and the linked goal becomes less concrete.",
            confidence="medium",
            raw_llm_response={"synthetic": True},
            scored_at=snapshot_at,
            llm_model="synthetic-seeder",
            llm_tokens_used=0,
        )
        self.db.add(score)
        self.db.flush()
        self.db.add(TaskPriorityRecommendation(
            context_id=context.id,
            user_number=self.user_number,
            recommended_top10=[{"task_id": task.id, "score": float(score.top10_likelihood), "position": min(index + 1, 10)}],
            changes_from_current={"add": [task.id], "remove": [], "keep": []},
            generated_at=snapshot_at,
        ))

    def _sample_outcome(self, index: int) -> JourneyGoal | None:
        if not self.outcomes:
            return None
        return self.outcomes[index % len(self.outcomes)]

    def _task_status(self, spec: dict[str, Any]) -> str:
        status = (spec.get("status") or "active").lower()
        return "completed" if status in {"done", "complete", "completed"} else status

    def _task_note(self, title: str, status: str) -> str:
        if status == "completed":
            return f"Completed as part of the synthetic {self.persona_name} history."
        return f"Active synthetic task linked to {self.persona_name}'s current priorities."

    def _spread_days(self, index: int, total: int, max_days: int) -> int:
        if total <= 1:
            return max_days // 2
        return int(max_days - (index / (total - 1)) * max_days)

    def _dt_months_ago(self, months: int) -> datetime:
        return datetime.utcnow() - timedelta(days=max(0, months) * 30)

    def _depth_level(self, score: float) -> int:
        if score >= 8:
            return 5
        if score >= 6:
            return 4
        if score >= 4:
            return 3
        if score >= 2:
            return 2
        return 1

    def _depth_label(self, level: int) -> str:
        return {
            1: "Description",
            2: "Awareness",
            3: "Reflection",
            4: "Pattern Recognition",
            5: "Transformation",
        }.get(level, "Reflection")

    def _trial_response(self, belt: str, dimension: str, trial_type: str) -> str:
        return (
            f"For my {belt} {dimension} {trial_type} trial, I used a real recent situation rather than a generic answer. "
            "I named the pressure I felt, the behavior it produced, and the effect it had on my goals and relationships. "
            "The experiment was to slow down, choose one visible behavior, and review what changed after a week. "
            "The result was not perfect, but it gave me evidence I could act on instead of another abstract intention."
        )

    def _lines(self, value: Any) -> str | None:
        if value is None:
            return None
        if isinstance(value, list):
            return "\n".join(str(item) for item in value)
        return str(value)


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed a fully populated synthetic Alfred user from YAML.")
    parser.add_argument("persona", help="Persona name, for example executive_alex.")
    args = parser.parse_args()

    persona = load_persona(args.persona)
    db = SessionLocal()
    try:
        user = SyntheticUserSeeder(db, persona, args.persona).seed()
        print(f"Seeded {user.name} ({user.email})")
        print(f"Login username: {user.email}")
        print(f"Login password: {persona.get('user', {}).get('password') or DEFAULT_PASSWORD}")
        print(f"User number: {user.phone_number}")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
