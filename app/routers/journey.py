from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import (
    JourneyGoal,
    JourneyStrength,
    JourneyDevelopmentArea,
    JourneyProject,
    JourneyPerson,
    JourneyFailure,
    JourneyOpportunity
)
from pydantic import BaseModel
from datetime import datetime
from typing import Optional

router = APIRouter()


# Pydantic response models
class StrengthResponse(BaseModel):
    id: int
    user_number: str
    strength: str
    source: Optional[str]
    first_seen_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DevelopmentAreaResponse(BaseModel):
    id: int
    user_number: str
    skill: str
    source: Optional[str]

    class Config:
        from_attributes = True


class ProjectResponse(BaseModel):
    id: int
    user_number: str
    project_name: str
    goal: Optional[str]
    description: Optional[str]
    status: str
    first_seen_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PersonResponse(BaseModel):
    id: int
    user_number: str
    name: str
    email: Optional[str]
    phone: Optional[str]
    relation: Optional[str]
    context: Optional[str]
    first_seen_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class FailureResponse(BaseModel):
    id: int
    user_number: str
    failure_text: str
    learning: Optional[str]
    scar: Optional[str]
    first_seen_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class OpportunityResponse(BaseModel):
    id: int
    user_number: str
    opportunity_text: str
    category: Optional[str]
    first_seen_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class GoalResponse(BaseModel):
    id: int
    user_number: str
    goal_text: str
    why: Optional[str]
    time_horizon: Optional[str]
    first_seen_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ========================================
# STRENGTHS
# ========================================
@router.get("/strengths", response_model=list[StrengthResponse])
def get_strengths(
        user_number: str,
        db: Session = Depends(get_db)
):
    """Get all strengths for a user"""
    strengths = db.query(JourneyStrength).filter(
        JourneyStrength.user_number == user_number
    ).order_by(JourneyStrength.first_seen_at.desc()).all()

    return strengths


# ========================================
# DEVELOPMENT AREAS
# ========================================
@router.get("/development-areas", response_model=list[DevelopmentAreaResponse])
def get_development_areas(
        user_number: str,
        db: Session = Depends(get_db)
):
    """Get all development areas for a user"""
    areas = db.query(JourneyDevelopmentArea).filter(
        JourneyDevelopmentArea.user_number == user_number
    ).all()

    return areas


# ========================================
# PROJECTS
# ========================================
@router.get("/projects", response_model=list[ProjectResponse])
def get_projects(
        user_number: str,
        db: Session = Depends(get_db)
):
    """Get all projects for a user"""
    projects = db.query(JourneyProject).filter(
        JourneyProject.user_number == user_number
    ).order_by(JourneyProject.first_seen_at.desc()).all()

    return projects


# ========================================
# PEOPLE
# ========================================
@router.get("/people", response_model=list[PersonResponse])
def get_people(
        user_number: str,
        db: Session = Depends(get_db)
):
    """Get all important people for a user"""
    people = db.query(JourneyPerson).filter(
        JourneyPerson.user_number == user_number
    ).order_by(JourneyPerson.first_seen_at.desc()).all()

    return people


# ========================================
# FAILURES & LEARNINGS
# ========================================
@router.get("/failures", response_model=list[FailureResponse])
def get_failures(
        user_number: str,
        db: Session = Depends(get_db)
):
    """Get all failures and learnings for a user"""
    failures = db.query(JourneyFailure).filter(
        JourneyFailure.user_number == user_number
    ).order_by(JourneyFailure.first_seen_at.desc()).all()

    return failures


# ========================================
# OPPORTUNITIES
# ========================================
@router.get("/opportunities", response_model=list[OpportunityResponse])
def get_opportunities(
        user_number: str,
        db: Session = Depends(get_db)
):
    """Get all opportunities for a user"""
    opportunities = db.query(JourneyOpportunity).filter(
        JourneyOpportunity.user_number == user_number
    ).order_by(JourneyOpportunity.first_seen_at.desc()).all()

    return opportunities


# ========================================
# GOALS
# ========================================
@router.get("/goals", response_model=list[GoalResponse])
def get_goals(
        user_number: str,
        db: Session = Depends(get_db)
):
    """Get all goals for a user"""
    goals = db.query(JourneyGoal).filter(
        JourneyGoal.user_number == user_number
    ).order_by(JourneyGoal.first_seen_at.desc()).all()

    return goals