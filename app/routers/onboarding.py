"""
Onboarding Router - API endpoints for user onboarding, authentication, and tour

✅ ENHANCED with comprehensive logging and error handling for debugging
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime
import secrets

from app.db import get_db
from app.models import User, OnboardingStep, EmailVerification
from app.services.onboarding_service import (
    OnboardingConversation,
    EmailVerificationService,
    TourManager,
    extract_tasks_from_onboarding
)
from app.services import journey_service
from app.routers.tasks import Task as TaskModel

router = APIRouter(tags=["onboarding"])


# ============== PYDANTIC MODELS ==============

class LoginRequest(BaseModel):
    user_id: int
    password: str


class LoginResponse(BaseModel):
    success: bool
    message: str
    user_number: Optional[str] = None
    user_name: Optional[str] = None
    trial_days_left: Optional[int] = None
    needs_tour: bool = False


class TourProgressResponse(BaseModel):
    completed: bool
    current_step: Optional[str]
    completed_steps: list
    total_steps: int
    progress_percentage: int


class CompleteTourStepRequest(BaseModel):
    step: str


class EmailVerifyRequest(BaseModel):
    code: str


# ============== AUTHENTICATION ENDPOINTS ==============

@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest, db: Session = Depends(get_db)):
    """
    Login endpoint for first-time access via temp password.
    After successful login, user will be guided through the tour.
    """
    user = db.query(User).filter(User.id == request.user_id).first()

    if not user:
        return LoginResponse(
            success=False,
            message="User not found. Please check your link."
        )

    # Check if already has permanent password (returning user)
    if user.password_hash:
        # TODO: Implement proper password hashing with bcrypt
        if user.password_hash == request.password:
            return LoginResponse(
                success=True,
                message="Welcome back!",
                user_number=user.phone_number,
                user_name=user.name,
                trial_days_left=user.days_left_in_trial(),
                needs_tour=False
            )
        else:
            return LoginResponse(
                success=False,
                message="Incorrect password."
            )

    # First-time login with temp password
    if not user.temp_password:
        return LoginResponse(
            success=False,
            message="No temporary password set. Please contact support."
        )

    # Check if temp password expired
    if user.temp_password_expires and datetime.utcnow() > user.temp_password_expires:
        return LoginResponse(
            success=False,
            message="This temporary password has expired. Please request a new one via WhatsApp."
        )

    # Verify temp password
    if user.temp_password.upper() == request.password.upper():
        # Generate permanent password or just mark as logged in
        # For now, we'll accept temp password and start tour

        # Start tour
        TourManager.start_tour(db, user)

        # Update last active
        user.last_active_at = datetime.utcnow()
        db.commit()

        return LoginResponse(
            success=True,
            message="Welcome to Leadership OS!",
            user_number=user.phone_number,
            user_name=user.name,
            trial_days_left=user.days_left_in_trial(),
            needs_tour=not user.tour_completed
        )
    else:
        return LoginResponse(
            success=False,
            message="Incorrect password. Please check and try again."
        )


@router.post("/set-permanent-password")
async def set_permanent_password(
        user_id: int,
        new_password: str,
        db: Session = Depends(get_db)
):
    """
    Allow user to set a permanent password after first login.
    TODO: Implement proper password hashing with bcrypt.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # For now, storing plain text (MUST implement hashing in production)
    user.password_hash = new_password
    user.temp_password = None  # Clear temp password
    user.temp_password_expires = None
    db.commit()

    return {"success": True, "message": "Password set successfully"}


# ============== TOUR ENDPOINTS ==============

@router.get("/tour/progress", response_model=TourProgressResponse)
async def get_tour_progress(user_number: str, db: Session = Depends(get_db)):
    """Get current tour progress for a user"""
    user = db.query(User).filter(User.phone_number == user_number).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    progress = TourManager.get_tour_progress(user)
    return TourProgressResponse(**progress)


@router.post("/tour/complete-step")
async def complete_tour_step(
        user_number: str,
        request: CompleteTourStepRequest,
        db: Session = Depends(get_db)
):
    """
    Mark a tour step as completed and get the next step.
    Called by frontend when user completes a tour interaction.
    """
    user = db.query(User).filter(User.phone_number == user_number).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    next_step = TourManager.complete_tour_step(db, user, request.step)

    return {
        "success": True,
        "next_step": next_step,
        "tour_completed": user.tour_completed,
        "message": "Tour completed! You're all set." if not next_step else f"Moving to: {next_step}"
    }


@router.post("/tour/skip")
async def skip_tour(user_number: str, db: Session = Depends(get_db)):
    """
    Skip the tour (for users who want to explore on their own).
    Note: Per requirements, tour should NOT be skippable initially.
    This endpoint is here for future flexibility.
    """
    user = db.query(User).filter(User.phone_number == user_number).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    TourManager.finish_tour(db, user)

    return {
        "success": True,
        "message": "Tour skipped. Feel free to explore on your own!"
    }


# ============== EMAIL VERIFICATION ==============

@router.post("/verify-email")
async def verify_email(
        user_number: str,
        request: EmailVerifyRequest,
        db: Session = Depends(get_db)
):
    """
    Verify email using code sent via WhatsApp.
    User sends email to Alfred → Alfred replies with code → User sends code via WhatsApp.
    """
    user = db.query(User).filter(User.phone_number == user_number).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    success, message = EmailVerificationService.verify_code(db, user.id, request.code)

    return {
        "success": success,
        "message": message,
        "email": user.email if success else None
    }


@router.get("/user/status")
async def get_user_status(user_number: str, db: Session = Depends(get_db)):
    """
    Get user's current status including trial info, onboarding progress, etc.
    Useful for dashboard display.
    """
    user = db.query(User).filter(User.phone_number == user_number).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "name": user.name,
        "email": user.email,
        "profession": user.profession,
        "subscription_status": user.subscription_status.value,
        "trial_days_left": user.days_left_in_trial() if user.is_trial_active() else 0,
        "trial_active": user.is_trial_active(),
        "onboarding_completed": user.onboarding_completed,
        "tour_completed": user.tour_completed,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "last_active": user.last_active_at.isoformat() if user.last_active_at else None,
    }


# ============== ONBOARDING DATA PROCESSING ==============

@router.post("/process-onboarding-data")
async def process_onboarding_data(user_number: str, db: Session = Depends(get_db)):
    """
    Process the data collected during onboarding and populate the user's journey.
    This should be called after user logs in for the first time.
    Called automatically when tour starts.

    ✅ ENHANCED with comprehensive logging for debugging
    """
    print(f"\n{'=' * 60}")
    print(f"🎯 DEBUG [process-onboarding-data]: ENDPOINT CALLED")
    print(f"   user_number: {user_number}")
    print(f"{'=' * 60}")

    # Get user
    user = db.query(User).filter(User.phone_number == user_number).first()
    if not user:
        print(f"❌ DEBUG: User not found for phone_number={user_number}")
        raise HTTPException(status_code=404, detail="User not found")

    print(f"✅ DEBUG: User found - id={user.id}, name={user.name}")
    print(f"   onboarding_completed: {user.onboarding_completed}")
    print(f"   onboarding_step: {user.onboarding_step}")

    # Check if onboarding_data exists
    if not user.onboarding_data:
        print(f"❌ DEBUG: onboarding_data is EMPTY or None!")
        print(f"   Type: {type(user.onboarding_data)}")
        print(f"   Value: {user.onboarding_data}")
        raise HTTPException(
            status_code=404,
            detail="No onboarding data found. User may not have completed WhatsApp onboarding."
        )

    data = user.onboarding_data
    print(f"✅ DEBUG: onboarding_data found:")
    print(f"   Keys: {list(data.keys())}")
    print(f"   Data: {data}")

    results = {
        "success": False,
        "goal_added": False,
        "tasks_added": 0,
        "errors": []
    }

    try:
        # ========== 1. ADD GOAL TO JOURNEY ==========
        print(f"\n--- STEP 1: Processing Goal ---")

        if 'first_goal' in data:
            goal_text = data['first_goal']
            why = data.get('goal_why', '')

            print(f"📝 DEBUG: Found goal data:")
            print(f"   goal_text: '{goal_text}'")
            print(f"   why: '{why}'")

            try:
                goal = journey_service.add_goal(
                    db,
                    user_number,
                    goal_text=goal_text,
                    why=why,
                    time_horizon='vision'
                )
                print(f"✅ DEBUG: Goal added successfully!")
                print(f"   Goal ID: {goal.id}")
                print(f"   Goal text: {goal.goal_text}")
                results['goal_added'] = True
            except Exception as e:
                error_msg = f"Failed to add goal: {str(e)}"
                print(f"❌ DEBUG: {error_msg}")
                results['errors'].append(error_msg)
                import traceback
                traceback.print_exc()
        else:
            print(f"⚠️ DEBUG: No 'first_goal' found in onboarding_data")
            print(f"   Available keys: {list(data.keys())}")

        # ========== 2. ADD TASKS ==========
        print(f"\n--- STEP 2: Processing Tasks ---")

        if 'tasks_raw' in data:
            tasks_text = data['tasks_raw']
            quick_win = data.get('quick_win', '')

            print(f"📝 DEBUG: Found task data:")
            print(f"   tasks_raw length: {len(tasks_text)} chars")
            print(f"   tasks_raw preview: '{tasks_text[:100]}...'")
            print(f"   quick_win: '{quick_win}'")

            try:
                # Extract individual tasks
                tasks = extract_tasks_from_onboarding(tasks_text)
                print(f"✅ DEBUG: Extracted {len(tasks)} tasks:")
                for i, task in enumerate(tasks, 1):
                    print(f"   {i}. '{task}'")

                # Create task objects
                tasks_created = 0
                for task_text in tasks:
                    # Mark the quick win with high priority
                    is_quick_win = quick_win.lower() in task_text.lower() if quick_win else False

                    try:
                        task = TaskModel(
                            user_number=user_number,
                            title=task_text,
                            priority='High' if is_quick_win else 'Medium',
                            status='open',
                            notes=f"Added during onboarding" + (f" - Quick win!" if is_quick_win else "")
                        )
                        db.add(task)
                        tasks_created += 1

                        print(f"✅ DEBUG: Task queued for creation:")
                        print(f"   Title: '{task_text}'")
                        print(f"   Priority: {task.priority}")
                        print(f"   Quick win: {is_quick_win}")
                    except Exception as e:
                        error_msg = f"Failed to create task '{task_text}': {str(e)}"
                        print(f"❌ DEBUG: {error_msg}")
                        results['errors'].append(error_msg)

                # Commit all tasks at once
                if tasks_created > 0:
                    db.commit()
                    print(f"✅ DEBUG: {tasks_created} tasks committed to database successfully!")
                    results['tasks_added'] = tasks_created
                else:
                    print(f"⚠️ DEBUG: No tasks were created")

            except Exception as e:
                error_msg = f"Failed to process tasks: {str(e)}"
                print(f"❌ DEBUG: {error_msg}")
                results['errors'].append(error_msg)
                import traceback
                traceback.print_exc()
        else:
            print(f"⚠️ DEBUG: No 'tasks_raw' found in onboarding_data")
            print(f"   Available keys: {list(data.keys())}")

        # ========== FINAL RESULT ==========
        print(f"\n{'=' * 60}")
        print(f"🏁 DEBUG: Processing Complete")
        print(f"   Goal added: {results['goal_added']}")
        print(f"   Tasks added: {results['tasks_added']}")
        print(f"   Errors: {len(results['errors'])}")
        if results['errors']:
            for i, error in enumerate(results['errors'], 1):
                print(f"      {i}. {error}")
        print(f"{'=' * 60}\n")

        results['success'] = True
        results[
            'message'] = f"Onboarding data processed: {results['tasks_added']} tasks and {'1' if results['goal_added'] else '0'} goal added"

        return results

    except Exception as e:
        error_msg = f"Unexpected error during onboarding data processing: {str(e)}"
        print(f"\n❌ DEBUG: {error_msg}")
        import traceback
        traceback.print_exc()

        # Re-raise as HTTP exception
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process onboarding data: {str(e)}"
        )


# ============== DEBUG ENDPOINT (TEMPORARY) ==============

@router.get("/debug/user-data")
async def debug_user_data(user_number: str, db: Session = Depends(get_db)):
    """
    DEBUG ENDPOINT: Check what data is actually in the database for a user.

    This helps diagnose if onboarding_data is being saved to the database.
    Call this after completing WhatsApp onboarding to see what's stored.

    Example: GET /api/onboarding/debug/user-data?user_number=whatsapp:+14709150111
    """
    print(f"\n🔍 DEBUG ENDPOINT: Checking user data for {user_number}")

    user = db.query(User).filter(User.phone_number == user_number).first()

    if not user:
        print(f"❌ DEBUG: User not found")
        return {"error": "User not found", "user_number": user_number}

    print(f"✅ DEBUG: User found - id={user.id}")
    print(f"   onboarding_data type: {type(user.onboarding_data)}")
    print(f"   onboarding_data value: {user.onboarding_data}")

    result = {
        "user_id": user.id,
        "name": user.name,
        "profession": user.profession,
        "phone_number": user.phone_number,
        "onboarding_step": str(user.onboarding_step),
        "onboarding_completed": user.onboarding_completed,
        "onboarding_data": user.onboarding_data,
        "onboarding_data_type": str(type(user.onboarding_data)),
        "onboarding_data_keys": list((user.onboarding_data or {}).keys()),
        "onboarding_data_is_empty": user.onboarding_data is None or len(user.onboarding_data or {}) == 0,
        "temp_password": user.temp_password,  # To verify password was saved
    }

    print(f"   Returning: {result}")
    return result
