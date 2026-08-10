"""
Onboarding Router - API endpoints for user onboarding, authentication, and tour

✅ ENHANCED with comprehensive logging and error handling for debugging
"""

from fastapi import APIRouter, Depends, HTTPException, Request, Response
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
from app.utils.security import create_session_token, hash_password, verify_password
from app.utils.session_cookie import set_session_cookie
from app.services.in_app_onboarding_service import get_session, respond
from app.utils.safe_errors import internal_error, log_failure

router = APIRouter(tags=["onboarding"])
public_router = APIRouter(tags=["onboarding"])


def _find_user_by_number_or_email(db: Session, user_number: str) -> Optional[User]:
    return db.query(User).filter((User.phone_number == user_number) | (User.email == user_number)).first()


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
    access_token: Optional[str] = None
    token_type: Optional[str] = None
    expires_in: Optional[int] = None
    must_change_password: bool = False


class InAppOnboardingResponse(BaseModel):
    user_number: str
    answer: str


@router.get("/in-app/session")
def get_in_app_onboarding_session(user_number: str, db: Session = Depends(get_db)):
    user = _find_user_by_number_or_email(db, user_number)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return get_session(user)


@router.post("/in-app/respond")
def respond_to_in_app_onboarding(payload: InAppOnboardingResponse, db: Session = Depends(get_db)):
    user = _find_user_by_number_or_email(db, payload.user_number)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    try:
        return respond(db, user, payload.answer)
    except (ValueError, RuntimeError) as exc:
        incident_id = log_failure("in_app_onboarding_response", exc)
        raise HTTPException(
            status_code=400,
            detail=f"The onboarding response could not be accepted. Reference: {incident_id}",
        ) from exc


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

@public_router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest, response: Response, db: Session = Depends(get_db)):
    """
    Login endpoint for first-time access via temp password.
    After successful login, users enter the app directly.
    """
    user = db.query(User).filter(User.id == request.user_id).first()

    if not user:
        return LoginResponse(
            success=False,
            message="User not found. Please check your link."
        )

    if not getattr(user, "is_active", True):
        return LoginResponse(
            success=False,
            message="This account is inactive. Please contact support."
        )

    # Check if already has permanent password (returning user)
    if user.password_hash:
        if verify_password(request.password, user.password_hash):
            user.last_login_at = datetime.utcnow()
            user.last_active_at = user.last_login_at
            db.commit()
            access_token = create_session_token(user.id, user.phone_number, user.session_version)
            set_session_cookie(response, access_token)
            return LoginResponse(
                success=True,
                message="Welcome back!",
                user_number=user.phone_number,
                user_name=user.name,
                trial_days_left=user.days_left_in_trial(),
                needs_tour=False,
                must_change_password=False,
                access_token=access_token,
                token_type="bearer",  # nosec B106 - OAuth token type, not a password
                expires_in=60 * 60 * 24 * 30,
            )
        else:
            pass
            return LoginResponse(
                success=False,
                message="Incorrect password."
            )

    # First-time login with temp password
    if not user.temp_password:
        access_token = create_session_token(user.id, user.phone_number, user.session_version)
        set_session_cookie(response, access_token)
        return LoginResponse(
            success=False,
            message="No temporary password set. Please contact support."
        )

    if user.temp_password_consumed_at is not None:
        return LoginResponse(
            success=False,
            message="This temporary password has already been used. Please request a new invitation."
        )

    # Check if temp password expired
    if user.temp_password_expires and datetime.utcnow() > user.temp_password_expires:
        return LoginResponse(
            success=False,
            message="This temporary password has expired. Please request a new one via WhatsApp."
        )

    # Verify temp password
    if verify_password(request.password, user.temp_password):
        # Update last active
        user.temp_password_consumed_at = datetime.utcnow()
        user.last_login_at = datetime.utcnow()
        user.last_active_at = user.last_login_at
        user.tour_current_step = None
        user.tour_completed = True
        db.commit()

        return LoginResponse(
            success=True,
            message="Welcome to Leadership OS!",
            user_number=user.phone_number,
            user_name=user.name,
            trial_days_left=user.days_left_in_trial(),
            needs_tour=False,
            must_change_password=True,
            access_token=access_token,
            token_type="bearer",  # nosec B106 - OAuth token type, not a password
            expires_in=60 * 60 * 24 * 30,
        )
    else:
        return LoginResponse(
            success=False,
            message="Incorrect password. Please check and try again."
        )


@public_router.post("/set-permanent-password")
async def set_permanent_password(
        user_id: int,
        new_password: str,
        db: Session = Depends(get_db)
):
    del user_id, new_password, db
    raise HTTPException(
        status_code=410,
        detail="This legacy password endpoint has been disabled. Sign in and use account settings.",
    )


# ============== TOUR ENDPOINTS ==============

@router.get("/tour/progress", response_model=TourProgressResponse)
async def get_tour_progress(user_number: str, db: Session = Depends(get_db)):
    """Get current tour progress for a user"""
    user = _find_user_by_number_or_email(db, user_number)
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
    user = _find_user_by_number_or_email(db, user_number)
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
    user = _find_user_by_number_or_email(db, user_number)
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
    user = _find_user_by_number_or_email(db, user_number)
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
    user = _find_user_by_number_or_email(db, user_number)
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
    return {
        "success": True,
        "skipped": True,
        "message": "Deprecated onboarding prefill skipped."
    }

    # Get user
    user = _find_user_by_number_or_email(db, user_number)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Check if onboarding_data exists
    if not user.onboarding_data:
        raise HTTPException(
            status_code=404,
            detail="No onboarding data found. User may not have completed WhatsApp onboarding."
        )

    data = user.onboarding_data
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
            print(f"   goal_text length: {len(goal_text or '')}")
            print(f"   why length: {len(why or '')}")

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
                results['goal_added'] = True
            except Exception as e:
                error_msg = "Failed to add goal"
                log_failure("onboarding_goal_creation", e)
                results['errors'].append(error_msg)
        else:
            pass

        # ========== 2. ADD TASKS ==========
        print(f"\n--- STEP 2: Processing Tasks ---")

        if 'tasks_raw' in data:
            tasks_text = data['tasks_raw']
            quick_win = data.get('quick_win', '')

            print(f"📝 DEBUG: Found task data:")
            print(f"   tasks_raw length: {len(tasks_text)} chars")
            print(f"   quick_win present: {bool(quick_win)}")

            try:
                # Extract individual tasks
                tasks = extract_tasks_from_onboarding(tasks_text)
                print(f"✅ DEBUG: Extracted {len(tasks)} tasks")

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
                        print(f"   Priority: {task.priority}")
                        print(f"   Quick win: {is_quick_win}")
                    except Exception as e:
                        error_msg = "Failed to create an onboarding task"
                        log_failure("onboarding_task_creation", e)
                        results['errors'].append(error_msg)

                # Commit all tasks at once
                if tasks_created > 0:
                    db.commit()
                    print(f"✅ DEBUG: {tasks_created} tasks committed to database successfully!")
                    results['tasks_added'] = tasks_created
                else:
                    print(f"⚠️ DEBUG: No tasks were created")

            except Exception as e:
                error_msg = "Failed to process onboarding tasks"
                log_failure("onboarding_task_processing", e)
                results['errors'].append(error_msg)
        else:
            pass

        # ========== FINAL RESULT ==========
        print(f"\n{'=' * 60}")
        print(f"🏁 DEBUG: Processing Complete")
        print(f"   Goal added: {results['goal_added']}")
        print(f"   Tasks added: {results['tasks_added']}")
        print(f"   Errors: {len(results['errors'])}")
        print(f"{'=' * 60}\n")

        results['success'] = True
        results[
            'message'] = f"Onboarding data processed: {results['tasks_added']} tasks and {'1' if results['goal_added'] else '0'} goal added"

        return results

    except Exception as e:
        raise internal_error(
            "onboarding_data_processing",
            e,
            "Onboarding data could not be processed.",
        )
