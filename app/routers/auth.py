"""
Auth Router - Handle user authentication
app/routers/auth.py
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.db import get_db
from app.models import User

router = APIRouter(tags=["auth"])


class LoginRequest(BaseModel):
    username: str  # Could be name, email, or phone
    password: str


@router.post("/login")
async def login(credentials: LoginRequest, db: Session = Depends(get_db)):
    """
    Login endpoint - handles both temporary passwords and permanent passwords.
    """
    # Try to find user by name (username field)
    user = db.query(User).filter(User.name == credentials.username).first()

    if not user:
        return {
            "success": False,
            "message": "Invalid credentials"
        }

    # Check temporary password first (onboarding users)
    if user.temp_password and user.temp_password == credentials.password:
        return {
            "success": True,
            "user_number": user.phone_number,
            "user_name": user.name,
            "needs_tour": not user.tour_completed,
            "trial_days_left": user.days_left_in_trial() if hasattr(user, 'days_left_in_trial') else 21
        }

    # Check permanent password (returning users)
    # TODO: Implement proper bcrypt password hashing
    if user.password_hash and user.password_hash == credentials.password:
        return {
            "success": True,
            "user_number": user.phone_number,
            "user_name": user.name,
            "needs_tour": False,
            "trial_days_left": user.days_left_in_trial() if hasattr(user, 'days_left_in_trial') else 0
        }

    # Neither password matched
    return {
        "success": False,
        "message": "Invalid credentials"
    }


@router.post("/logout")
async def logout():
    """
    Logout endpoint - just returns success since we're using simple auth.
    In production, this would invalidate session tokens.
    """
    return {"success": True, "message": "Logged out successfully"}


@router.get("/me")
async def get_current_user(user_number: str, db: Session = Depends(get_db)):
    """
    Get current user info.
    Used by frontend to check auth status and get user details.
    """
    user = db.query(User).filter(User.phone_number == user_number).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "success": True,
        "user": {
            "name": user.name,
            "email": user.email,
            "profession": user.profession,
            "phone_number": user.phone_number,
            "subscription_status": user.subscription_status,
            "trial_days_left": user.days_left_in_trial() if hasattr(user, 'days_left_in_trial') else 0,
            "onboarding_completed": user.onboarding_completed,
            "tour_completed": user.tour_completed
        }
    }