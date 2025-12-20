from fastapi import APIRouter, Depends, HTTPException
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


# Pydantic request models for Goals
class GoalCreate(BaseModel):
    title: Optional[str] = None
    goal_text: str
    why: Optional[str] = None
    time_horizon: Optional[str] = "medium"


class GoalUpdate(BaseModel):
    title: Optional[str] = None
    goal_text: Optional[str] = None
    why: Optional[str] = None
    time_horizon: Optional[str] = None


# Pydantic request models for People
class PersonCreate(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    relation: Optional[str] = None
    context: Optional[str] = None


class PersonUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    relation: Optional[str] = None
    context: Optional[str] = None


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
    title: Optional[str]
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
# PEOPLE - FULL CRUD
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


@router.post("/people", response_model=PersonResponse)
def create_person(
        person_data: PersonCreate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Create a new person"""
    new_person = JourneyPerson(
        user_number=user_number,
        name=person_data.name,
        email=person_data.email,
        phone=person_data.phone,
        relation=person_data.relation,
        context=person_data.context,
        first_seen_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(new_person)
    db.commit()
    db.refresh(new_person)
    return new_person


@router.put("/people/{person_id}", response_model=PersonResponse)
def update_person(
        person_id: int,
        person_data: PersonUpdate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Update a person"""
    person = db.query(JourneyPerson).filter(
        JourneyPerson.id == person_id,
        JourneyPerson.user_number == user_number
    ).first()

    if not person:
        raise HTTPException(status_code=404, detail="Person not found")

    if person_data.name is not None:
        person.name = person_data.name
    if person_data.email is not None:
        person.email = person_data.email
    if person_data.phone is not None:
        person.phone = person_data.phone
    if person_data.relation is not None:
        person.relation = person_data.relation
    if person_data.context is not None:
        person.context = person_data.context

    person.updated_at = datetime.now()
    db.commit()
    db.refresh(person)
    return person


@router.delete("/people/{person_id}")
def delete_person(
        person_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Delete a person"""
    person = db.query(JourneyPerson).filter(
        JourneyPerson.id == person_id,
        JourneyPerson.user_number == user_number
    ).first()

    if not person:
        raise HTTPException(status_code=404, detail="Person not found")

    db.delete(person)
    db.commit()
    return {"success": True, "message": "Person deleted"}


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
# GOALS - FULL CRUD
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


@router.post("/goals", response_model=GoalResponse)
def create_goal(
        goal_data: GoalCreate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Create a new goal"""
    new_goal = JourneyGoal(
        user_number=user_number,
        title=goal_data.title,
        goal_text=goal_data.goal_text,
        why=goal_data.why,
        time_horizon=goal_data.time_horizon,
        first_seen_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(new_goal)
    db.commit()
    db.refresh(new_goal)
    return new_goal


@router.put("/goals/{goal_id}", response_model=GoalResponse)
def update_goal(
        goal_id: int,
        goal_data: GoalUpdate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Update a goal"""
    goal = db.query(JourneyGoal).filter(
        JourneyGoal.id == goal_id,
        JourneyGoal.user_number == user_number
    ).first()

    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    if goal_data.title is not None:
        goal.title = goal_data.title
    if goal_data.goal_text is not None:
        goal.goal_text = goal_data.goal_text
    if goal_data.why is not None:
        goal.why = goal_data.why
    if goal_data.time_horizon is not None:
        goal.time_horizon = goal_data.time_horizon

    goal.updated_at = datetime.now()
    db.commit()
    db.refresh(goal)
    return goal


@router.delete("/goals/{goal_id}")
def delete_goal(
        goal_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Delete a goal"""
    goal = db.query(JourneyGoal).filter(
        JourneyGoal.id == goal_id,
        JourneyGoal.user_number == user_number
    ).first()

    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    db.delete(goal)
    db.commit()
    return {"success": True, "message": "Goal deleted"}