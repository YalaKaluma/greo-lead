from app.services.journey_support import *

router = APIRouter()

from app.routers import journey_profile_artifacts, journey_profile_systems

router.include_router(journey_profile_artifacts.router)
router.include_router(journey_profile_systems.router)
for _route in journey_profile_artifacts.router.routes + journey_profile_systems.router.routes:
    if hasattr(_route, "endpoint"):
        globals()[_route.endpoint.__name__] = _route.endpoint

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
        mission_statement=person_data.mission_statement,
        strengths=person_data.strengths,
        growth_areas=person_data.growth_areas,
        aspirations=person_data.aspirations,
        meeting_notes=person_data.meeting_notes or [],
        organization=person_data.organization,
        team=person_data.team,
        manager_name=person_data.manager_name,
        circle_type=person_data.circle_type,
        strategic_importance=person_data.strategic_importance,
        last_interaction_at=person_data.last_interaction_at,
        next_action=person_data.next_action,
        current_goals=person_data.current_goals,
        development_plan=person_data.development_plan,
        stretch_assignments=person_data.stretch_assignments,
        coaching_focus=person_data.coaching_focus,
        performance_indicator=person_data.performance_indicator,
        potential_indicator=person_data.potential_indicator,
        current_contribution=person_data.current_contribution,
        potential_contribution=person_data.potential_contribution,
        stakeholder_mission=person_data.stakeholder_mission,
        stakeholder_priorities=person_data.stakeholder_priorities,
        success_metrics=person_data.success_metrics,
        stakeholder_strengths=person_data.stakeholder_strengths,
        risks_or_pressures=person_data.risks_or_pressures,
        stakeholder_aspirations=person_data.stakeholder_aspirations,
        how_i_create_value=person_data.how_i_create_value,
        mission_alignment=person_data.mission_alignment,
        potential_tensions=person_data.potential_tensions,
        relationship_strategy=person_data.relationship_strategy,
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
    if person_data.mission_statement is not None:
        person.mission_statement = person_data.mission_statement
    if person_data.strengths is not None:
        person.strengths = person_data.strengths
    if person_data.growth_areas is not None:
        person.growth_areas = person_data.growth_areas
    if person_data.aspirations is not None:
        person.aspirations = person_data.aspirations
    if person_data.meeting_notes is not None:
        person.meeting_notes = person_data.meeting_notes
    for field in (
        "organization",
        "team",
        "manager_name",
        "circle_type",
        "relationship_health",
        "strategic_importance",
        "last_interaction_at",
        "next_action",
        "current_goals",
        "development_plan",
        "stretch_assignments",
        "coaching_focus",
        "performance_indicator",
        "potential_indicator",
        "current_contribution",
        "potential_contribution",
        "stakeholder_mission",
        "stakeholder_priorities",
        "success_metrics",
        "stakeholder_strengths",
        "risks_or_pressures",
        "stakeholder_aspirations",
        "how_i_create_value",
        "mission_alignment",
        "potential_tensions",
        "relationship_strategy",
    ):
        value = getattr(person_data, field)
        if value is not None:
            setattr(person, field, value)

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

    db.query(RelationshipReview).filter(
        RelationshipReview.person_id == person_id,
        RelationshipReview.user_number == user_number
    ).delete(synchronize_session=False)

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
    except AttributeError:
        logger.debug("Development area has no updated_at column")

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
