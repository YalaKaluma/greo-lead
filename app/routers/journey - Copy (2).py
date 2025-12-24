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
    JourneyAchievement
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
    parent_goal_id: Optional[int] = None


class GoalUpdate(BaseModel):
    title: Optional[str] = None
    goal_text: Optional[str] = None
    why: Optional[str] = None
    time_horizon: Optional[str] = None
    parent_goal_id: Optional[int] = None


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
        parent_goal_id=goal_data.parent_goal_id,
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