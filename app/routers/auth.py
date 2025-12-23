from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import User

router = APIRouter(prefix="/api/auth", tags=["Auth"])

@router.post("/login")
def login(username: str, password: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.name == username).first()

    if not user or user.password != password:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # VERY IMPORTANT:
    # We return user_number, not a token
    return {
        "username": user.username,
        "user_number": user.user_number
    }


@router.post("/register")
def register(username: str, password: str, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.username == username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")

    user = User(
        username=username,
        password=password,           # ⚠️ plaintext for now (OK for Phase 0)
        user_number=f"user:{username}"
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return {
        "username": user.username,
        "user_number": user.user_number
    }
