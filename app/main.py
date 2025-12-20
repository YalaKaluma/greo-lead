from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
from app.db import Base, engine
from app.routers import journal, webhook, tasks, nudge, webhook_brain, journey, messages


# --------------------------------------
# Create DB tables automatically
# --------------------------------------
Base.metadata.create_all(bind=engine)

# --------------------------------------
# Initialize App
# --------------------------------------
app = FastAPI(title="Leadership OS API", version="2.0")

# --------------------------------------
# CORS middleware (for development)
# --------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your domains
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --------------------------------------
# Include API routers (with /api prefix)
# --------------------------------------
app.include_router(journal.router, prefix="/api/journal", tags=["Journal"])
app.include_router(webhook.router, prefix="/api", tags=["Webhook"])
app.include_router(webhook_brain.router, prefix="/api/brain", tags=["Webhook-Brain"])
app.include_router(tasks.router, prefix="/api/tasks", tags=["Tasks"])
app.include_router(nudge.router, prefix="/api", tags=["Nudge"])
app.include_router(journey.router, prefix="/api/journey", tags=["Journey"])
app.include_router(messages.router, prefix="/api", tags=["Messages"])


# --------------------------------------
# Health check
# --------------------------------------
@app.get("/api/health")
def health():
    return {"status": "ok", "service": "Leadership OS"}


# --------------------------------------
# Serve React static files
# --------------------------------------
static_path = Path(__file__).parent.parent / "static"

if static_path.exists():
    # Mount static files for assets (CSS, JS, images)
    # This MUST come before the catch-all route
    app.mount("/assets", StaticFiles(directory=str(static_path / "assets")), name="assets")


    # Serve other static files (like vite.svg)
    @app.get("/vite.svg")
    async def serve_vite_svg():
        svg_file = static_path / "vite.svg"
        if svg_file.exists():
            return FileResponse(str(svg_file))


    @app.get("/batman.svg")  # ← ADD this for Batman favicon
    async def serve_batman_svg():
        svg_file = static_path / "batman.svg"
        if svg_file.exists():
            return FileResponse(str(svg_file))

    # Serve React app at root
    @app.get("/")
    async def serve_react_app():
        index_file = static_path / "index.html"
        if index_file.exists():
            return FileResponse(str(index_file))
        return {"message": "React app not built yet. Run: cd frontend && npm run build"}


    # Catch-all for React Router (serves index.html for all non-API, non-asset routes)
    @app.get("/{full_path:path}")
    async def catch_all(full_path: str):
        # Don't catch API routes or asset files
        if full_path.startswith(("api/", "assets/")):
            # Let FastAPI handle 404 for these
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Not found")

        # For all other routes, serve React app (for client-side routing)
        index_file = static_path / "index.html"
        if index_file.exists():
            return FileResponse(str(index_file))
        return {"error": "React app not found"}
else:
    # Fallback when React not built yet
    @app.get("/")
    def home():
        return {
            "message": "Leadership OS API Running",
            "note": "React frontend not deployed yet. Build frontend first: cd frontend && npm run build",
            "api_docs": "/docs"
        }