from sqlalchemy.orm import Session
from app.models import (
    JourneyPerson,
    JourneyGoal,
    JourneyFailure,
    JourneyProject,
    JourneyStrength,
    JourneyOpportunity,
    JourneyDevelopmentArea,
)

# ----------------------------------
# PEOPLE (JourneyPerson)
# ----------------------------------
def add_person(db: Session, user_number: str, name: str, email: str = None,
               phone: str = None, relation: str = None, context: str = None):
    person = JourneyPerson(
        user_number=user_number,
        name=name,
        email=email,
        phone=phone,
        relation=relation,
        context=context
    )
    db.add(person)
    db.commit()
    db.refresh(person)
    return person


def get_people(db: Session, user_number: str):
    return db.query(JourneyPerson).filter(JourneyPerson.user_number == user_number).all()


# ----------------------------------
# GOALS (JourneyGoal)
# ----------------------------------
def add_goal(db: Session, user_number: str, goal_text: str, why: str = None, time_horizon: str = None):
    goal = JourneyGoal(
        user_number=user_number,
        goal_text=goal_text,
        why=why,
        time_horizon=time_horizon
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return goal


def get_goals(db: Session, user_number: str):
    return db.query(JourneyGoal).filter(JourneyGoal.user_number == user_number).all()


# ----------------------------------
# FAILURES (JourneyFailure)
# ----------------------------------
def add_failure(db: Session, user_number: str, failure_text: str, scar: str = None, learning: str = None):
    failure = JourneyFailure(
        user_number=user_number,
        failure_text=failure_text,
        scar=scar,
        learning=learning
    )
    db.add(failure)
    db.commit()
    db.refresh(failure)
    return failure


def get_failures(db: Session, user_number: str):
    return db.query(JourneyFailure).filter(JourneyFailure.user_number == user_number).all()


# ----------------------------------
# PROJECTS (JourneyProject)
# ----------------------------------
def add_project(db: Session, user_number: str, project_name: str, goal: str = None,
                description: str = None, status: str = "active"):
    project = JourneyProject(
        user_number=user_number,
        project_name=project_name,
        goal=goal,
        description=description,
        status=status
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


def get_projects(db: Session, user_number: str):
    return db.query(JourneyProject).filter(JourneyProject.user_number == user_number).all()


# ----------------------------------
# STRENGTHS (JourneyStrength)
# ----------------------------------
def add_strength(db: Session, user_number: str, strength: str, source: str = None):
    strength_entry = JourneyStrength(
        user_number=user_number,
        strength=strength,
        source=source
    )
    db.add(strength_entry)
    db.commit()
    db.refresh(strength_entry)
    return strength_entry


def get_strengths(db: Session, user_number: str):
    return db.query(JourneyStrength).filter(JourneyStrength.user_number == user_number).all()


# ----------------------------------
# OPPORTUNITIES (JourneyOpportunity)
# ----------------------------------
def add_opportunity(db: Session, user_number: str, opportunity_text: str, category: str = None):
    opportunity = JourneyOpportunity(
        user_number=user_number,
        opportunity_text=opportunity_text,
        category=category
    )
    db.add(opportunity)
    db.commit()
    db.refresh(opportunity)
    return opportunity


def get_opportunities(db: Session, user_number: str):
    return db.query(JourneyOpportunity).filter(JourneyOpportunity.user_number == user_number).all()


#----------------------------------
# DEVELOPMENT AREAS (JourneyDevelopmentArea)
# ----------------------------------

def add_development_area(db: Session, user_number: str, skill: str, source: Optional[str] = None):
    development_area = JourneyDevelopmentArea(
        user_number=user_number,
        skill=skill,
        source=source
    )
    db.add(development_area)
    db.commit()
    db.refresh(development_area)
    return development_area

def get_development_areas(db: Session, user_number: str):
    return db.query(JourneyDevelopmentArea).filter(JourneyDevelopmentArea.user_number == user_number).all()

