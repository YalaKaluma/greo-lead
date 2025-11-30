from fastapi import FastAPI
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles

from app.db import Base, engine
from app.routers import journal, webhook

# --------------------------------------
# Initialize App
# --------------------------------------
app = FastAPI()

# Templates
templates = Jinja2Templates(directory="app/templates")

# --------------------------------------
# Create DB tables automatically
# --------------------------------------
Base.metadata.create_all(bind=engine)

# --------------------------------------
# Include Routers
# --------------------------------------
app.include_router(journal.router)
app.include_router(webhook.router)

# --------------------------------------
# Test Endpoints
# --------------------------------------
@app.get("/")
def home():
    return {"message": "Greo backend running"}

@app.get("/health")
def health():
    return {"status": "ok"}
