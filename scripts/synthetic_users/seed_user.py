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
    MessageSignalFlag,
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
        self.load_nudges()
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
                due_in_days = int(spec.get("due_in_days", self.rng.randint(1, 21)))
                if due_in_days == 0:
                    due_date = datetime.combine(self.today, time(hour=23, minute=59))
                else:
                    due_date = datetime.utcnow() + timedelta(days=due_in_days)
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
            message = Message(
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
            )
            self.db.add(message)
            self.db.flush()
            for signal_index, signal in enumerate(spec.get("signals") or []):
                self.db.add(MessageSignalFlag(
                    user_id=self.user.id,
                    message_id=message.id,
                    source_type="journal",
                    signal_type=signal.get("type") or "goal_reflection",
                    is_met=bool(signal.get("is_met", True)),
                    confidence_score=float(signal.get("confidence", 0.86)),
                    evidence_excerpt=signal.get("excerpt") or text_body[:240],
                    reasoning_summary=signal.get("reason") or "This journal entry contains goal-relevant evidence for the progress review.",
                    prompt_version="synthetic_seed_v1",
                    model_version="synthetic_seed",
                    created_at=created_at + timedelta(minutes=2, seconds=signal_index),
                    updated_at=created_at + timedelta(minutes=2, seconds=signal_index),
                ))

    def load_nudges(self) -> None:
        nudges = self.persona.get("nudges") or self._default_nudges()
        for index, spec in enumerate(nudges):
            days_ago = int(spec.get("days_ago", len(nudges) - index - 1))
            nudge_type = spec.get("type") or ("morning" if index % 2 == 0 else "evening")
            hour = int(spec.get("hour", 8 if nudge_type == "morning" else 18))
            timestamp = datetime.combine(
                self.today - timedelta(days=days_ago),
                time(hour=hour, minute=int(spec.get("minute", 15))),
                tzinfo=timezone.utc,
            )
            self.db.add(Message(
                sender="assistant",
                user_number=self.user_number,
                content=spec.get("content") or spec.get("text") or self._default_nudge_text(nudge_type),
                message_type="nudge",
                conversation_type="messages",
                is_read=bool(spec.get("is_read", days_ago > 1)),
                timestamp=timestamp,
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
                    "headline": "A systems builder learning to lead through visible practice",
                    "description": (
                        "Alex's leadership style is no longer merely emerging. It is becoming a practical operating system: "
                        "he turns ambiguity into cadence, uses business building and marathon training as real-world practice fields, "
                        "and is learning to lead through clearer asks, better recovery, and repeatable execution rather than private over-preparation."
                    ),
                    "style": "Practical systems builder",
                    "current_growth_edge": "Turning insight into visible asks, cleaner delegation, and repeatable delivery.",
                    "likely_strengths": ["Operational clarity", "Pattern recognition", "Consistent practice under pressure"],
                    "likely_risks": ["Over-polishing before asking", "Carrying too much privately", "Letting recovery become negotiable"],
                },
                wheel_scores=self._assessment_wheel_scores(),
                wheel_feedback=self._assessment_wheel_scores(),
                promotion_limiters=[
                    {
                        "domain": "People",
                        "subdomain": "Coach & Delegate",
                        "score": 4,
                        "why_it_limits_promotion": "Alex is practicing clearer delegation, but still sometimes protects quality by staying too close to the work.",
                        "what_to_do_next": "Delegate one meaningful business-development asset with success criteria, not step-by-step instructions.",
                    },
                    {
                        "domain": "Time & Energy",
                        "subdomain": "Recovery",
                        "score": 4,
                        "why_it_limits_promotion": "Recovery is improving, but late reactive work still competes with sleep and training consistency.",
                        "what_to_do_next": "Protect the shutdown ritual for two weeks and review the impact on training quality.",
                    },
                ],
                strongest_areas=[
                    {
                        "domain": "Prioritize & Execute",
                        "subdomain": "Prioritization",
                        "score": 5,
                        "why_it_is_strong": "Alex is consistently translating goals into daily MTN actions and reviewing whether they moved reality.",
                    },
                    {
                        "domain": "Vision",
                        "subdomain": "Vision",
                        "score": 5,
                        "why_it_is_strong": "The business and marathon visions now reinforce a coherent identity around courage, consistency, and ownership.",
                    },
                ],
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
        self.db.flush()

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
        for vision in self.vision_goals.values():
            self._seed_vision_progress_review(vision)
        for index, event_type in enumerate(["login", "page_view", "habit_update", "journal_created", "task_completed"] * 4):
            self.db.add(UsageEvent(
                user_id=self.user.id,
                event_type=event_type,
                page=self.rng.choice(["goals", "tasks", "habits", "journal", "journey"]),
                feature="synthetic_activity",
                metadata_json={"persona": self.persona_name},
                created_at=datetime.utcnow() - timedelta(days=index * 6),
            ))

    def _seed_vision_progress_review(self, vision: JourneyGoal) -> None:
        scoped_goal_ids = self._vision_scoped_goal_ids(vision)
        opportunities = [
            item
            for item in self.db.query(OpportunitySuggestion).filter(
                OpportunitySuggestion.user_id == self.user.id,
                OpportunitySuggestion.status == "suggested",
                OpportunitySuggestion.linked_goal_id.in_(scoped_goal_ids),
            ).all()
        ]
        opportunities.sort(key=lambda item: (float(item.mtn_score or 0), item.created_at or datetime.min), reverse=True)
        mtn_actions = [
            {
                "id": item.id,
                "title": item.title,
                "why_it_matters": item.rationale,
                "suggested_next_step": item.description,
                "linked_goal_id": item.linked_goal_id,
                "status": item.status,
            }
            for item in opportunities[:3]
        ]

        if "business" in (vision.title or "").lower():
            status = "on_track"
            summary = (
                "Alex's business vision is active and gaining sharper market contact. The strongest progress is not that the company is already built; "
                "it is that Alex is moving from private refinement into visible founder conversations, a clearer flagship offer, and reusable proof from past COO wins. "
                "The current constraint is commercial exposure: the offer is becoming concrete enough to sell, but it still needs more direct asks and faster conversion of call notes into a paid sprint."
            )
            wins = [
                "Founder discovery is producing sharper language around the Operating System Sprint.",
                "The flagship offer has moved from broad expertise to a more specific transformation promise.",
                "Alex is using his journal reflections to catch the polishing-before-asking pattern earlier.",
            ]
            risks = [
                "The main risk is over-polishing the offer instead of testing it with buyers.",
                "Several high-MTN follow-up tasks remain open or overdue, which can slow commercial momentum.",
                "If Alex keeps too many business ideas alive, the founder wedge may lose force.",
            ]
            focus = (
                "This week, prioritize market evidence over internal refinement: close the overdue founder follow-ups, convert discovery notes into the paid sprint offer, "
                "and ask Evelyn for one specific intro or objection to test."
            )
            health = {
                "momentum": "green",
                "execution": "yellow",
                "commercial_progress": "yellow",
                "outcome_achievement": "yellow",
                "overall_goal_health": "yellow",
            }
            journal_theme = "Journal signals show Alex is naming the founder avoidance pattern more clearly and turning it into visible asks."
        else:
            status = "on_track"
            summary = (
                "Alex's marathon vision is active and increasingly integrated with the business goal. The progress signal is consistency under real-life pressure: "
                "missed runs are no longer becoming identity verdicts, and recovery is starting to be treated as part of performance. The next edge is making fueling, mobility, and sleep as concrete as the long-run plan."
            )
            wins = [
                "The 12-mile long run created confidence without needing drama or intensity.",
                "Alex has a clearer missed-run recovery rule and is using minimum viable workouts.",
                "Training and business execution are now reinforcing the same identity: return to the next rep.",
            ]
            risks = [
                "Late reactive work can still weaken sleep and morning training quality.",
                "Mobility and fueling are easy to delay because they feel less urgent than the run itself.",
            ]
            focus = (
                "Protect the next long-run system: schedule the route, test fueling deliberately, and treat sleep prep as part of the training block rather than optional cleanup."
            )
            health = {
                "momentum": "green",
                "execution": "green",
                "commercial_progress": "green",
                "outcome_achievement": "yellow",
                "overall_goal_health": "green",
            }
            journal_theme = "Journal signals show Alex connecting marathon consistency to leadership identity and calmer recovery after disruption."

        self.db.add(VisionProgressReview(
            user_id=self.user.id,
            user_number=self.user_number,
            vision_id=vision.id,
            review_period_start=datetime.utcnow() - timedelta(days=7),
            review_period_end=datetime.utcnow(),
            status=status,
            executive_summary=summary,
            key_wins=wins,
            key_risks=risks,
            recommended_focus=focus,
            mtn_actions=mtn_actions,
            health_scores=health,
            raw_context={
                "synthetic": True,
                "persona": self.persona_name,
                "journal_theme": journal_theme,
                "scoped_goal_ids": scoped_goal_ids,
            },
            raw_llm_response={"source": "synthetic_seed", "journal_theme": journal_theme},
            created_at=datetime.utcnow(),
        ))

    def _vision_scoped_goal_ids(self, vision: JourneyGoal) -> list[int]:
        ids = [vision.id]
        changed = True
        while changed:
            changed = False
            for goal in self.goals_by_title.values():
                if goal.id in ids:
                    continue
                if goal.parent_goal_id in ids:
                    ids.append(goal.id)
                    changed = True
        return ids

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

    def _default_nudges(self) -> list[dict[str, Any]]:
        return [
            {
                "days_ago": offset,
                "type": "morning" if offset % 2 == 0 else "evening",
                "content": self._default_nudge_text("morning" if offset % 2 == 0 else "evening"),
            }
            for offset in range(9, -1, -1)
        ]

    def _default_nudge_text(self, nudge_type: str) -> str:
        if nudge_type == "morning":
            return "Today, choose one action that creates real evidence instead of private certainty. What is the smallest visible ask you can make before noon?"
        return "Evening check: where did you move reality today, and where did you only think about moving it? Name one adjustment for tomorrow."

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
        key = (belt, dimension, trial_type)
        responses = {
            ("green", "vision", "reflection"): (
                "The biggest integration lesson for me is that my business vision and marathon goal are not competing priorities; they are training the same operating system. "
                "The business asks me to tolerate public imperfection: making a clear offer, asking founders for feedback, and letting the market answer. "
                "The marathon asks me to tolerate slow accumulation: easy miles, sleep, fuel, and recovery when nothing dramatic is happening. "
                "In both cases my old pattern was to wait for a cleaner identity before acting. Green Belt practice has been the opposite: act in small visible reps until the identity becomes believable. "
                "My vision now feels less like a heroic future and more like a weekly cadence I can inspect."
            ),
            ("green", "vision", "real_world"): (
                "I audited my calendar against the two visions: build my own business and complete a marathon. The mismatch was obvious. "
                "I said both mattered, but my week still overprotected reactive work and underprotected market-facing asks and training recovery. "
                "I made three structural changes: founder calls before inbox work on Tuesdays and Thursdays, long-run prep on Friday afternoon, and a Sunday review that names one business outcome and one training outcome. "
                "The first week felt uncomfortable because it exposed the tradeoffs I had been avoiding. The second week produced two founder conversations, a clearer offer paragraph, and a better long run. "
                "The audit changed my environment, not just my intention."
            ),
            ("green", "vision", "behavioral"): (
                "I explicitly connected my visions to values and strengths in Alfred. Ownership now links to the business because I want direct responsibility for the value I create. "
                "Health links to the marathon because ambition without capacity has already cost me consistency. Courage links to both: asking for the sale and showing up for imperfect training are the same muscle. "
                "My strongest leadership strength is operating clarity, so I am using it on myself: one cadence, one dashboard, one weekly review, and one visible ask each day. "
                "That connection keeps the vision from becoming motivational wallpaper."
            ),
            ("green", "people", "reflection"): (
                "The leader I admire most right now is Evelyn, my mentor, because she creates clarity without taking ownership away. "
                "When I bring her a vague business idea, she does not solve it for me; she asks which buyer, which pain, which evidence, and which ask. "
                "That exposes my avoidance but also gives me dignity because the next move is still mine. Comparing that to my own style, I see that I often over-help. "
                "With Priya, I can turn collaboration into hidden control by giving too much context and too many steps. My Green Belt edge is to delegate through criteria and decision rights, not through constant proximity."
            ),
            ("green", "people", "real_world"): (
                "I delegated the first draft of the sprint delivery checklist to Priya. My old move would have been to write the structure myself and ask her to polish it. "
                "This time I gave her the outcome, the buyer context, and three quality criteria, then asked her to decide the format. "
                "I felt the urge to jump in when her first outline looked different from mine, but I waited and asked what tradeoffs she was making. "
                "The final version had two sections I would not have thought of, especially around founder onboarding. In the debrief she said the freedom made the work feel more owned. "
                "That is the evidence I needed: delegation was slower for a day but created more capacity and better thinking."
            ),
            ("green", "people", "behavioral"): (
                "I completed relationship reviews for Priya, Marcus, Dana, Evelyn, and Coach Daniel, and I used them to change behavior. "
                "Priya needs decision rights, not more explanation. Marcus needs a crisp diagnostic conversation, not a broad pitch. Dana gives me founder-speed feedback, but I need to convert it into commitments. "
                "Evelyn is most useful when I bring a specific ask. Daniel helps me protect the training plan when work stress rises. "
                "The pattern is that my support system works when I stop being vague about what I need and what I am asking them to own."
            ),
            ("green", "execute", "reflection"): (
                "I have learned that discipline, emotion, focus, and performance are one system. When I avoid a founder ask, it rarely feels like fear at first; it feels like useful preparation. "
                "When I avoid a run, it rarely feels like avoidance; it feels like needing a better day. In both cases the emotional move is the same: protect the imagined version of myself from evidence. "
                "My execution improved when I stopped asking whether I felt ready and started asking what reality-facing action would teach me something. "
                "The MTN review helps because it does not reward busyness. It asks whether I moved the business, the body, or the relationship with reality."
            ),
            ("green", "execute", "real_world"): (
                "The recurring distraction I redesigned was morning inbox drift. It looked harmless, but it moved my highest-courage work into the part of the day when I was already depleted. "
                "I changed the environment: phone outside the office, inbox blocked until 10:30, and a written first task on the desk before shutdown. "
                "For two weeks the first task had to be either a founder-facing action or an offer asset. The result was not perfect, but the difference was measurable: more completed MTN tasks, fewer stale follow-ups, and less end-of-day guilt. "
                "The lesson is that focus is easier when the environment has already made the first good action obvious."
            ),
            ("green", "execute", "behavioral"): (
                "I reviewed MTN classifications daily and used the trend to recalibrate my priorities. Early in the 90-day window I was completing tasks, but many were low-consequence cleanup. "
                "Over time the score improved because I started asking a harder question: does this action create market evidence, training capacity, or a clearer operating system? "
                "The best signal is that I now have high-MTN days that include uncomfortable asks, not just productive effort. "
                "That tells me the execution system is changing from task completion to priority truth."
            ),
            ("green", "energy", "reflection"): (
                "Ambition and recovery used to feel like rivals. I treated sleep, food, and mobility as things I could clean up after the important work was done. "
                "The marathon made that belief impossible to hide. If I ignore recovery, the long run tells the truth. The business does too, just more quietly: poor sleep makes me vague, reactive, and more likely to polish instead of ask. "
                "I now see recovery as part of leadership integrity. If I want to build something durable, I cannot run the system on adrenaline and call it commitment."
            ),
            ("green", "energy", "real_world"): (
                "I changed one recurring source of exhaustion: late reactive work. I added a 20-minute shutdown ritual that captures open loops, names tomorrow's first task, and closes screens before sleep prep. "
                "The first few nights felt almost irresponsible because there was always more I could do. But the next mornings were different. I ran more consistently, started deeper work faster, and had less emotional residue from unfinished email. "
                "The structural change was not dramatic; it was a boundary that protected the next day's ambition."
            ),
            ("green", "energy", "behavioral"): (
                "I maintained a seven-day streak across the habits that matter most for energy: morning run or strength, founder deep work, journaling with a pattern and experiment, and evening shutdown. "
                "The important part was not perfection. One day the run became mobility, and one day the deep work block was only 35 minutes. "
                "But I kept the direction intact. That is the Green Belt lesson for me: consistency is not the absence of disruption; it is having a designed response when disruption arrives."
            ),
            ("green", "learning", "reflection"): (
                "My relationship with failure is changing. The delayed business launch used to feel like evidence that I was not really a founder. "
                "Now I can see it as a precise learning signal: I was using optionality and preparation to avoid rejection. The training restart cycle taught the same lesson physically. "
                "When I missed runs, I converted a data point into an identity verdict. The wisdom I am taking forward is that failure becomes useful only when I make it specific enough to change the next rep. "
                "Vague shame creates loops. Specific learning creates systems."
            ),
            ("green", "learning", "real_world"): (
                "I ran a retrospective on the first month of founder discovery and marathon training. I separated facts from stories. "
                "Facts: founder calls created sharper language, direct asks created more momentum than deck edits, long runs improved when sleep was protected, and missed workouts were recoverable when I had a minimum version. "
                "Stories: I need the offer to be perfect, I am behind, one lapse means the plan is failing. "
                "The practical change was a weekly review with three columns: evidence, story, next experiment. That has made learning less emotional and more operational."
            ),
            ("green", "learning", "behavioral"): (
                "I updated my development plan around two edges: direct selling and recovery discipline. For direct selling, the practice is three visible asks per week and a follow-up review of what I learned. "
                "For recovery, the practice is protecting shutdown and treating mobility as part of the training block. I also identified the scar underneath both: I tend to believe I earn safety by doing more privately before being seen. "
                "The new plan is to earn trust through honest repetition instead."
            ),
        }
        if key in responses:
            return responses[key]
        return (
            f"For my {belt} {dimension} {trial_type} trial, I used a real recent situation from building the business or training for the marathon. "
            "I named the pressure, the behavior it created, the cost, and the next experiment. "
            "The work is becoming more specific: less abstract insight, more visible practice and review."
        )

    def _assessment_wheel_scores(self) -> dict[str, Any]:
        def feedback(score: int, readiness: str, why: str, improve: list[str]) -> dict[str, Any]:
            return {
                "score": score,
                "status": "strong" if score >= 5 else "solid",
                "current_readiness": readiness,
                "why": why,
                "improve": improve,
                "next_actions_in_alfred": improve,
            }

        return {
            "Vision": {
                "domain_score": 5,
                "summary": "Alex has connected business ownership, marathon training, values, strengths, and weekly execution into a coherent direction.",
                "subdomains": {
                    "Values": feedback(5, "Values are specific and actively used to make tradeoffs.", "Ownership, health, and courage now shape calendar decisions and market-facing action.", ["Keep linking weekly commitments to one explicit value."]),
                    "Strengths": feedback(5, "Strengths are named and applied deliberately.", "Alex uses operating clarity and pattern recognition on both the business and training system.", ["Use strengths through delegation, not only personal execution."]),
                    "Vision": feedback(5, "Vision is concrete, multi-domain, and supported by roadmap evidence.", "The two visions reinforce each other through courage, consistency, and ownership.", ["Review whether each roadmap wave still creates real-world evidence."]),
                },
            },
            "People": {
                "domain_score": 4,
                "summary": "Alex has mapped key relationships and is practicing more explicit asks and cleaner delegation.",
                "subdomains": {
                    "Team Composition": feedback(4, "The support system is clear and role-specific.", "Alex knows what each person contributes and what each relationship needs.", ["Clarify ownership expectations with Priya and Marcus."]),
                    "Inspire": feedback(4, "Alex inspires through practical clarity more than motivational language.", "The strongest examples come from making systems visible and useful.", ["Tell the story behind the system more often."]),
                    "Coach & Delegate": feedback(4, "Delegation is improving, but Alex still feels the pull to stay close.", "The Priya playbook experiment shows real progress and a remaining control edge.", ["Delegate outcomes with criteria, then hold the debrief."]),
                },
            },
            "Prioritize & Execute": {
                "domain_score": 5,
                "summary": "Alex has a strong execution cadence with daily MTN evidence and a clearer relationship to focus.",
                "subdomains": {
                    "Prioritization": feedback(5, "Prioritization is now tied to market evidence and training capacity.", "The MTN history shows more high-value action and fewer avoidance tasks over time.", ["Keep pruning tasks that only create the feeling of progress."]),
                    "Execution System": feedback(5, "The weekly operating rhythm is concrete and repeatable.", "Two-track weekly planning connects business and marathon actions to reviewable outcomes.", ["Document the system so it can be reused with clients."]),
                    "Procrastination": feedback(4, "Alex can name avoidance patterns and has practical mitigations.", "Polishing instead of asking is visible now, though still tempting under pressure.", ["Make visible asks before artifact edits on high-stakes days."]),
                },
            },
            "Time & Energy": {
                "domain_score": 4,
                "summary": "Energy management is becoming a real operating constraint rather than an afterthought.",
                "subdomains": {
                    "Energy Sources": feedback(5, "Alex knows which activities create energy and confidence.", "Founder conversations, morning training, and deep work are clearly identified and scheduled.", ["Protect at least one energy source before reactive work."]),
                    "Energy Drains": feedback(4, "Energy drains are specific and paired with mitigations.", "Late reactive work and vague optionality are named with practical boundaries.", ["Review evening shutdown compliance weekly."]),
                    "Recovery": feedback(4, "Recovery routines are improving and connected to performance.", "The shutdown ritual and easy runs are helping, but consistency still needs protection.", ["Treat recovery as a leading indicator, not a cleanup task."]),
                },
            },
            "Learning & Development": {
                "domain_score": 5,
                "summary": "Alex is converting failure patterns into specific systems and development practices.",
                "subdomains": {
                    "Failures & Scars": feedback(5, "Failure reflections are honest, specific, and actionable.", "The delayed launch and restart cycle are connected to concrete behavior change.", ["Keep separating facts from identity stories."]),
                    "Development Opportunities": feedback(4, "Development edges are clear and practice-based.", "Direct selling and recovery discipline have explicit reps.", ["Track visible asks and recovery discipline together."]),
                    "Development Plan": feedback(5, "The development plan is integrated into weekly practice.", "The plan connects market action, training, reflection, and relationship support.", ["Review the plan every two weeks against real evidence."]),
                },
            },
        }

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
