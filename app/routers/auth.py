from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import User
from pydantic import BaseModel




router = APIRouter(tags=["Auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
def login(credentials: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.name == credentials.username).first()

    if not user or user.password != credentials.password:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return {
        "success": True,
        "user": {
            "id": user.id,
            "name": user.name
        }
    }
                      



@router.post("/register")
def register(username: str, password: str, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.name == username).first()
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
        "username": user.name,
        "user_number": user.user_number
    }
