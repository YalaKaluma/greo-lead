"""
Onboarding Service - Executive Onboarding Flow (WITH DEBUG LOGGING)
"""

from sqlalchemy.orm import Session
from app.models import User, OnboardingStep, EmailVerification
from datetime import datetime, timedelta
from typing import Dict, Optional, Tuple
import re


class OnboardingConversation:
    """Handles the conversational onboarding flow for Leadership OS."""

    TRIGGER_PHRASES = ["hey alfred", "hi alfred", "hello alfred", "start"]

    @staticmethod
    def is_onboarding_trigger(message: str) -> bool:
        """Check if message is an onboarding trigger"""
        msg_lower = message.lower().strip()
        result = any(trigger in msg_lower for trigger in OnboardingConversation.TRIGGER_PHRASES)
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
            print(f"✅ DEBUG [INITIAL]: Trial started, step updated to NAME")
            return OnboardingConversation._greeting()

        # NAME: Collecting name
        elif step == 'NAME':
            name = OnboardingConversation._extract_name(message)
            print(f"📝 DEBUG [NAME]: Extracted name='{name}'")

            if name:
                user.name = name
                user.onboarding_step = 'PROFESSION'
                user.onboarding_data = user.onboarding_data or {}
                user.onboarding_data['name'] = name
                db.commit()
                print(f"✅ DEBUG [NAME]: Saved name='{name}', moved to PROFESSION")
                print(f"   onboarding_data now: {user.onboarding_data}")
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
            user.onboarding_data['profession'] = profession
            db.commit()
            print(f"✅ DEBUG [PROFESSION]: Saved, moved to GOAL")
            print(f"   onboarding_data now: {user.onboarding_data}")
            return OnboardingConversation._ask_goal(user.name, profession)

        # GOAL: Collecting first goal
        elif step == 'GOAL':
            goal = message.strip()
            print(f"📝 DEBUG [GOAL]: Saving goal='{goal}'")

            user.onboarding_step = 'GOAL_WHY'
            user.onboarding_data['first_goal'] = goal
            db.commit()
            print(f"✅ DEBUG [GOAL]: Saved, moved to GOAL_WHY")
            print(f"   onboarding_data now: {user.onboarding_data}")
            return OnboardingConversation._ask_goal_why(goal)

        # GOAL_WHY: Collecting goal motivation (optional, can skip)
        elif step == 'GOAL_WHY':
            print(f"📝 DEBUG [GOAL_WHY]: Processing response")

            if message.lower().strip() in ['skip', 'no', 'later', 'pass']:
                print(f"⏭️ DEBUG [GOAL_WHY]: User skipped, moving to TASKS")
                user.onboarding_step = 'TASKS'
                db.commit()
                return OnboardingConversation._ask_tasks(user.name)
            else:
                why = message.strip()
                print(f"📝 DEBUG [GOAL_WHY]: Saving why='{why}'")
                user.onboarding_data['goal_why'] = why
                user.onboarding_step = 'TASKS'
                db.commit()
                print(f"✅ DEBUG [GOAL_WHY]: Saved, moved to TASKS")
                print(f"   onboarding_data now: {user.onboarding_data}")
                return OnboardingConversation._ask_tasks(user.name)

        # TASKS: Collecting initial tasks
        elif step == 'TASKS':
            tasks_text = message.strip()
            print(f"📝 DEBUG [TASKS]: Saving tasks_raw='{tasks_text[:100]}...'")

            user.onboarding_data['tasks_raw'] = tasks_text
            user.onboarding_step = 'QUICK_WIN'
            db.commit()
            print(f"✅ DEBUG [TASKS]: Saved, moved to QUICK_WIN")
            print(f"   onboarding_data now: {user.onboarding_data}")
            return OnboardingConversation._ask_quick_win()

        # QUICK_WIN: Identifying first task to tackle
        elif step == 'QUICK_WIN':
            quick_win = message.strip()
            print(f"📝 DEBUG [QUICK_WIN]: Saving quick_win='{quick_win}'")

            user.onboarding_data['quick_win'] = quick_win
            user.onboarding_step = 'APP_LINK_SENT'
            db.commit()
            print(f"✅ DEBUG [QUICK_WIN]: Saved, moved to APP_LINK_SENT")
            print(f"   onboarding_data now: {user.onboarding_data}")

            # Generate temp password and send link
            temp_password = user.generate_temp_password()
            db.commit()
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
        print(f"✅ DEBUG [complete_onboarding]: Done")

# (EmailVerificationService and TourManager remain the same - only added debug to OnboardingConversation)