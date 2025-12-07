# app/services/journey_service.py

from sqlalchemy.orm import Session
from datetime import datetime

from app.models import (
    JourneyProfile,
    JourneyStrength,
    JourneyPerson,
    JourneyProject,
    JourneyFailure,
    JourneyGoal,
    JourneyOpportunity
)

# -----------------------------------------
# PROFILE
# -----------------------------------------

def get_or_create_profile(db: Session, user_number: str):
    profile = db.query(JourneyProfile).filter_by(user_number=user_number).first()
    if not profile:
        profile = JourneyProfile(
            user_number=user_number,
            role=None,
            long_term_identity=None,
            created_at=datetime.utcnow()
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


def update_profile_role(db: Session, user_number: str, role: str):
    profile = get_or_create_profile(db, user_number)
    profile.role = role
    db.commit()
    return profile


def update_profile_identity(db: Session, user_number: str, identity: str):
    profile = get_or_create_profile(db, user_number)
    profile.long_term_identity = identity
    db.commit()
    return profile


# -----------------------------------------
# STRENGTHS
# -----------------------------------------

def add_strength(db: Session, user_number: str, strength: str, example: str = None):
    entry = JourneyStrength(
        user_number=user_number,
        strength=strength,
        example=example,
        created_at=datetime.utcnow()
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def list_strengths(db: Session, user_number: str):
    return db.query(JourneyStrength).filter_by(user_number=user_number).all()


# -----------------------------------------
# PEOPLE
# -----------------------------------------

def add_person(db: Session, user_number: str, name: str, email: str = None,
               phone: str = None, relationship: str = None, notes: str = None):
    entry = JourneyPerson(
        user_number=user_number,
        name=name,
        email=email,
        phone=phone,
        relationship=relationship,
        notes=notes,
        created_at=datetime.utcnow()
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def list_people(db: Session, user_number: str):
    return db.query(JourneyPerson).filter_by(user_number=user_number).all()


# -----------------------------------------
# PROJECTS
# -----------------------------------------

def add_project(db: Session, user_number: str, name: str, goal: str = None,
                deadline: datetime = None, status: str = "active", notes: str = None):
    entry = JourneyProject(
        user_number=user_number,
        name=name,
        goal=goal,
        deadline=deadline,
        status=status,
        notes=notes,
        created_at=datetime.utcnow()
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def list_projects(db: Session, user_number: str):
    return db.query(JourneyProject).filter_by(user_number=user_number).all()


# -----------------------------------------
# FAILURES
# -----------------------------------------

def add_failure(db: Session, user_number: str, event: str, learning: str,
                scar: str, date: datetime = None):
    entry = JourneyFailure(
        user_number=user_number,
        event=event,
        learning=learning,
        scar=scar,
        date=date or datetime.utcnow(),
        created_at=datetime.utcnow()
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def list_failures(db: Session, user_number: str):
    return db.query(JourneyFailure).filter_by(user_number=user_number).all()


# -----------------------------------------
# GOALS
# -----------------------------------------

def add_goal(db: Session, user_number: str, goal: str, why: str = None,
             deadline: datetime = None, progress: int = 0):
    entry = JourneyGoal(
        user_number=user_number,
        goal=goal,
        why=why,
        deadline=deadline,
        progress=progress,
        created_at=datetime.utcnow()
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def list_goals(db: Session, user_number: str):
    return db.query(JourneyGoal).filter_by(user_number=user_number).all()


# -----------------------------------------
# DEVELOPMENT AREAS (Opportunities)
# -----------------------------------------

def add_development_area(db: Session, user_number: str, skill: str,
                         reason: str = None, plan: str = None):
    entry = JourneyOpportunity(
        user_number=user_number,
        skill=skill,
        reason=reason,
        plan=plan,
        created_at=datetime.utcnow()
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def list_development_areas(db: Session, user_number: str):
    return db.query(JourneyOpportunity).filter_by(user_number=user_number).all()
