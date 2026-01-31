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
    JourneyOpportunity,
    JourneyValue,
    JourneyAchievement,
    JourneyEnergySource,
    JourneyEnergyDrain,
    JourneyRecoveryMethod,
    JourneyProcrastinationPattern,
    JourneyExecutionSystem,
    JourneyInspiration,
    JourneyCoachingMoment,
    JourneyTeamComposition
)
from pydantic import BaseModel
from datetime import datetime
from typing import Optional
from app.services.people_review_service import PeopleReviewService


# Pydantic request models for Goals
class GoalCreate(BaseModel):
    title: Optional[str] = None
    goal_text: str
    why: Optional[str] = None
    time_horizon: Optional[str] = "medium"
    parent_goal_id: Optional[int] = None
    sort_order: Optional[int] = 0


class GoalUpdate(BaseModel):
    title: Optional[str] = None
    goal_text: Optional[str] = None
    why: Optional[str] = None
    time_horizon: Optional[str] = None
    parent_goal_id: Optional[int] = None
    sort_order: Optional[int] = None


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
    title: Optional[str]
    strength: str
    source: Optional[str]
    first_seen_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DevelopmentAreaResponse(BaseModel):
    id: int
    user_number: str
    title: Optional[str]
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
    title: Optional[str]
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
    parent_goal_id: Optional[int]
    sort_order: Optional[int]
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


class StrengthCreate(BaseModel):
    title: Optional[str] = None
    strength: str
    source: Optional[str] = None


@router.post("/strengths", response_model=StrengthResponse)
def create_strength(
        strength_data: StrengthCreate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Create a new strength"""
    new_strength = JourneyStrength(
        user_number=user_number,
        title=strength_data.title,
        strength=strength_data.strength,
        source=strength_data.source,
        first_seen_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(new_strength)
    db.commit()
    db.refresh(new_strength)
    return new_strength


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


class DevelopmentAreaCreate(BaseModel):
    title: Optional[str] = None
    skill: str
    source: Optional[str] = None


@router.post("/development-areas", response_model=DevelopmentAreaResponse)
def create_development_area(
        area_data: DevelopmentAreaCreate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Create a new development area"""
    new_area = JourneyDevelopmentArea(
        user_number=user_number,
        title=area_data.title,
        skill=area_data.skill,
        source=area_data.source
    )
    db.add(new_area)
    db.commit()
    db.refresh(new_area)
    return new_area


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


class ProjectCreate(BaseModel):
    project_name: str
    goal: Optional[str] = None
    description: Optional[str] = None
    status: str = "active"


@router.post("/projects", response_model=ProjectResponse)
def create_project(
        project_data: ProjectCreate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Create a new project"""
    new_project = JourneyProject(
        user_number=user_number,
        project_name=project_data.project_name,
        goal=project_data.goal,
        description=project_data.description,
        status=project_data.status,
        first_seen_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(new_project)
    db.commit()
    db.refresh(new_project)
    return new_project


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


class FailureCreate(BaseModel):
    title: Optional[str] = None
    failure_text: str
    learning: Optional[str] = None
    scar: Optional[str] = None


@router.post("/failures", response_model=FailureResponse)
def create_failure(
        failure_data: FailureCreate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Create a new failure/learning"""
    new_failure = JourneyFailure(
        user_number=user_number,
        title=failure_data.title,
        failure_text=failure_data.failure_text,
        learning=failure_data.learning,
        scar=failure_data.scar,
        first_seen_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(new_failure)
    db.commit()
    db.refresh(new_failure)
    return new_failure


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


class OpportunityCreate(BaseModel):
    opportunity_text: str
    category: Optional[str] = None


@router.post("/opportunities", response_model=OpportunityResponse)
def create_opportunity(
        opportunity_data: OpportunityCreate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Create a new opportunity"""
    new_opportunity = JourneyOpportunity(
        user_number=user_number,
        opportunity_text=opportunity_data.opportunity_text,
        category=opportunity_data.category,
        first_seen_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(new_opportunity)
    db.commit()
    db.refresh(new_opportunity)
    return new_opportunity


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
    ).order_by(JourneyGoal.sort_order, JourneyGoal.first_seen_at.desc()).all()

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
        parent_goal_id=goal_data.parent_goal_id,
        sort_order=goal_data.sort_order if goal_data.sort_order is not None else 0,
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
    if goal_data.parent_goal_id is not None:
        goal.parent_goal_id = goal_data.parent_goal_id
    if goal_data.sort_order is not None:
        goal.sort_order = goal_data.sort_order

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


# ========================================
# STRENGTHS - UPDATE & DELETE
# ========================================
class StrengthUpdate(BaseModel):
    title: Optional[str] = None
    strength: Optional[str] = None
    source: Optional[str] = None


@router.put("/strengths/{strength_id}", response_model=StrengthResponse)
def update_strength(
        strength_id: int,
        updates: StrengthUpdate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Update a strength"""
    strength = db.query(JourneyStrength).filter(
        JourneyStrength.id == strength_id,
        JourneyStrength.user_number == user_number
    ).first()

    if not strength:
        raise HTTPException(status_code=404, detail="Strength not found")

    if updates.title is not None:
        strength.title = updates.title
    if updates.strength is not None:
        strength.strength = updates.strength
    if updates.source is not None:
        strength.source = updates.source

    strength.updated_at = datetime.now()
    db.commit()
    db.refresh(strength)
    return strength


@router.delete("/strengths/{strength_id}")
def delete_strength(
        strength_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Delete a strength"""
    strength = db.query(JourneyStrength).filter(
        JourneyStrength.id == strength_id,
        JourneyStrength.user_number == user_number
    ).first()

    if not strength:
        raise HTTPException(status_code=404, detail="Strength not found")

    db.delete(strength)
    db.commit()
    return {"success": True, "message": "Strength deleted"}


# ========================================
# DEVELOPMENT AREAS - UPDATE & DELETE
# ========================================
class DevelopmentAreaUpdate(BaseModel):
    title: Optional[str] = None
    skill: Optional[str] = None
    source: Optional[str] = None


@router.put("/development-areas/{area_id}", response_model=DevelopmentAreaResponse)
def update_development_area(
        area_id: int,
        updates: DevelopmentAreaUpdate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Update a development area"""
    area = db.query(JourneyDevelopmentArea).filter(
        JourneyDevelopmentArea.id == area_id,
        JourneyDevelopmentArea.user_number == user_number
    ).first()

    if not area:
        raise HTTPException(status_code=404, detail="Development area not found")

    if updates.title is not None:
        area.title = updates.title
    if updates.skill is not None:
        area.skill = updates.skill
    if updates.source is not None:
        area.source = updates.source

    # Only set updated_at if the column exists
    try:
        area.updated_at = datetime.now()
    except:
        pass

    db.commit()
    db.refresh(area)
    return area


@router.delete("/development-areas/{area_id}")
def delete_development_area(
        area_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Delete a development area"""
    area = db.query(JourneyDevelopmentArea).filter(
        JourneyDevelopmentArea.id == area_id,
        JourneyDevelopmentArea.user_number == user_number
    ).first()

    if not area:
        raise HTTPException(status_code=404, detail="Development area not found")

    db.delete(area)
    db.commit()
    return {"success": True, "message": "Development area deleted"}


# ========================================
# PROJECTS - UPDATE & DELETE
# ========================================
class ProjectUpdate(BaseModel):
    project_name: Optional[str] = None
    goal: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None


@router.put("/projects/{project_id}", response_model=ProjectResponse)
def update_project(
        project_id: int,
        updates: ProjectUpdate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Update a project"""
    project = db.query(JourneyProject).filter(
        JourneyProject.id == project_id,
        JourneyProject.user_number == user_number
    ).first()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if updates.project_name is not None:
        project.project_name = updates.project_name
    if updates.goal is not None:
        project.goal = updates.goal
    if updates.description is not None:
        project.description = updates.description
    if updates.status is not None:
        project.status = updates.status

    project.updated_at = datetime.now()
    db.commit()
    db.refresh(project)
    return project


@router.delete("/projects/{project_id}")
def delete_project(
        project_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Delete a project"""
    project = db.query(JourneyProject).filter(
        JourneyProject.id == project_id,
        JourneyProject.user_number == user_number
    ).first()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    db.delete(project)
    db.commit()
    return {"success": True, "message": "Project deleted"}


# ========================================
# FAILURES - UPDATE & DELETE
# ========================================
class FailureUpdate(BaseModel):
    title: Optional[str] = None
    failure_text: Optional[str] = None
    learning: Optional[str] = None
    scar: Optional[str] = None


@router.put("/failures/{failure_id}", response_model=FailureResponse)
def update_failure(
        failure_id: int,
        updates: FailureUpdate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Update a failure"""
    failure = db.query(JourneyFailure).filter(
        JourneyFailure.id == failure_id,
        JourneyFailure.user_number == user_number
    ).first()

    if not failure:
        raise HTTPException(status_code=404, detail="Failure not found")

    if updates.title is not None:
        failure.title = updates.title
    if updates.failure_text is not None:
        failure.failure_text = updates.failure_text
    if updates.learning is not None:
        failure.learning = updates.learning
    if updates.scar is not None:
        failure.scar = updates.scar

    failure.updated_at = datetime.now()
    db.commit()
    db.refresh(failure)
    return failure


@router.delete("/failures/{failure_id}")
def delete_failure(
        failure_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Delete a failure"""
    failure = db.query(JourneyFailure).filter(
        JourneyFailure.id == failure_id,
        JourneyFailure.user_number == user_number
    ).first()

    if not failure:
        raise HTTPException(status_code=404, detail="Failure not found")

    db.delete(failure)
    db.commit()
    return {"success": True, "message": "Failure deleted"}


# ========================================
# OPPORTUNITIES - UPDATE & DELETE
# ========================================
class OpportunityUpdate(BaseModel):
    opportunity_text: Optional[str] = None
    category: Optional[str] = None


@router.put("/opportunities/{opportunity_id}", response_model=OpportunityResponse)
def update_opportunity(
        opportunity_id: int,
        updates: OpportunityUpdate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Update an opportunity"""
    opportunity = db.query(JourneyOpportunity).filter(
        JourneyOpportunity.id == opportunity_id,
        JourneyOpportunity.user_number == user_number
    ).first()

    if not opportunity:
        raise HTTPException(status_code=404, detail="Opportunity not found")

    if updates.opportunity_text is not None:
        opportunity.opportunity_text = updates.opportunity_text
    if updates.category is not None:
        opportunity.category = updates.category

    opportunity.updated_at = datetime.now()
    db.commit()
    db.refresh(opportunity)
    return opportunity


@router.delete("/opportunities/{opportunity_id}")
def delete_opportunity(
        opportunity_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Delete an opportunity"""
    opportunity = db.query(JourneyOpportunity).filter(
        JourneyOpportunity.id == opportunity_id,
        JourneyOpportunity.user_number == user_number
    ).first()

    if not opportunity:
        raise HTTPException(status_code=404, detail="Opportunity not found")

    db.delete(opportunity)
    db.commit()
    return {"success": True, "message": "Opportunity deleted"}


# ============================================
# VALUES - FULL CRUD
# ============================================

class ValueCreate(BaseModel):
    title: str
    value_text: str
    why: Optional[str] = None


class ValueUpdate(BaseModel):
    title: Optional[str] = None
    value_text: Optional[str] = None
    why: Optional[str] = None


class ValueResponse(BaseModel):
    id: int
    user_number: str
    title: str
    value_text: str
    why: Optional[str]
    first_seen_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.get("/values", response_model=list[ValueResponse])
def get_values(
        user_number: str,
        db: Session = Depends(get_db)
):
    """Get all values for a user"""
    values = db.query(JourneyValue).filter(
        JourneyValue.user_number == user_number
    ).order_by(JourneyValue.first_seen_at.desc()).all()
    return values


@router.post("/values", response_model=ValueResponse)
def create_value(
        value_data: ValueCreate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Create a new value"""
    new_value = JourneyValue(
        user_number=user_number,
        title=value_data.title,
        value_text=value_data.value_text,
        why=value_data.why,
        first_seen_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(new_value)
    db.commit()
    db.refresh(new_value)
    return new_value


@router.put("/values/{value_id}", response_model=ValueResponse)
def update_value(
        value_id: int,
        value_data: ValueUpdate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Update a value"""
    value = db.query(JourneyValue).filter(
        JourneyValue.id == value_id,
        JourneyValue.user_number == user_number
    ).first()

    if not value:
        raise HTTPException(status_code=404, detail="Value not found")

    if value_data.title is not None:
        value.title = value_data.title
    if value_data.value_text is not None:
        value.value_text = value_data.value_text
    if value_data.why is not None:
        value.why = value_data.why

    value.updated_at = datetime.now()
    db.commit()
    db.refresh(value)
    return value


@router.delete("/values/{value_id}")
def delete_value(
        value_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Delete a value"""
    value = db.query(JourneyValue).filter(
        JourneyValue.id == value_id,
        JourneyValue.user_number == user_number
    ).first()

    if not value:
        raise HTTPException(status_code=404, detail="Value not found")

    db.delete(value)
    db.commit()
    return {"success": True, "message": "Value deleted"}


# ============================================
# ACHIEVEMENTS - FULL CRUD
# ============================================

class AchievementCreate(BaseModel):
    title: str
    achievement_text: str
    impact: Optional[str] = None


class AchievementUpdate(BaseModel):
    title: Optional[str] = None
    achievement_text: Optional[str] = None
    impact: Optional[str] = None


class AchievementResponse(BaseModel):
    id: int
    user_number: str
    title: str
    achievement_text: str
    impact: Optional[str]
    first_seen_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.get("/achievements", response_model=list[AchievementResponse])
def get_achievements(
        user_number: str,
        db: Session = Depends(get_db)
):
    """Get all achievements for a user"""
    achievements = db.query(JourneyAchievement).filter(
        JourneyAchievement.user_number == user_number
    ).order_by(JourneyAchievement.first_seen_at.desc()).all()
    return achievements


@router.post("/achievements", response_model=AchievementResponse)
def create_achievement(
        achievement_data: AchievementCreate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Create a new achievement"""
    new_achievement = JourneyAchievement(
        user_number=user_number,
        title=achievement_data.title,
        achievement_text=achievement_data.achievement_text,
        impact=achievement_data.impact,
        first_seen_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(new_achievement)
    db.commit()
    db.refresh(new_achievement)
    return new_achievement


@router.put("/achievements/{achievement_id}", response_model=AchievementResponse)
def update_achievement(
        achievement_id: int,
        achievement_data: AchievementUpdate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Update an achievement"""
    achievement = db.query(JourneyAchievement).filter(
        JourneyAchievement.id == achievement_id,
        JourneyAchievement.user_number == user_number
    ).first()

    if not achievement:
        raise HTTPException(status_code=404, detail="Achievement not found")

    if achievement_data.title is not None:
        achievement.title = achievement_data.title
    if achievement_data.achievement_text is not None:
        achievement.achievement_text = achievement_data.achievement_text
    if achievement_data.impact is not None:
        achievement.impact = achievement_data.impact

    achievement.updated_at = datetime.now()
    db.commit()
    db.refresh(achievement)
    return achievement


@router.delete("/achievements/{achievement_id}")
def delete_achievement(
        achievement_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Delete an achievement"""
    achievement = db.query(JourneyAchievement).filter(
        JourneyAchievement.id == achievement_id,
        JourneyAchievement.user_number == user_number
    ).first()

    if not achievement:
        raise HTTPException(status_code=404, detail="Achievement not found")

    db.delete(achievement)
    db.commit()
    return {"success": True, "message": "Achievement deleted"}


# ============================================
# ENERGY SOURCES - FULL CRUD
# ============================================

class EnergySourceCreate(BaseModel):
    title: Optional[str] = None
    source_text: str
    category: Optional[str] = None


class EnergySourceUpdate(BaseModel):
    title: Optional[str] = None
    source_text: Optional[str] = None
    category: Optional[str] = None


class EnergySourceResponse(BaseModel):
    id: int
    user_number: str
    title: Optional[str]
    source_text: str
    category: Optional[str]
    first_seen_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.get("/energy-sources", response_model=list[EnergySourceResponse])
def get_energy_sources(
        user_number: str,
        db: Session = Depends(get_db)
):
    """Get all energy sources for a user"""
    sources = db.query(JourneyEnergySource).filter(
        JourneyEnergySource.user_number == user_number
    ).order_by(JourneyEnergySource.first_seen_at.desc()).all()
    return sources


@router.post("/energy-sources", response_model=EnergySourceResponse)
def create_energy_source(
        source_data: EnergySourceCreate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Create a new energy source"""
    new_source = JourneyEnergySource(
        user_number=user_number,
        title=source_data.title,
        source_text=source_data.source_text,
        category=source_data.category,
        first_seen_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(new_source)
    db.commit()
    db.refresh(new_source)
    return new_source


@router.put("/energy-sources/{source_id}", response_model=EnergySourceResponse)
def update_energy_source(
        source_id: int,
        source_data: EnergySourceUpdate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Update an energy source"""
    source = db.query(JourneyEnergySource).filter(
        JourneyEnergySource.id == source_id,
        JourneyEnergySource.user_number == user_number
    ).first()

    if not source:
        raise HTTPException(status_code=404, detail="Energy source not found")

    if source_data.title is not None:
        source.title = source_data.title
    if source_data.source_text is not None:
        source.source_text = source_data.source_text
    if source_data.category is not None:
        source.category = source_data.category

    source.updated_at = datetime.now()
    db.commit()
    db.refresh(source)
    return source


@router.delete("/energy-sources/{source_id}")
def delete_energy_source(
        source_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Delete an energy source"""
    source = db.query(JourneyEnergySource).filter(
        JourneyEnergySource.id == source_id,
        JourneyEnergySource.user_number == user_number
    ).first()

    if not source:
        raise HTTPException(status_code=404, detail="Energy source not found")

    db.delete(source)
    db.commit()
    return {"success": True, "message": "Energy source deleted"}


# ============================================
# ENERGY DRAINS - FULL CRUD
# ============================================

class EnergyDrainCreate(BaseModel):
    title: Optional[str] = None
    drain_text: str
    category: Optional[str] = None
    mitigation: Optional[str] = None


class EnergyDrainUpdate(BaseModel):
    title: Optional[str] = None
    drain_text: Optional[str] = None
    category: Optional[str] = None
    mitigation: Optional[str] = None


class EnergyDrainResponse(BaseModel):
    id: int
    user_number: str
    title: Optional[str]
    drain_text: str
    category: Optional[str]
    mitigation: Optional[str]
    first_seen_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.get("/energy-drains", response_model=list[EnergyDrainResponse])
def get_energy_drains(
        user_number: str,
        db: Session = Depends(get_db)
):
    """Get all energy drains for a user"""
    drains = db.query(JourneyEnergyDrain).filter(
        JourneyEnergyDrain.user_number == user_number
    ).order_by(JourneyEnergyDrain.first_seen_at.desc()).all()
    return drains


@router.post("/energy-drains", response_model=EnergyDrainResponse)
def create_energy_drain(
        drain_data: EnergyDrainCreate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Create a new energy drain"""
    new_drain = JourneyEnergyDrain(
        user_number=user_number,
        title=drain_data.title,
        drain_text=drain_data.drain_text,
        category=drain_data.category,
        mitigation=drain_data.mitigation,
        first_seen_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(new_drain)
    db.commit()
    db.refresh(new_drain)
    return new_drain


@router.put("/energy-drains/{drain_id}", response_model=EnergyDrainResponse)
def update_energy_drain(
        drain_id: int,
        drain_data: EnergyDrainUpdate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Update an energy drain"""
    drain = db.query(JourneyEnergyDrain).filter(
        JourneyEnergyDrain.id == drain_id,
        JourneyEnergyDrain.user_number == user_number
    ).first()

    if not drain:
        raise HTTPException(status_code=404, detail="Energy drain not found")

    if drain_data.title is not None:
        drain.title = drain_data.title
    if drain_data.drain_text is not None:
        drain.drain_text = drain_data.drain_text
    if drain_data.category is not None:
        drain.category = drain_data.category
    if drain_data.mitigation is not None:
        drain.mitigation = drain_data.mitigation

    drain.updated_at = datetime.now()
    db.commit()
    db.refresh(drain)
    return drain


@router.delete("/energy-drains/{drain_id}")
def delete_energy_drain(
        drain_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Delete an energy drain"""
    drain = db.query(JourneyEnergyDrain).filter(
        JourneyEnergyDrain.id == drain_id,
        JourneyEnergyDrain.user_number == user_number
    ).first()

    if not drain:
        raise HTTPException(status_code=404, detail="Energy drain not found")

    db.delete(drain)
    db.commit()
    return {"success": True, "message": "Energy drain deleted"}


# ============================================
# RECOVERY METHODS - FULL CRUD
# ============================================

class RecoveryMethodCreate(BaseModel):
    title: Optional[str] = None
    method_text: str
    category: Optional[str] = None
    frequency: Optional[str] = None


class RecoveryMethodUpdate(BaseModel):
    title: Optional[str] = None
    method_text: Optional[str] = None
    category: Optional[str] = None
    frequency: Optional[str] = None


class RecoveryMethodResponse(BaseModel):
    id: int
    user_number: str
    title: Optional[str]
    method_text: str
    category: Optional[str]
    frequency: Optional[str]
    first_seen_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.get("/recovery-methods", response_model=list[RecoveryMethodResponse])
def get_recovery_methods(
        user_number: str,
        db: Session = Depends(get_db)
):
    """Get all recovery methods for a user"""
    methods = db.query(JourneyRecoveryMethod).filter(
        JourneyRecoveryMethod.user_number == user_number
    ).order_by(JourneyRecoveryMethod.first_seen_at.desc()).all()
    return methods


@router.post("/recovery-methods", response_model=RecoveryMethodResponse)
def create_recovery_method(
        method_data: RecoveryMethodCreate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Create a new recovery method"""
    new_method = JourneyRecoveryMethod(
        user_number=user_number,
        title=method_data.title,
        method_text=method_data.method_text,
        category=method_data.category,
        frequency=method_data.frequency,
        first_seen_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(new_method)
    db.commit()
    db.refresh(new_method)
    return new_method


@router.put("/recovery-methods/{method_id}", response_model=RecoveryMethodResponse)
def update_recovery_method(
        method_id: int,
        method_data: RecoveryMethodUpdate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Update a recovery method"""
    method = db.query(JourneyRecoveryMethod).filter(
        JourneyRecoveryMethod.id == method_id,
        JourneyRecoveryMethod.user_number == user_number
    ).first()

    if not method:
        raise HTTPException(status_code=404, detail="Recovery method not found")

    if method_data.title is not None:
        method.title = method_data.title
    if method_data.method_text is not None:
        method.method_text = method_data.method_text
    if method_data.category is not None:
        method.category = method_data.category
    if method_data.frequency is not None:
        method.frequency = method_data.frequency

    method.updated_at = datetime.now()
    db.commit()
    db.refresh(method)
    return method


@router.delete("/recovery-methods/{method_id}")
def delete_recovery_method(
        method_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Delete a recovery method"""
    method = db.query(JourneyRecoveryMethod).filter(
        JourneyRecoveryMethod.id == method_id,
        JourneyRecoveryMethod.user_number == user_number
    ).first()

    if not method:
        raise HTTPException(status_code=404, detail="Recovery method not found")

    db.delete(method)
    db.commit()
    return {"success": True, "message": "Recovery method deleted"}


# ============================================
# PROCRASTINATION PATTERNS - FULL CRUD
# ============================================

class ProcrastinationPatternCreate(BaseModel):
    title: Optional[str] = None
    pattern_text: str
    underlying_reason: Optional[str] = None
    strategy: Optional[str] = None


class ProcrastinationPatternUpdate(BaseModel):
    title: Optional[str] = None
    pattern_text: Optional[str] = None
    underlying_reason: Optional[str] = None
    strategy: Optional[str] = None


class ProcrastinationPatternResponse(BaseModel):
    id: int
    user_number: str
    title: Optional[str]
    pattern_text: str
    underlying_reason: Optional[str]
    strategy: Optional[str]
    first_seen_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.get("/procrastination-patterns", response_model=list[ProcrastinationPatternResponse])
def get_procrastination_patterns(
        user_number: str,
        db: Session = Depends(get_db)
):
    """Get all procrastination patterns for a user"""
    patterns = db.query(JourneyProcrastinationPattern).filter(
        JourneyProcrastinationPattern.user_number == user_number
    ).order_by(JourneyProcrastinationPattern.first_seen_at.desc()).all()
    return patterns


@router.post("/procrastination-patterns", response_model=ProcrastinationPatternResponse)
def create_procrastination_pattern(
        pattern_data: ProcrastinationPatternCreate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Create a new procrastination pattern"""
    new_pattern = JourneyProcrastinationPattern(
        user_number=user_number,
        title=pattern_data.title,
        pattern_text=pattern_data.pattern_text,
        underlying_reason=pattern_data.underlying_reason,
        strategy=pattern_data.strategy,
        first_seen_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(new_pattern)
    db.commit()
    db.refresh(new_pattern)
    return new_pattern


@router.put("/procrastination-patterns/{pattern_id}", response_model=ProcrastinationPatternResponse)
def update_procrastination_pattern(
        pattern_id: int,
        pattern_data: ProcrastinationPatternUpdate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Update a procrastination pattern"""
    pattern = db.query(JourneyProcrastinationPattern).filter(
        JourneyProcrastinationPattern.id == pattern_id,
        JourneyProcrastinationPattern.user_number == user_number
    ).first()

    if not pattern:
        raise HTTPException(status_code=404, detail="Procrastination pattern not found")

    if pattern_data.title is not None:
        pattern.title = pattern_data.title
    if pattern_data.pattern_text is not None:
        pattern.pattern_text = pattern_data.pattern_text
    if pattern_data.underlying_reason is not None:
        pattern.underlying_reason = pattern_data.underlying_reason
    if pattern_data.strategy is not None:
        pattern.strategy = pattern_data.strategy

    pattern.updated_at = datetime.now()
    db.commit()
    db.refresh(pattern)
    return pattern


@router.delete("/procrastination-patterns/{pattern_id}")
def delete_procrastination_pattern(
        pattern_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Delete a procrastination pattern"""
    pattern = db.query(JourneyProcrastinationPattern).filter(
        JourneyProcrastinationPattern.id == pattern_id,
        JourneyProcrastinationPattern.user_number == user_number
    ).first()

    if not pattern:
        raise HTTPException(status_code=404, detail="Procrastination pattern not found")

    db.delete(pattern)
    db.commit()
    return {"success": True, "message": "Procrastination pattern deleted"}


# ============================================
# EXECUTION SYSTEMS - FULL CRUD
# ============================================

class ExecutionSystemCreate(BaseModel):
    title: Optional[str] = None
    system_text: str
    category: Optional[str] = None
    effectiveness: Optional[str] = None


class ExecutionSystemUpdate(BaseModel):
    title: Optional[str] = None
    system_text: Optional[str] = None
    category: Optional[str] = None
    effectiveness: Optional[str] = None


class ExecutionSystemResponse(BaseModel):
    id: int
    user_number: str
    title: Optional[str]
    system_text: str
    category: Optional[str]
    effectiveness: Optional[str]
    first_seen_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.get("/execution-systems", response_model=list[ExecutionSystemResponse])
def get_execution_systems(
        user_number: str,
        db: Session = Depends(get_db)
):
    """Get all execution systems for a user"""
    systems = db.query(JourneyExecutionSystem).filter(
        JourneyExecutionSystem.user_number == user_number
    ).order_by(JourneyExecutionSystem.first_seen_at.desc()).all()
    return systems


@router.post("/execution-systems", response_model=ExecutionSystemResponse)
def create_execution_system(
        system_data: ExecutionSystemCreate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Create a new execution system"""
    new_system = JourneyExecutionSystem(
        user_number=user_number,
        title=system_data.title,
        system_text=system_data.system_text,
        category=system_data.category,
        effectiveness=system_data.effectiveness,
        first_seen_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(new_system)
    db.commit()
    db.refresh(new_system)
    return new_system


@router.put("/execution-systems/{system_id}", response_model=ExecutionSystemResponse)
def update_execution_system(
        system_id: int,
        system_data: ExecutionSystemUpdate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Update an execution system"""
    system = db.query(JourneyExecutionSystem).filter(
        JourneyExecutionSystem.id == system_id,
        JourneyExecutionSystem.user_number == user_number
    ).first()

    if not system:
        raise HTTPException(status_code=404, detail="Execution system not found")

    if system_data.title is not None:
        system.title = system_data.title
    if system_data.system_text is not None:
        system.system_text = system_data.system_text
    if system_data.category is not None:
        system.category = system_data.category
    if system_data.effectiveness is not None:
        system.effectiveness = system_data.effectiveness

    system.updated_at = datetime.now()
    db.commit()
    db.refresh(system)
    return system


@router.delete("/execution-systems/{system_id}")
def delete_execution_system(
        system_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Delete an execution system"""
    system = db.query(JourneyExecutionSystem).filter(
        JourneyExecutionSystem.id == system_id,
        JourneyExecutionSystem.user_number == user_number
    ).first()

    if not system:
        raise HTTPException(status_code=404, detail="Execution system not found")

    db.delete(system)
    db.commit()
    return {"success": True, "message": "Execution system deleted"}


# ============================================
# INSPIRATION - FULL CRUD
# ============================================

class InspirationCreate(BaseModel):
    title: Optional[str] = None
    inspiration_text: str
    approach: Optional[str] = None
    effectiveness: Optional[str] = None


class InspirationUpdate(BaseModel):
    title: Optional[str] = None
    inspiration_text: Optional[str] = None
    approach: Optional[str] = None
    effectiveness: Optional[str] = None


class InspirationResponse(BaseModel):
    id: int
    user_number: str
    title: Optional[str]
    inspiration_text: str
    approach: Optional[str]
    effectiveness: Optional[str]
    first_seen_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.get("/inspiration", response_model=list[InspirationResponse])
def get_inspiration(
        user_number: str,
        db: Session = Depends(get_db)
):
    """Get all inspiration entries for a user"""
    inspiration = db.query(JourneyInspiration).filter(
        JourneyInspiration.user_number == user_number
    ).order_by(JourneyInspiration.first_seen_at.desc()).all()
    return inspiration


@router.post("/inspiration", response_model=InspirationResponse)
def create_inspiration(
        inspiration_data: InspirationCreate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Create a new inspiration entry"""
    new_inspiration = JourneyInspiration(
        user_number=user_number,
        title=inspiration_data.title,
        inspiration_text=inspiration_data.inspiration_text,
        approach=inspiration_data.approach,
        effectiveness=inspiration_data.effectiveness,
        first_seen_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(new_inspiration)
    db.commit()
    db.refresh(new_inspiration)
    return new_inspiration


@router.put("/inspiration/{inspiration_id}", response_model=InspirationResponse)
def update_inspiration(
        inspiration_id: int,
        inspiration_data: InspirationUpdate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Update an inspiration entry"""
    inspiration = db.query(JourneyInspiration).filter(
        JourneyInspiration.id == inspiration_id,
        JourneyInspiration.user_number == user_number
    ).first()

    if not inspiration:
        raise HTTPException(status_code=404, detail="Inspiration not found")

    if inspiration_data.title is not None:
        inspiration.title = inspiration_data.title
    if inspiration_data.inspiration_text is not None:
        inspiration.inspiration_text = inspiration_data.inspiration_text
    if inspiration_data.approach is not None:
        inspiration.approach = inspiration_data.approach
    if inspiration_data.effectiveness is not None:
        inspiration.effectiveness = inspiration_data.effectiveness

    inspiration.updated_at = datetime.now()
    db.commit()
    db.refresh(inspiration)
    return inspiration


@router.delete("/inspiration/{inspiration_id}")
def delete_inspiration(
        inspiration_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Delete an inspiration entry"""
    inspiration = db.query(JourneyInspiration).filter(
        JourneyInspiration.id == inspiration_id,
        JourneyInspiration.user_number == user_number
    ).first()

    if not inspiration:
        raise HTTPException(status_code=404, detail="Inspiration not found")

    db.delete(inspiration)
    db.commit()
    return {"success": True, "message": "Inspiration deleted"}


# ============================================
# COACHING MOMENTS - FULL CRUD
# ============================================

class CoachingMomentCreate(BaseModel):
    title: Optional[str] = None
    moment_text: str
    person: Optional[str] = None
    outcome: Optional[str] = None
    learning: Optional[str] = None


class CoachingMomentUpdate(BaseModel):
    title: Optional[str] = None
    moment_text: Optional[str] = None
    person: Optional[str] = None
    outcome: Optional[str] = None
    learning: Optional[str] = None


class CoachingMomentResponse(BaseModel):
    id: int
    user_number: str
    title: Optional[str]
    moment_text: str
    person: Optional[str]
    outcome: Optional[str]
    learning: Optional[str]
    first_seen_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.get("/coaching-moments", response_model=list[CoachingMomentResponse])
def get_coaching_moments(
        user_number: str,
        db: Session = Depends(get_db)
):
    """Get all coaching moments for a user"""
    moments = db.query(JourneyCoachingMoment).filter(
        JourneyCoachingMoment.user_number == user_number
    ).order_by(JourneyCoachingMoment.first_seen_at.desc()).all()
    return moments


@router.post("/coaching-moments", response_model=CoachingMomentResponse)
def create_coaching_moment(
        moment_data: CoachingMomentCreate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Create a new coaching moment"""
    new_moment = JourneyCoachingMoment(
        user_number=user_number,
        title=moment_data.title,
        moment_text=moment_data.moment_text,
        person=moment_data.person,
        outcome=moment_data.outcome,
        learning=moment_data.learning,
        first_seen_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(new_moment)
    db.commit()
    db.refresh(new_moment)
    return new_moment


@router.put("/coaching-moments/{moment_id}", response_model=CoachingMomentResponse)
def update_coaching_moment(
        moment_id: int,
        moment_data: CoachingMomentUpdate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Update a coaching moment"""
    moment = db.query(JourneyCoachingMoment).filter(
        JourneyCoachingMoment.id == moment_id,
        JourneyCoachingMoment.user_number == user_number
    ).first()

    if not moment:
        raise HTTPException(status_code=404, detail="Coaching moment not found")

    if moment_data.title is not None:
        moment.title = moment_data.title
    if moment_data.moment_text is not None:
        moment.moment_text = moment_data.moment_text
    if moment_data.person is not None:
        moment.person = moment_data.person
    if moment_data.outcome is not None:
        moment.outcome = moment_data.outcome
    if moment_data.learning is not None:
        moment.learning = moment_data.learning

    moment.updated_at = datetime.now()
    db.commit()
    db.refresh(moment)
    return moment


@router.delete("/coaching-moments/{moment_id}")
def delete_coaching_moment(
        moment_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Delete a coaching moment"""
    moment = db.query(JourneyCoachingMoment).filter(
        JourneyCoachingMoment.id == moment_id,
        JourneyCoachingMoment.user_number == user_number
    ).first()

    if not moment:
        raise HTTPException(status_code=404, detail="Coaching moment not found")

    db.delete(moment)
    db.commit()
    return {"success": True, "message": "Coaching moment deleted"}


# ============================================
# TEAM COMPOSITION - FULL CRUD
# ============================================

class TeamCompositionCreate(BaseModel):
    title: Optional[str] = None
    composition_text: str
    team_type: Optional[str] = None
    dynamics: Optional[str] = None


class TeamCompositionUpdate(BaseModel):
    title: Optional[str] = None
    composition_text: Optional[str] = None
    team_type: Optional[str] = None
    dynamics: Optional[str] = None


class TeamCompositionResponse(BaseModel):
    id: int
    user_number: str
    title: Optional[str]
    composition_text: str
    team_type: Optional[str]
    dynamics: Optional[str]
    first_seen_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.get("/team-composition", response_model=list[TeamCompositionResponse])
def get_team_composition(
        user_number: str,
        db: Session = Depends(get_db)
):
    """Get all team composition entries for a user"""
    compositions = db.query(JourneyTeamComposition).filter(
        JourneyTeamComposition.user_number == user_number
    ).order_by(JourneyTeamComposition.first_seen_at.desc()).all()
    return compositions


@router.post("/team-composition", response_model=TeamCompositionResponse)
def create_team_composition(
        composition_data: TeamCompositionCreate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Create a new team composition entry"""
    new_composition = JourneyTeamComposition(
        user_number=user_number,
        title=composition_data.title,
        composition_text=composition_data.composition_text,
        team_type=composition_data.team_type,
        dynamics=composition_data.dynamics,
        first_seen_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(new_composition)
    db.commit()
    db.refresh(new_composition)
    return new_composition


@router.put("/team-composition/{composition_id}", response_model=TeamCompositionResponse)
def update_team_composition(
        composition_id: int,
        composition_data: TeamCompositionUpdate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Update a team composition entry"""
    composition = db.query(JourneyTeamComposition).filter(
        JourneyTeamComposition.id == composition_id,
        JourneyTeamComposition.user_number == user_number
    ).first()

    if not composition:
        raise HTTPException(status_code=404, detail="Team composition not found")

    if composition_data.title is not None:
        composition.title = composition_data.title
    if composition_data.composition_text is not None:
        composition.composition_text = composition_data.composition_text
    if composition_data.team_type is not None:
        composition.team_type = composition_data.team_type
    if composition_data.dynamics is not None:
        composition.dynamics = composition_data.dynamics

    composition.updated_at = datetime.now()
    db.commit()
    db.refresh(composition)
    return composition


@router.delete("/team-composition/{composition_id}")
def delete_team_composition(
        composition_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Delete a team composition entry"""
    composition = db.query(JourneyTeamComposition).filter(
        JourneyTeamComposition.id == composition_id,
        JourneyTeamComposition.user_number == user_number
    ).first()

    if not composition:
        raise HTTPException(status_code=404, detail="Team composition not found")

    db.delete(composition)
    db.commit()
    return {"success": True, "message": "Team composition deleted"}

# ============================================================
# JOURNEY COACHING ENDPOINT
# ============================================================

from app.config import OPENAI_API_KEY, OPENAI_MODEL
from openai import OpenAI

openai_client_journey = OpenAI(api_key=OPENAI_API_KEY)


class JourneyCoachRequest(BaseModel):
    user_number: str
    journey_type: str  # "strength", "goal", "failure", etc.
    current_data: dict  # The form data being edited
    action: Optional[str] = "initial_feedback"
    user_message: Optional[str] = None
    conversation_history: Optional[list] = None


@router.post("/coach")
def get_journey_coaching(
    coach_request: JourneyCoachRequest,
    db: Session = Depends(get_db)
):
    """
    Provide contextual AI coaching for journey items.
    Alfred gives feedback on how to improve the current entry.
    """
    
    # Build full journey context
    from app.services.journey_context import build_journey_context
    journey_context = build_journey_context(db, coach_request.user_number)
    
    # Create coaching prompt based on journey type
    coaching_prompts = {
        "strength": """You are Alfred, coaching the user on articulating their strengths more powerfully.

Current strength entry:
{current_data}

Your role:
- Help them make it more specific and tangible
- Encourage concrete examples of impact
- Connect to measurable outcomes when possible
- Keep it authentic to who they are

Give direct, actionable feedback in 2-3 sentences.""",

        "goal": """You are Alfred, helping the user clarify their goals.

Current goal entry:
{current_data}

Your role:
- Help define clear success metrics
- Deepen the 'why' behind the goal
- Ensure it's specific and time-bound
- Connect to their broader vision

Give direct, actionable feedback in 2-3 sentences.""",

        "failure": """You are Alfred, helping the user extract wisdom from setbacks.

Current failure entry:
{current_data}

Your role:
- Help identify the deeper learning
- Surface the emotional residue (the 'scar')
- Connect to future growth opportunities
- Be empathetic but move toward insight

Give direct, actionable feedback in 2-3 sentences.""",

        "value": """You are Alfred, helping the user articulate their core values.

Current value entry:
{current_data}

Your role:
- Help them get to the essence of why this matters
- Encourage specific examples of when this value guided decisions
- Connect to their leadership identity
- Keep it authentic and personal

Give direct, actionable feedback in 2-3 sentences.""",

        "development-area": """You are Alfred, helping the user clarify areas for growth.

Current development area entry:
{current_data}

Your role:
- Help them be specific about what skill/capability to develop
- Connect to their goals and challenges
- Suggest concrete first steps
- Frame it as opportunity, not deficit

Give direct, actionable feedback in 2-3 sentences."""
    }
    
    # Default coaching prompt
    default_prompt = """You are Alfred, providing coaching on this journey entry.

Current entry:
{current_data}

Help them make it more specific, actionable, and aligned with their leadership development.
Give direct, actionable feedback in 2-3 sentences."""
    
    # Get appropriate prompt
    coaching_template = coaching_prompts.get(
        coach_request.journey_type,
        default_prompt
    )
    
    # Format current data for prompt
    current_data_str = "\n".join([
        f"- {key}: {value}" 
        for key, value in coach_request.current_data.items() 
        if value and key not in ['id', 'user_number', 'first_seen_at', 'updated_at']
    ])
    
    # Build system prompt
    system_prompt = f"""You are Alfred, an AI Chief of Staff and executive coach.
    
You have full context about the user's journey:
{journey_context}

{coaching_template.format(current_data=current_data_str)}

Keep responses warm, direct, and actionable. No pleasantries needed."""
    
    # Build messages
    if coach_request.action == "initial_feedback":
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Give me feedback on my current {coach_request.journey_type} entry."}
        ]
    else:
        # Continuing conversation
        messages = [{"role": "system", "content": system_prompt}]
        
        # Add conversation history if provided
        if coach_request.conversation_history:
            for msg in coach_request.conversation_history:
                messages.append({
                    "role": msg.get("role"),
                    "content": msg.get("content")
                })
        
        # Add current user message
        if coach_request.user_message:
            messages.append({
                "role": "user",
                "content": coach_request.user_message
            })
    
    # Get GPT response
    try:
        response = openai_client_journey.chat.completions.create(
            model=OPENAI_MODEL,
            messages=messages,
            max_tokens=300,  # Keep responses concise
            temperature=0.7
        )
        
        feedback = response.choices[0].message.content
        
        return {
            "feedback": feedback,
            "journey_type": coach_request.journey_type,
            "timestamp": datetime.now().isoformat()
        }
    
    except Exception as e:
        print(f"Error generating coaching feedback: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to generate coaching feedback"
        )


@router.get("/people/review-candidates")
def get_people_review_candidates(
    user_number: str,
    include_all: bool = False,
    db: Session = Depends(get_db)
):
    """Get list of people who could benefit from a review"""
    try:
        result = PeopleReviewService.get_review_candidates(db, user_number, include_all)
        return result
    except Exception as e:
        print(f"Error getting review candidates: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/people/{person_id}/start-review")
def start_people_review(
    person_id: int,
    user_number: str,
    review_type: str = "regular",
    db: Session = Depends(get_db)
):
    """Initialize a new review session for a person"""
    try:
        result = PeopleReviewService.start_review(db, user_number, person_id, review_type)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        print(f"Error starting review: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/people/{person_id}/review-history")
def get_people_review_history(
    person_id: int,
    user_number: str,
    db: Session = Depends(get_db)
):
    """Get all past reviews for a person"""
    try:
        result = PeopleReviewService.get_review_history(db, person_id, user_number)
        return result
    except Exception as e:
        print(f"Error getting review history: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/people/reviews/{review_id}")
def update_people_review(
    review_id: int,
    updates: dict,
    db: Session = Depends(get_db)
):
    """Update a review in progress"""
    try:
        review = PeopleReviewService.update_review(db, review_id, updates)
        return {"success": True, "review_id": review.id}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        print(f"Error updating review: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/people/reviews/{review_id}/complete")
def complete_people_review(
    review_id: int,
    db: Session = Depends(get_db)
):
    """Mark review as complete and update person record"""
    try:
        result = PeopleReviewService.complete_review(db, review_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        print(f"Error completing review: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/people/active-review")
def get_active_people_review(
    user_number: str,
    db: Session = Depends(get_db)
):
    """Get the active review session if any"""
    try:
        result = PeopleReviewService.get_active_review(db, user_number)
        if result:
            return result
        else:
            return {"active": False}
    except Exception as e:
        print(f"Error getting active review: {e}")
        raise HTTPException(status_code=500, detail=str(e))


