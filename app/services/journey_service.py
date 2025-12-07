from sqlalchemy.orm import Session
from app.models import Role, Strength, Project, Person, Failure, Opportunity


# -------------------------
# ROLE CRUD
# -------------------------
def add_role(db: Session, user_number: str, title: str, description: str = None):
    role = Role(
        user_number=user_number,
        title=title,
        description=description
    )
    db.add(role)
    db.commit()
    db.refresh(role)
    return role


def get_roles(db: Session, user_number: str):
    return db.query(Role).filter(Role.user_number == user_number).all()


# -------------------------
# STRENGTH CRUD
# -------------------------
def add_strength(db: Session, user_number: str, description: str):
    strength = Strength(
        user_number=user_number,
        description=description
    )
    db.add(strength)
    db.commit()
    db.refresh(strength)
    return strength


def get_strengths(db: Session, user_number: str):
    return db.query(Strength).filter(Strength.user_number == user_number).all()


# -------------------------
# PROJECT CRUD
# -------------------------
def add_project(db: Session, user_number: str, name: str, goal: str = None, context: str = None):
    project = Project(
        user_number=user_number,
        name=name,
        goal=goal,
        context=context
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


def get_projects(db: Session, user_number: str):
    return db.query(Project).filter(Project.user_number == user_number).all()


# -------------------------
# PEOPLE CRUD
# -------------------------
def add_person(
    db: Session,
    user_number: str,
    name: str,
    email: str = None,
    phone: str = None,
    relationship: str = None
):
    person = Person(
        user_number=user_number,
        name=name,
        email=email,
        phone=phone,
        relationship=relationship
    )
    db.add(person)
    db.commit()
    db.refresh(person)
    return person


def get_people(db: Session, user_number: str):
    return db.query(Person).filter(Person.user_number == user_number).all()


# -------------------------
# FAILURE CRUD
# -------------------------
def add_failure(db: Session, user_number: str, description: str, learning: str = None):
    failure = Failure(
        user_number=user_number,
        description=description,
        learning=learning
    )
    db.add(failure)
    db.commit()
    db.refresh(failure)
    return failure


def get_failures(db: Session, user_number: str):
    return db.query(Failure).filter(Failure.user_number == user_number).all()


# -------------------------
# OPPORTUNITY CRUD
# -------------------------
def add_opportunity(db: Session, user_number: str, description: str, why: str = None):
    opportunity = Opportunity(
        user_number=user_number,
        description=description,
        why=why
    )
    db.add(opportunity)
    db.commit()
    db.refresh(opportunity)
    return opportunity


def get_opportunities(db: Session, user_number: str):
    return db.query(Opportunity).filter(Opportunity.user_number == user_number).all()
