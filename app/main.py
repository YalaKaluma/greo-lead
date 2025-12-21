from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import logging
from app.db import Base, engine
from app.routers import journal, webhook, tasks, nudge, webhook_brain, journey, messages

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --------------------------------------
# Create DB tables automatically
# --------------------------------------
try:
    Base.metadata.create_all(bind=engine)
    logger.info("✓ Database tables created successfully")
except Exception as e:
    logger.error(f"✗ Database initialization failed: {e}")
    # Don't fail completely - allow app to start for diagnostics

# --------------------------------------
# Initialize App
# --------------------------------------
app = FastAPI(title="Leadership OS API", version="3.0")

# --------------------------------------
# CORS middleware
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

logger.info("✓ API routers registered")

# --------------------------------------
# Health check (CRITICAL for Railway)
# --------------------------------------
@app.get("/api/health")
def health():
    """Health check endpoint for Railway deployment verification"""
    return {
        "status": "ok",
        "service": "Leadership OS",
        "version": "3.0",
        "database": "connected" if engine else "not connected"
    }

@app.get("/")
async def root_health():
    """Root endpoint - also acts as health check"""
    static_path = Path(__file__).parent.parent / "static"
    return {
        "status": "ok",
        "message": "Leadership OS API is running",
        "frontend": "available" if static_path.exists() else "not built",
        "api_docs": "/docs"
    }

# --------------------------------------
# Serve React static files
# --------------------------------------
static_path = Path(__file__).parent.parent / "static"

logger.info(f"Looking for static files at: {static_path.absolute()}")

if static_path.exists():
    logger.info(f"✓ Static directory found: {static_path}")
    
    # List contents for debugging
    try:
        contents = list(static_path.iterdir())
        logger.info(f"Static directory contents: {[f.name for f in contents]}")
    except Exception as e:
        logger.error(f"Could not list static directory: {e}")
    
    # Mount assets directory
    assets_path = static_path / "assets"
    if assets_path.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_path)), name="assets")
        logger.info("✓ Assets mounted at /assets")
    else:
        logger.warning(f"✗ Assets directory not found at {assets_path}")
    
    # Serve batman.svg favicon
    @app.get("/batman.svg")
    async def serve_batman_svg():
        svg_file = static_path / "batman.svg"
        if svg_file.exists():
            return FileResponse(str(svg_file))
        logger.warning("batman.svg not found")
        return JSONResponse({"error": "Favicon not found"}, status_code=404)
    
    # Serve vite.svg
    @app.get("/vite.svg")
    async def serve_vite_svg():
        svg_file = static_path / "vite.svg"
        if svg_file.exists():
            return FileResponse(str(svg_file))
        return JSONResponse({"error": "vite.svg not found"}, status_code=404)
    
    # Serve React app at root (ONLY if not an API route)
    @app.get("/{full_path:path}")
    async def serve_react_or_404(full_path: str):
        # Don't catch API routes or asset files
        if full_path.startswith(("api/", "assets/", "docs", "redoc", "openapi.json")):
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Not found")
        
        # For all other routes, serve React app (for client-side routing)
        index_file = static_path / "index.html"
        if index_file.exists():
            return FileResponse(str(index_file))
        
        logger.error(f"index.html not found at {index_file}")
        return JSONResponse({
            "error": "React app not found",
            "message": "Frontend not built. Run: cd frontend && npm run build",
            "api_docs": "/docs"
        }, status_code=404)

else:
    logger.warning(f"✗ Static directory not found at {static_path.absolute()}")
    logger.warning("Frontend not deployed. API-only mode.")

# Log startup completion
logger.info("=" * 50)
logger.info("🚀 Leadership OS API started successfully")
logger.info("=" * 50)
