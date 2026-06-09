from __future__ import annotations

import argparse
import sys
from pathlib import Path

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
    JourneyGoalValue,
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
    MessageFeedback,
    MessageSignalFlag,
    OpportunitySuggestion,
    RelationshipReview,
    Task,
    TaskPriorityDecision,
    TaskPriorityRecommendation,
    TaskPriorityScore,
    TaskPrioritizationContext,
    UsageEvent,
    User,
    VisionProgressReview,
    VisionRoadmapWave,
    WaveGoal,
)


def _delete(query) -> int:
    return query.delete(synchronize_session=False)


def reset_synthetic_user(db, email: str, delete_user: bool = True) -> int:
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise ValueError(f"No user found for {email}.")
    if not user.is_synthetic_user:
        raise ValueError(f"Refusing to reset {email}: user is not marked as synthetic.")

    user_number = user.phone_number
    identifiers = [value for value in {user_number, email, str(user.id)} if value]

    deleted = 0

    messages = db.query(Message).filter(Message.user_number.in_(identifiers)).all()
    message_ids = [item.id for item in messages]
    if message_ids:
        deleted += _delete(db.query(MessageSignalFlag).filter(MessageSignalFlag.message_id.in_(message_ids)))
        deleted += _delete(db.query(MessageFeedback).filter(MessageFeedback.message_id.in_(message_ids)))

    tasks = db.query(Task).filter(Task.user_number.in_(identifiers)).all()
    task_ids = [item.id for item in tasks]
    if task_ids:
        context_ids = [
            row[0]
            for row in db.query(TaskPriorityScore.context_id)
            .filter(TaskPriorityScore.task_id.in_(task_ids))
            .distinct()
            .all()
        ]
        recommendation_ids = [
            row[0]
            for row in db.query(TaskPriorityRecommendation.id)
            .filter(TaskPriorityRecommendation.context_id.in_(context_ids or [-1]))
            .all()
        ]
        deleted += _delete(db.query(TaskPriorityDecision).filter(TaskPriorityDecision.task_id.in_(task_ids)))
        deleted += _delete(db.query(TaskPriorityScore).filter(TaskPriorityScore.task_id.in_(task_ids)))
        if recommendation_ids:
            deleted += _delete(db.query(TaskPriorityDecision).filter(TaskPriorityDecision.recommendation_id.in_(recommendation_ids)))
        if context_ids:
            deleted += _delete(db.query(TaskPriorityRecommendation).filter(TaskPriorityRecommendation.context_id.in_(context_ids)))
            deleted += _delete(db.query(TaskPrioritizationContext).filter(TaskPrioritizationContext.id.in_(context_ids)))

    habits = db.query(Habit).filter(Habit.user_number.in_(identifiers)).all()
    habit_ids = [item.id for item in habits]
    if habit_ids:
        deleted += _delete(db.query(HabitCompletion).filter(HabitCompletion.habit_id.in_(habit_ids)))

    people = db.query(JourneyPerson).filter(JourneyPerson.user_number.in_(identifiers)).all()
    person_ids = [item.id for item in people]
    if person_ids:
        deleted += _delete(db.query(RelationshipReview).filter(RelationshipReview.person_id.in_(person_ids)))

    goals = db.query(JourneyGoal).filter(JourneyGoal.user_number.in_(identifiers)).all()
    goal_ids = [item.id for item in goals]
    if goal_ids:
        wave_ids = [
            row[0]
            for row in db.query(VisionRoadmapWave.id)
            .filter(VisionRoadmapWave.vision_goal_id.in_(goal_ids))
            .all()
        ]
        deleted += _delete(db.query(WaveGoal).filter(WaveGoal.goal_id.in_(goal_ids)))
        if wave_ids:
            deleted += _delete(db.query(WaveGoal).filter(WaveGoal.wave_id.in_(wave_ids)))
        deleted += _delete(db.query(VisionRoadmapWave).filter(VisionRoadmapWave.vision_goal_id.in_(goal_ids)))
        deleted += _delete(db.query(JourneyGoalValue).filter(JourneyGoalValue.goal_id.in_(goal_ids)))
        deleted += _delete(db.query(VisionProgressReview).filter(VisionProgressReview.vision_id.in_(goal_ids)))
        deleted += _delete(db.query(GoalReviewSession).filter(GoalReviewSession.goal_id.in_(goal_ids)))
        deleted += _delete(db.query(OpportunitySuggestion).filter(OpportunitySuggestion.linked_goal_id.in_(goal_ids)))
        for goal in sorted(goals, key=lambda item: item.id or 0, reverse=True):
            db.delete(goal)
            deleted += 1

    deleted += _delete(db.query(OpportunitySuggestion).filter(OpportunitySuggestion.user_id == user.id))
    deleted += _delete(db.query(HabitCoachingReview).filter(HabitCoachingReview.user_id == user.id))
    deleted += _delete(db.query(VisionProgressReview).filter(VisionProgressReview.user_id == user.id))
    deleted += _delete(db.query(UsageEvent).filter(UsageEvent.user_id == user.id))
    deleted += _delete(db.query(JournalEntry).filter(JournalEntry.user_id == user.id))

    deleted += _delete(db.query(Task).filter(Task.user_number.in_(identifiers)))
    deleted += _delete(db.query(Habit).filter(Habit.user_number.in_(identifiers)))
    deleted += _delete(db.query(DailyEnergyCheckin).filter(DailyEnergyCheckin.user_number.in_(identifiers)))
    deleted += _delete(db.query(Message).filter(Message.user_number.in_(identifiers)))
    deleted += _delete(db.query(JourneyPerson).filter(JourneyPerson.user_number.in_(identifiers)))
    deleted += _delete(db.query(JourneyValue).filter(JourneyValue.user_number.in_(identifiers)))
    deleted += _delete(db.query(JourneyStrength).filter(JourneyStrength.user_number.in_(identifiers)))
    deleted += _delete(db.query(JourneyFailure).filter(JourneyFailure.user_number.in_(identifiers)))
    deleted += _delete(db.query(JourneyDevelopmentArea).filter(JourneyDevelopmentArea.user_number.in_(identifiers)))
    deleted += _delete(db.query(JourneyOpportunity).filter(JourneyOpportunity.user_number.in_(identifiers)))
    deleted += _delete(db.query(JourneyEnergySource).filter(JourneyEnergySource.user_number.in_(identifiers)))
    deleted += _delete(db.query(JourneyEnergyDrain).filter(JourneyEnergyDrain.user_number.in_(identifiers)))
    deleted += _delete(db.query(JourneyRecoveryMethod).filter(JourneyRecoveryMethod.user_number.in_(identifiers)))
    deleted += _delete(db.query(JourneyProcrastinationPattern).filter(JourneyProcrastinationPattern.user_number.in_(identifiers)))
    deleted += _delete(db.query(JourneyExecutionSystem).filter(JourneyExecutionSystem.user_number.in_(identifiers)))
    deleted += _delete(db.query(JourneyInspiration).filter(JourneyInspiration.user_number.in_(identifiers)))
    deleted += _delete(db.query(JourneyCoachingMoment).filter(JourneyCoachingMoment.user_number.in_(identifiers)))
    deleted += _delete(db.query(JourneyTeamComposition).filter(JourneyTeamComposition.user_number.in_(identifiers)))
    deleted += _delete(db.query(JourneyBeltTrial).filter(JourneyBeltTrial.user_number.in_(identifiers)))
    deleted += _delete(db.query(BeltAssessment).filter(BeltAssessment.user_number.in_(identifiers)))
    deleted += _delete(db.query(ConversationState).filter(ConversationState.user_number.in_(identifiers)))
    deleted += _delete(db.query(LeadershipCoachingSession).filter(LeadershipCoachingSession.user_number.in_(identifiers)))

    if delete_user:
        db.delete(user)
        deleted += 1
    else:
        user.onboarding_data = {}
        user.tour_completed_steps = []

    db.commit()
    return deleted


def main() -> None:
    parser = argparse.ArgumentParser(description="Safely reset a synthetic Alfred user.")
    parser.add_argument("email")
    parser.add_argument("--keep-user", action="store_true", help="Delete synthetic records but keep the user row.")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        count = reset_synthetic_user(db, args.email, delete_user=not args.keep_user)
        print(f"Deleted {count} synthetic records for {args.email}.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
