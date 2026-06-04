from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import JournalEntry, User
from app.services.journal_reflection_depth_service import apply_reflection_depth, get_reflection_depth_trends
from app.services.message_service import save_message

router = APIRouter(prefix="/journal", tags=["journal"])

# ----------------------------
# CREATE A JOURNAL ENTRY
# ----------------------------
@router.post("/")
def create_entry(user_id: int, text: str, db: Session = Depends(get_db)):
    entry = JournalEntry(user_id=user_id, text=text)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    try:
        apply_reflection_depth(entry, text)
        db.commit()
        db.refresh(entry)
    except Exception as error:
        db.rollback()
        print(f"Reflection depth scoring failed for journal entry {entry.id}: {error}")

    user = db.query(User).filter(User.id == user_id).first()
    if user and user.phone_number:
        try:
            save_message(
                db=db,
                sender="user",
                user_number=user.phone_number,
                content=text,
                message_type="journal",
            )
        except Exception as error:
            db.rollback()
            print(f"Journal signal classification failed for journal entry {entry.id}: {error}")
    return {"status": "created", "entry": entry}


# ----------------------------
# LIST ALL ENTRIES
# ----------------------------

@router.get("/")
def list_entries(user_id: int, db: Session = Depends(get_db)):
    entries = (
        db.query(JournalEntry)
        .filter(JournalEntry.user_id == user_id)
        .all()
    )
    return {"entries": entries}


@router.get("/trends")
def get_trends(user_number: str, db: Session = Depends(get_db)):
    return get_reflection_depth_trends(user_number, db)

# ----------------------------
# GET ONE ENTRY
# ----------------------------

# ----------------------------
# GET ONE ENTRY
# ----------------------------
@router.get("/{entry_id}")
def get_entry(entry_id: int, user_id: int, db: Session = Depends(get_db)):
    entry = (
        db.query(JournalEntry)
        .filter(
            JournalEntry.id == entry_id,
            JournalEntry.user_id == user_id
        )
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    return entry



# ----------------------------
# UPDATE ENTRY
# ----------------------------

@router.put("/{entry_id}")
def update_entry(entry_id: int, user_id: int, text: str, db: Session = Depends(get_db)):
    entry = (
        db.query(JournalEntry)
        .filter(
            JournalEntry.id == entry_id,
            JournalEntry.user_id == user_id
        )
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    entry.text = text
    try:
        apply_reflection_depth(entry, text)
    except Exception as error:
        print(f"Reflection depth scoring failed for journal entry {entry.id}: {error}")
    db.commit()
    db.refresh(entry)
    return {"status": "updated", "entry": entry}


# ----------------------------
# DELETE ENTRY
# ----------------------------
@router.delete("/{entry_id}")
def delete_entry(entry_id: int, user_id: int, db: Session = Depends(get_db)):
    entry = (
        db.query(JournalEntry)
        .filter(
            JournalEntry.id == entry_id,
            JournalEntry.user_id == user_id
        )
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    db.delete(entry)
    db.commit()
    return {"status": "deleted"}
