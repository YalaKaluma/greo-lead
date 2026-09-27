from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from app.models import JourneyPerson
from app.routers.journey_profile import create_person, update_person
from app.services.journey_support import PersonCreate, PersonUpdate, PersonResponse

def test_role_and_relationship_round_trip_independently():
    engine = create_engine("sqlite://")
    JourneyPerson.__table__.create(engine)
    with Session(engine) as db:
        person = create_person(PersonCreate(name="Example", role="Delivery Lead", relation="Reports to me"), "test-user", db)
        assert PersonResponse.model_validate(person).role == "Delivery Lead"
        update_person(person.id, PersonUpdate(role="Engineering Lead"), "test-user", db)
        assert person.relation == "Reports to me"
        update_person(person.id, PersonUpdate(relation="Peer"), "test-user", db)
        assert person.role == "Engineering Lead"
        db.expire_all()
        saved = db.get(JourneyPerson, person.id)
        assert (saved.role, saved.relation) == ("Engineering Lead", "Peer")
