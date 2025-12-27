"""
Onboarding Service - Executive Onboarding Flow
Handles the complete onboarding journey from "Hey Alfred" to tour completion
"""

from sqlalchemy.orm import Session
from app.models import User, OnboardingStep, EmailVerification
from datetime import datetime, timedelta
from typing import Dict, Optional, Tuple
import re


class OnboardingConversation:
    """
    Handles the conversational onboarding flow for Leadership OS.
    Professional tone for senior executives - no gamification, just clarity.
    """

    TRIGGER_PHRASES = ["hey alfred", "hi alfred", "hello alfred", "start"]

    @staticmethod
    def is_onboarding_trigger(message: str) -> bool:
        """Check if message is an onboarding trigger"""
        msg_lower = message.lower().strip()
        return any(trigger in msg_lower for trigger in OnboardingConversation.TRIGGER_PHRASES)

    @staticmethod
    def get_user_or_create(db: Session, phone_number: str) -> Tuple[User, bool]:
        """
        Get existing user or create new one.
        Returns: (user, is_new)
        """
        user = db.query(User).filter(User.phone_number == phone_number).first()
        is_new = False

        if not user:
            user = User(
                phone_number=phone_number,
                onboarding_step=OnboardingStep.INITIAL,
                onboarding_data={},
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            is_new = True

        return user, is_new

    @staticmethod
    def process_onboarding_message(db: Session, user: User, message: str) -> str:
        """
        Process a message during onboarding and return Alfred's response.
        Handles the complete onboarding state machine.
        """
        step = user.onboarding_step

        # INITIAL: User just said "Hey Alfred"
        if step == OnboardingStep.INITIAL:
            user.onboarding_step = OnboardingStep.NAME
            user.start_trial()
            db.commit()
            return OnboardingConversation._greeting()

        # NAME: Collecting name
        elif step == OnboardingStep.NAME:
            name = OnboardingConversation._extract_name(message)
            if name:
                user.name = name
                user.onboarding_step = OnboardingStep.PROFESSION
                user.onboarding_data = user.onboarding_data or {}
                user.onboarding_data['name'] = name
                db.commit()
                return OnboardingConversation._ask_profession(name)
            else:
                return "I didn't catch that. What's your name?"

        # PROFESSION: Collecting profession/role
        elif step == OnboardingStep.PROFESSION:
            profession = message.strip()
            user.profession = profession
            user.onboarding_step = OnboardingStep.GOAL
            user.onboarding_data['profession'] = profession
            db.commit()
            return OnboardingConversation._ask_goal(user.name, profession)

        # GOAL: Collecting first goal
        elif step == OnboardingStep.GOAL:
            goal = message.strip()
            user.onboarding_step = OnboardingStep.GOAL_WHY
            user.onboarding_data['first_goal'] = goal
            db.commit()

            # Store goal in journey (will be done via journey_service)
            return OnboardingConversation._ask_goal_why(goal)

        # GOAL_WHY: Collecting goal motivation (optional, can skip)
        elif step == OnboardingStep.GOAL_WHY:
            if message.lower().strip() in ['skip', 'no', 'later', 'pass']:
                user.onboarding_step = OnboardingStep.TASKS
                db.commit()
                return OnboardingConversation._ask_tasks(user.name)
            else:
                why = message.strip()
                user.onboarding_data['goal_why'] = why
                user.onboarding_step = OnboardingStep.TASKS
                db.commit()
                return OnboardingConversation._ask_tasks(user.name)

        # TASKS: Collecting initial tasks
        elif step == OnboardingStep.TASKS:
            tasks_text = message.strip()
            user.onboarding_data['tasks_raw'] = tasks_text
            user.onboarding_step = OnboardingStep.QUICK_WIN
            db.commit()

            # Parse tasks (will be extracted via NLP or simple split)
            return OnboardingConversation._ask_quick_win()

        # QUICK_WIN: Identifying first task to tackle
        elif step == OnboardingStep.QUICK_WIN:
            quick_win = message.strip()
            user.onboarding_data['quick_win'] = quick_win
            user.onboarding_step = OnboardingStep.APP_LINK_SENT
            db.commit()

            # Generate temp password and send link
            temp_password = user.generate_temp_password()
            db.commit()

            return OnboardingConversation._send_app_link(user.name, user.id, temp_password)

        # APP_LINK_SENT: Waiting for user to login
        elif step == OnboardingStep.APP_LINK_SENT:
            return "Please use the link I sent to access your Leadership OS dashboard. Once you're in, I'll guide you through a quick tour."

        # Tour steps - handled in the app, not WhatsApp
        elif step in [OnboardingStep.TOUR_GOALS, OnboardingStep.TOUR_TASKS,
                      OnboardingStep.TOUR_TEAM, OnboardingStep.TOUR_JOURNEY,
                      OnboardingStep.TOUR_HABITS]:
            return "I see you're in the app! Follow the tour to get oriented. Text me if you need anything."

        # COMPLETED: Onboarding done
        elif step == OnboardingStep.COMPLETED:
            return None  # Let normal message processing take over

        return "I'm not sure what to do with that. Can you try again?"

    # ============== CONVERSATION SCRIPTS ==============

    @staticmethod
    def _greeting() -> str:
        return """Welcome to Leadership OS. I'm Alfred, your AI Chief of Staff.

I'll help you think clearly, reflect intentionally, and execute effectively. Let's get you set up.

What's your name?"""

    @staticmethod
    def _ask_profession(name: str) -> str:
        return f"""Good to meet you, {name}.

What's your current role or profession?"""

    @staticmethod
    def _ask_goal(name: str, profession: str) -> str:
        return f"""Thanks, {name}.

As a {profession}, what's one professional goal you're working toward in the next 6-12 months?"""

    @staticmethod
    def _ask_goal_why(goal: str) -> str:
        return f"""That's a meaningful goal.

What's driving this? Why does this matter to you? (Type 'skip' if you'd prefer to add this later)"""

    @staticmethod
    def _ask_tasks(name: str) -> str:
        return f"""Perfect. Now, {name}, what's on your plate this week to move that goal forward?

Share a few key tasks - just list them naturally."""

    @staticmethod
    def _ask_quick_win() -> str:
        return """I've captured those tasks.

Which one should you tackle first today? Just tell me the task."""

    @staticmethod
    def _send_app_link(name: str, user_id: int, temp_password: str) -> str:
        # In production, this would be your actual Railway URL
        app_url = f"https://greo-lead-production.up.railway.app/welcome?user={user_id}"

        return f"""Excellent, {name}. I've set up your Leadership OS.

🔗 Access your dashboard: {app_url}

🔑 Your one-time password: {temp_password}

This password expires in 24 hours. Once you're in, I'll walk you through the platform.

See you inside."""

    # ============== UTILITY FUNCTIONS ==============

    @staticmethod
    def _extract_name(message: str) -> Optional[str]:
        """
        Extract name from message. Handles various formats:
        - "John"
        - "My name is John"
        - "I'm John Smith"
        """
        message = message.strip()

        # Direct name (no prefixes)
        if len(message.split()) <= 3 and not any(word in message.lower() for word in ['is', 'am', 'call']):
            return message.title()

        # "My name is John" or "I'm John"
        patterns = [
            r"(?:my name is|i'm|i am|call me)\s+([a-zA-Z\s]+)",
            r"^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)$"  # Capitalized name
        ]

        for pattern in patterns:
            match = re.search(pattern, message, re.IGNORECASE)
            if match:
                return match.group(1).strip().title()

        # If we can't parse it, return as-is if it's short enough
        if len(message.split()) <= 3:
            return message.title()

        return None

    @staticmethod
    def complete_onboarding(db: Session, user: User):
        """Mark onboarding as completed"""
        user.onboarding_completed = True
        user.onboarding_step = OnboardingStep.COMPLETED
        db.commit()


class EmailVerificationService:
    """Handles email verification for associating email with account"""

    @staticmethod
    def create_verification(db: Session, user_id: int, email: str) -> str:
        """
        Create a verification code and send to user's email.
        Returns the verification code.
        """
        # Generate 6-digit code
        code = EmailVerification.generate_code()

        # Create verification record
        verification = EmailVerification(
            user_id=user_id,
            email=email,
            verification_code=code,
            expires_at=datetime.utcnow() + timedelta(minutes=15)
        )
        db.add(verification)
        db.commit()

        return code

    @staticmethod
    def verify_code(db: Session, user_id: int, code: str) -> Tuple[bool, str]:
        """
        Verify the code sent via WhatsApp matches the one sent to email.
        Returns: (success, message)
        """
        verification = db.query(EmailVerification).filter(
            EmailVerification.user_id == user_id,
            EmailVerification.verification_code == code,
            EmailVerification.verified == False
        ).order_by(EmailVerification.created_at.desc()).first()

        if not verification:
            return False, "Invalid verification code. Please check and try again."

        if not verification.is_valid():
            return False, "This code has expired. Please request a new one by sending another email."

        # Mark as verified
        verification.verified = True
        verification.verified_at = datetime.utcnow()

        # Update user email
        user = db.query(User).get(user_id)
        user.email = verification.email

        db.commit()

        return True, f"✓ Email verified! {verification.email} is now linked to your account."

    @staticmethod
    def get_pending_verification(db: Session, user_id: int) -> Optional[EmailVerification]:
        """Get the most recent pending verification for a user"""
        return db.query(EmailVerification).filter(
            EmailVerification.user_id == user_id,
            EmailVerification.verified == False
        ).order_by(EmailVerification.created_at.desc()).first()


class TourManager:
    """Manages the in-app guided tour"""

    TOUR_STEPS = [
        OnboardingStep.TOUR_GOALS,
        OnboardingStep.TOUR_TASKS,
        OnboardingStep.TOUR_TEAM,
        OnboardingStep.TOUR_JOURNEY,
        OnboardingStep.TOUR_HABITS,
    ]

    @staticmethod
    def start_tour(db: Session, user: User):
        """Initialize tour when user first logs in"""
        if not user.tour_completed:
            user.tour_current_step = OnboardingStep.TOUR_GOALS.value
            user.tour_completed_steps = []
            user.onboarding_step = OnboardingStep.TOUR_GOALS
            db.commit()

    @staticmethod
    def complete_tour_step(db: Session, user: User, step: str) -> Optional[str]:
        """
        Mark a tour step as complete and return the next step (or None if tour is done).
        """
        if user.tour_completed:
            return None

        # Add to completed steps
        completed = user.tour_completed_steps or []
        if step not in completed:
            completed.append(step)
            user.tour_completed_steps = completed

        # Find next step
        try:
            current_idx = [s.value for s in TourManager.TOUR_STEPS].index(step)
            if current_idx < len(TourManager.TOUR_STEPS) - 1:
                next_step = TourManager.TOUR_STEPS[current_idx + 1]
                user.tour_current_step = next_step.value
                user.onboarding_step = next_step
                db.commit()
                return next_step.value
            else:
                # Tour complete!
                TourManager.finish_tour(db, user)
                return None
        except ValueError:
            return None

    @staticmethod
    def finish_tour(db: Session, user: User):
        """Mark tour as completed"""
        user.tour_completed = True
        user.tour_current_step = None
        user.onboarding_step = OnboardingStep.COMPLETED
        user.onboarding_completed = True
        db.commit()

    @staticmethod
    def get_tour_progress(user: User) -> Dict:
        """Get current tour progress"""
        return {
            "completed": user.tour_completed,
            "current_step": user.tour_current_step,
            "completed_steps": user.tour_completed_steps or [],
            "total_steps": len(TourManager.TOUR_STEPS),
            "progress_percentage": int((len(user.tour_completed_steps or []) / len(TourManager.TOUR_STEPS)) * 100)
        }


# ============== ONBOARDING DATA EXTRACTION ==============

def extract_tasks_from_onboarding(task_text: str) -> list:
    """
    Extract individual tasks from onboarding free-form text.
    Handles bullet points, numbered lists, and natural language.
    """
    tasks = []

    # Split by common delimiters
    lines = task_text.replace('\r\n', '\n').split('\n')

    for line in lines:
        line = line.strip()
        if not line:
            continue

        # Remove bullet points, numbers, dashes
        task = re.sub(r'^[-•*\d]+[\.)]\s*', '', line)
        task = task.strip()

        if task and len(task) > 3:  # Ignore very short fragments
            tasks.append(task)

    # If no clear structure, try splitting by common conjunctions
    if len(tasks) == 0 and task_text:
        # Try splitting by "and", commas, semicolons
        potential_tasks = re.split(r',\s*(?:and\s+)?|;\s*|(?:\s+and\s+)', task_text)
        tasks = [t.strip() for t in potential_tasks if len(t.strip()) > 3]

    return tasks if tasks else [task_text]  # Fallback: treat whole thing as one task