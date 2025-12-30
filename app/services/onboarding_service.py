"""
Onboarding Service - Executive Onboarding Flow

✅ ENHANCED with db.refresh() after every commit to ensure data persists
"""

from sqlalchemy.orm import Session
from app.models import User, OnboardingStep, EmailVerification
from datetime import datetime, timedelta
from typing import Dict, Optional, Tuple
import re


class OnboardingConversation:
    """Handles the conversational onboarding flow for Leadership OS."""

    TRIGGER_PHRASES = ["hey alfred", "hi alfred", "hello alfred"]

    @staticmethod
    def is_onboarding_trigger(message: str) -> bool:
        """Check if message is an onboarding trigger - exact phrase match only"""
        msg_lower = message.lower().strip()
        # Use startswith to match only at beginning, avoiding "restarted" matching "start"
        result = any(msg_lower.startswith(trigger) for trigger in OnboardingConversation.TRIGGER_PHRASES)
        print(f"🔍 DEBUG [is_onboarding_trigger]: message='{message}' → result={result}")
        return result

    @staticmethod
    def get_user_or_create(db: Session, phone_number: str) -> Tuple[User, bool]:
        """Get existing user or create new one. Returns: (user, is_new)"""
        print(f"🔍 DEBUG [get_user_or_create]: Looking for user with phone={phone_number}")

        user = db.query(User).filter(User.phone_number == phone_number).first()
        is_new = False

        if not user:
            print(f"✨ DEBUG [get_user_or_create]: Creating NEW user")
            user = User(
                phone_number=phone_number,
                onboarding_step='INITIAL',
                onboarding_data={},
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            is_new = True
            print(f"✅ DEBUG [get_user_or_create]: User created with id={user.id}")
        else:
            print(f"♻️ DEBUG [get_user_or_create]: Existing user found with id={user.id}")

        return user, is_new

    @staticmethod
    def process_onboarding_message(db: Session, user: User, message: str) -> str:
        """Process a message during onboarding and return Alfred's response."""
        step = user.onboarding_step
        print(f"\n🔍 DEBUG [process_onboarding_message]:")
        print(f"   User ID: {user.id}")
        print(f"   Current step: {step}")
        print(f"   Message: '{message}'")
        print(f"   Current onboarding_data: {user.onboarding_data}")

        # INITIAL: User just said "Hey Alfred"
        if step == 'INITIAL':
            print(f"📝 DEBUG [INITIAL]: Starting trial and moving to NAME")
            user.onboarding_step = 'NAME'
            user.start_trial()
            db.commit()
            db.refresh(user)  # ← ADDED: Verify commit worked
            print(f"✅ DEBUG [INITIAL]: Trial started, step updated to NAME")
            return OnboardingConversation._greeting()

        # NAME: Collecting name
        elif step == 'NAME':
            name = OnboardingConversation._extract_name(message)
            print(f"📝 DEBUG [NAME]: Extracted name='{name}'")

            if name:
                user.name = name
                user.onboarding_step = 'PROFESSION'
                # With MutableDict, this should work, but let's be explicit
                data = user.onboarding_data or {}
                data['name'] = name
                user.onboarding_data = data

                db.commit()
                db.refresh(user)  # ← ADDED: Verify commit worked

                print(f"✅ DEBUG [NAME]: Saved name='{name}', moved to PROFESSION")
                print(f"   onboarding_data after refresh: {user.onboarding_data}")
                return OnboardingConversation._ask_profession(name)
            else:
                print(f"❌ DEBUG [NAME]: Could not extract name from message")
                return "I didn't catch that. What's your name?"

        # PROFESSION: Collecting profession/role
        elif step == 'PROFESSION':
            profession = message.strip()
            print(f"📝 DEBUG [PROFESSION]: Saving profession='{profession}'")

            user.profession = profession
            user.onboarding_step = 'GOAL'
            data = user.onboarding_data or {}
            data['profession'] = profession
            user.onboarding_data = data

            db.commit()
            db.refresh(user)  # ← ADDED: Verify commit worked

            print(f"✅ DEBUG [PROFESSION]: Saved, moved to GOAL")
            print(f"   onboarding_data after refresh: {user.onboarding_data}")
            return OnboardingConversation._ask_goal(user.name, profession)

        # GOAL: Collecting first goal
        elif step == 'GOAL':
            goal = message.strip()
            print(f"📝 DEBUG [GOAL]: Saving goal='{goal}'")

            user.onboarding_step = 'GOAL_WHY'
            data = user.onboarding_data or {}
            data['first_goal'] = goal
            user.onboarding_data = data

            db.commit()
            db.refresh(user)  # ← ADDED: Verify commit worked

            print(f"✅ DEBUG [GOAL]: Saved, moved to GOAL_WHY")
            print(f"   onboarding_data after refresh: {user.onboarding_data}")
            return OnboardingConversation._ask_goal_why(goal)

        # GOAL_WHY: Collecting goal motivation (optional, can skip)
        elif step == 'GOAL_WHY':
            print(f"📝 DEBUG [GOAL_WHY]: Processing response")

            if message.lower().strip() in ['skip', 'no', 'later', 'pass']:
                print(f"⏭️ DEBUG [GOAL_WHY]: User skipped, moving to TASKS")
                user.onboarding_step = 'TASKS'
                db.commit()
                db.refresh(user)  # ← ADDED: Verify commit worked
                return OnboardingConversation._ask_tasks(user.name)
            else:
                why = message.strip()
                print(f"📝 DEBUG [GOAL_WHY]: Saving why='{why}'")

                data = user.onboarding_data or {}
                data['goal_why'] = why
                user.onboarding_data = data
                user.onboarding_step = 'TASKS'

                db.commit()
                db.refresh(user)  # ← ADDED: Verify commit worked

                print(f"✅ DEBUG [GOAL_WHY]: Saved, moved to TASKS")
                print(f"   onboarding_data after refresh: {user.onboarding_data}")
                return OnboardingConversation._ask_tasks(user.name)

        # TASKS: Collecting initial tasks
        elif step == 'TASKS':
            tasks_text = message.strip()
            print(f"📝 DEBUG [TASKS]: Saving tasks_raw (length={len(tasks_text)} chars)")
            print(f"   tasks_raw preview: '{tasks_text[:100]}...'")

            data = user.onboarding_data or {}
            data['tasks_raw'] = tasks_text
            user.onboarding_data = data
            user.onboarding_step = 'QUICK_WIN'

            db.commit()
            db.refresh(user)  # ← ADDED: Verify commit worked

            print(f"✅ DEBUG [TASKS]: Saved, moved to QUICK_WIN")
            print(f"   onboarding_data after refresh: {user.onboarding_data}")
            print(f"   onboarding_data keys: {list((user.onboarding_data or {}).keys())}")
            return OnboardingConversation._ask_quick_win()

        # QUICK_WIN: Identifying first task to tackle
        elif step == 'QUICK_WIN':
            quick_win = message.strip()
            print(f"📝 DEBUG [QUICK_WIN]: Saving quick_win='{quick_win}'")

            data = user.onboarding_data or {}
            data['quick_win'] = quick_win
            user.onboarding_data = data
            user.onboarding_step = 'APP_LINK_SENT'

            db.commit()
            db.refresh(user)  # ← ADDED: Verify commit worked

            print(f"✅ DEBUG [QUICK_WIN]: Saved, moved to APP_LINK_SENT")
            print(f"   onboarding_data after refresh: {user.onboarding_data}")
            print(f"   FINAL onboarding_data keys: {list((user.onboarding_data or {}).keys())}")

            # Generate temp password and send link
            temp_password = user.generate_temp_password()
            db.commit()
            db.refresh(user)  # ← ADDED: Verify password was saved
            print(f"🔑 DEBUG [QUICK_WIN]: Generated temp_password='{temp_password}'")

            return OnboardingConversation._send_app_link(user.name, user.id, temp_password)

        # APP_LINK_SENT: Waiting for user to login
        elif step == 'APP_LINK_SENT':
            print(f"⏸️ DEBUG [APP_LINK_SENT]: User still in app link sent state")
            return "Please use the link I sent to access your Leadership OS dashboard. Once you're in, I'll guide you through a quick tour."

        # Tour steps - handled in the app, not WhatsApp
        elif step in ['TOUR_GOALS', 'TOUR_TASKS', 'TOUR_TEAM', 'TOUR_JOURNEY', 'TOUR_HABITS']:
            print(f"📱 DEBUG [TOUR]: User in tour step {step}")
            return "I see you're in the app! Follow the tour to get oriented. Text me if you need anything."

        # COMPLETED: Onboarding done
        elif step == 'COMPLETED':
            print(f"✅ DEBUG [COMPLETED]: Onboarding completed, returning None")
            return None  # Let normal message processing take over

        print(f"❓ DEBUG: Unknown step '{step}', returning error message")
        return "I'm not sure what to do with that. Can you try again?"

    # ============== CONVERSATION SCRIPTS ==============

    @staticmethod
    def _greeting() -> str:
        return """Welcome! I'm Alfred, your AI chief of staff.

I'm here to help you think clearly and execute better.

Let's start simple - what's your name?"""

    @staticmethod
    def _ask_profession(name: str) -> str:
        return f"""Great to meet you, {name}!

What do you do? (Your role or profession)"""

    @staticmethod
    def _ask_goal(name: str, profession: str) -> str:
        return f"""Perfect, {name}.

As a {profession}, what's one meaningful goal you want to achieve in the next 6-12 months?"""

    @staticmethod
    def _ask_goal_why(goal: str) -> str:
        return f"""Got it: "{goal}"

Why is this important to you? (Or type 'skip' if you want to move on)"""

    @staticmethod
    def _ask_tasks(name: str) -> str:
        return f"""Excellent, {name}.

Share a few key tasks - just list them naturally."""

    @staticmethod
    def _ask_quick_win() -> str:
        return """I've captured those tasks.

Which one should you tackle first today? Just tell me the task."""

    @staticmethod
    def _send_app_link(name: str, user_id: int, temp_password: str) -> str:
        app_url = f"https://greo-lead-production.up.railway.app/welcome?user={user_id}"

        return f"""Excellent, {name}. I've set up your Leadership OS.

🔗 Access your dashboard: {app_url}

🔑 Your one-time password: {temp_password}

This password expires in 24 hours. Once you're in, I'll walk you through the platform.

See you inside."""

    # ============== UTILITY FUNCTIONS ==============

    @staticmethod
    def _extract_name(message: str) -> Optional[str]:
        """Extract name from message."""
        message = message.strip()
        print(f"🔍 DEBUG [_extract_name]: Parsing '{message}'")

        # Direct name (no prefixes)
        if len(message.split()) <= 3 and not any(word in message.lower() for word in ['is', 'am', 'call']):
            result = message.title()
            print(f"✅ DEBUG [_extract_name]: Direct name → '{result}'")
            return result

        # "My name is John" or "I'm John"
        patterns = [
            r"(?:my name is|i'm|i am|call me)\s+([a-zA-Z\s]+)",
            r"^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)$"
        ]

        for pattern in patterns:
            match = re.search(pattern, message, re.IGNORECASE)
            if match:
                result = match.group(1).strip().title()
                print(f"✅ DEBUG [_extract_name]: Pattern match → '{result}'")
                return result

        # Fallback
        if len(message.split()) <= 3:
            result = message.title()
            print(f"⚠️ DEBUG [_extract_name]: Fallback → '{result}'")
            return result

        print(f"❌ DEBUG [_extract_name]: Could not extract name")
        return None

    @staticmethod
    def complete_onboarding(db: Session, user: User):
        """Mark onboarding as completed"""
        print(f"🏁 DEBUG [complete_onboarding]: Marking user {user.id} as completed")
        user.onboarding_completed = True
        user.onboarding_step = 'COMPLETED'
        db.commit()
        db.refresh(user)
        print(f"✅ DEBUG [complete_onboarding]: Done")


class EmailVerificationService:
    """Handles email verification for associating email with account"""

    @staticmethod
    def create_verification(db: Session, user_id: int, email: str) -> str:
        """Create a verification code and send to user's email. Returns the verification code."""
        code = EmailVerification.generate_code()
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
        """Verify the code sent via WhatsApp matches the one sent to email. Returns: (success, message)"""
        verification = db.query(EmailVerification).filter(
            EmailVerification.user_id == user_id,
            EmailVerification.verification_code == code,
            EmailVerification.verified == False
        ).order_by(EmailVerification.created_at.desc()).first()

        if not verification:
            return False, "Invalid verification code. Please check and try again."

        if not verification.is_valid():
            return False, "This code has expired. Please request a new one by sending another email."

        verification.verified = True
        verification.verified_at = datetime.utcnow()
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

    TOUR_STEPS = ['TOUR_GOALS', 'TOUR_TASKS', 'TOUR_TEAM', 'TOUR_JOURNEY', 'TOUR_HABITS']

    @staticmethod
    def start_tour(db: Session, user: User):
        """Initialize tour when user first logs in"""
        if not user.tour_completed:
            user.tour_current_step = 'TOUR_GOALS'
            user.tour_completed_steps = []
            user.onboarding_step = 'TOUR_GOALS'
            db.commit()

    @staticmethod
    def complete_tour_step(db: Session, user: User, step: str) -> Optional[str]:
        """Mark a tour step as complete and return the next step (or None if tour is done)."""
        if user.tour_completed:
            return None

        completed = user.tour_completed_steps or []
        if step not in completed:
            completed.append(step)
            user.tour_completed_steps = completed

        try:
            current_idx = TourManager.TOUR_STEPS.index(step)
            if current_idx < len(TourManager.TOUR_STEPS) - 1:
                next_step = TourManager.TOUR_STEPS[current_idx + 1]
                user.tour_current_step = next_step
                user.onboarding_step = next_step
                db.commit()
                return next_step
            else:
                TourManager.finish_tour(db, user)
                return None
        except ValueError:
            return None

    @staticmethod
    def finish_tour(db: Session, user: User):
        """Mark tour as completed"""
        user.tour_completed = True
        user.tour_current_step = None
        user.onboarding_step = 'COMPLETED'
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


def extract_tasks_from_onboarding(task_text: str) -> list:
    """Extract individual tasks from onboarding free-form text."""
    tasks = []
    lines = task_text.replace('\r\n', '\n').split('\n')

    for line in lines:
        line = line.strip()
        if not line:
            continue

        task = re.sub(r'^[-•*\d]+[\.)]\s*', '', line)
        task = task.strip()

        if task and len(task) > 3:
            tasks.append(task)

    if len(tasks) == 0 and task_text:
        potential_tasks = re.split(r',\s*(?:and\s+)?|;\s*|(?:\s+and\s+)', task_text)
        tasks = [t.strip() for t in potential_tasks if len(t.strip()) > 3]

    return tasks if tasks else [task_text]