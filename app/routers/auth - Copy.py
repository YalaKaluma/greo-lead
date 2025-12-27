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

    # Generate user_number in WhatsApp format to match existing data
    user_number = user.phone_number
    if not user_number:
        # Use WhatsApp format: whatsapp:+<phone> or whatsapp:+<id>
        if user.phone_number and user.phone_number.startswith('whatsapp:'):
            user_number = user.phone_number
        else:
            # Generate in WhatsApp format for consistency
            user_number = f"whatsapp:+{user.id}"
            user.phone_number = user_number
            db.commit()

    return {
        "success": True,
        "user": {
            "id": user.id,
            "name": user.name,
            "user_number": user_number
        }
    }


class RegisterRequest(BaseModel):
    username: str
    password: str


@router.post("/register")
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.name == payload.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")

    user = User(
        name=payload.username,
        password=payload.password,
        phone_number=None  # Will be set immediately after
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    # Generate user_number in WhatsApp format for consistency
    user_number = f"whatsapp:+{user.id}"
    user.phone_number = user_number
    db.commit()

    return {
        "success": True,
        "user": {
            "id": user.id,
            "name": user.name,
            "user_number": user_number
        }
    }