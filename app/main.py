from fastapi import FastAPI
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles

app = FastAPI()

# Templates directory
templates = Jinja2Templates(directory="app/templates")

@app.get("/health")
def health():
    return {"status": "ok"}

from fastapi import FastAPI, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.db import SessionLocal

app = FastAPI()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/dbtest")
def dbtest(db: Session = Depends(get_db)):
    result = db.execute(text("SELECT 1")).fetchone()
    return {"status": "ok", "result": result[0]}

from fastapi import FastAPI
from app.db import Base, engine
from app.routers import journal, webhook

app = FastAPI()

app.include_router(journal.router)
app.include_router(webhook.router)

@app.get("/")
def home():
    return {"message": "Greo backend running"}







