from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import JournalEntry

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
    return {"status": "created", "entry": entry}


# ----------------------------
# LIST ALL ENTRIES
# ----------------------------
@router.get("/")
def list_entries(db: Session = Depends(get_db)):
    entries = db.query(JournalEntry).all()
    return {"entries": entries}


# ----------------------------
# GET ONE ENTRY
# ----------------------------
@router.get("/{entry_id}")
def get_entry(entry_id: int, db: Session = Depends(get_db)):
    entry = db.query(JournalEntry).filter(JournalEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    return entry


# ----------------------------
# UPDATE ENTRY
# ----------------------------
@router.put("/{entry_id}")
def update_entry(entry_id: int, text: str, db: Session = Depends(get_db)):
    entry = db.query(JournalEntry).filter(JournalEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    entry.text = text
    db.commit()
    db.refresh(entry)
    return {"status": "updated", "entry": entry}


# ----------------------------
# DELETE ENTRY
# ----------------------------
@router.delete("/{entry_id}")
def delete_entry(entry_id: int, db: Session = Depends(get_db)):
    entry = db.query(JournalEntry).filter(JournalEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    db.delete(entry)
    db.commit()
    return {"status": "deleted"}
