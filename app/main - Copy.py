from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import logging
import sys
import os
from datetime import datetime
from app.db import Base, engine
from app.routers import journal, webhook, tasks, nudge, webhook_brain, journey, messages, habits, waitlist, onboarding, chat, priority
from app.routers import auth
from sqlalchemy import text
import threading
from app.email_poller import run_email_loop

# Configure logging with timestamp
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# Startup banner
logger.info("=" * 70)
logger.info("🚀 LEADERSHIP OS - STARTING UP")
logger.info("=" * 70)
logger.info(f"Python version: {sys.version.split()[0]}")
logger.info(f"FastAPI initializing...")
logger.info(f"Timestamp: {datetime.now().isoformat()}")
logger.info("=" * 70)

# --------------------------------------
# Environment Check
# --------------------------------------
logger.info("📋 Checking Environment Variables...")
required_vars = [
    "DATABASE_URL",
    "OPENAI_API_KEY",
    "DEFAULT_USER_NUMBER",
    "TWILIO_SID",
    "TWILIO_AUTH_TOKEN",
    "TWILIO_WHATSAPP_NUMBER",
    "MAILGUN_API_KEY",
    "MAILGUN_DOMAIN",
    "MAILGUN_FROM"
]

missing_vars = []
for var in required_vars:
    if os.getenv(var):
        # Don't log the actual value for security
        logger.info(f"  ✓ {var} is set")
    else:
        logger.error(f"  ✗ {var} is MISSING")
        missing_vars.append(var)

if missing_vars:
    logger.warning(f"⚠️  Missing {len(missing_vars)} environment variable(s): {', '.join(missing_vars)}")
else:
    logger.info("✓ All required environment variables are set")

# --------------------------------------
# Database Initialization
# --------------------------------------
logger.info("💾 Initializing Database...")
try:
    Base.metadata.create_all(bind=engine)
    logger.info("✓ Database tables created/verified successfully")
    logger.info(f"  Database engine: {engine.url.drivername}")
    logger.info(f"  Database host: {engine.url.host}")
except Exception as e:
    logger.error(f"✗ Database initialization failed: {e}")
    logger.error("  This may cause API endpoints to fail!")

# --------------------------------------
# Initialize App
# --------------------------------------
logger.info("⚙️  Initializing FastAPI application...")
app = FastAPI(
    title="Leadership OS API",
    version="3.0",
    description="AI-powered Chief of Staff for busy executives"
)
logger.info("✓ FastAPI app created")

# --------------------------------------
# CORS middleware
# --------------------------------------
logger.info("🌐 Configuring CORS middleware...")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
logger.info("✓ CORS middleware configured (allowing all origins)")


# --------------------------------------
# Request logging middleware
# --------------------------------------
@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.info(f"📥 {request.method} {request.url.path}")
    response = await call_next(request)
    logger.info(f"📤 {request.method} {request.url.path} → {response.status_code}")
    return response


logger.info("✓ Request logging middleware configured")

# --------------------------------------
# Include API routers
# --------------------------------------
logger.info("🔌 Registering API routers...")
routers_to_register = [
    (journal.router, "/api/journal", "Journal"),
    (auth.router, "/api/auth", "Auth"),
    (onboarding.router, "/api/onboarding", "Onboarding"),
    (webhook.router, "/api", "Webhook"),
    (webhook_brain.router, "/api/brain", "Webhook-Brain"),
    (tasks.router, "/api/tasks", "Tasks"),
    (nudge.router, "/api", "Nudge"),
    (journey.router, "/api/journey", "Journey"),
    (messages.router, "/api", "Messages"),
    (waitlist.router, "/api", "Waitlist"),
    (habits.router, "/api/habits", "Habits"),
    (chat.router, "/api", "Chat"),
    (priority.router, "/api/priority", "Priority"),
]



for router, prefix, tag in routers_to_register:
    try:
        app.include_router(router, prefix=prefix, tags=[tag])
        logger.info(f"  ✓ {tag} router registered at {prefix}")
    except Exception as e:
        logger.error(f"  ✗ Failed to register {tag} router: {e}")

logger.info("✓ All API routers registered")


# --------------------------------------
# Health check endpoint
# --------------------------------------
@app.get("/api/health")
def health():
    """
    Health check endpoint for Railway and monitoring.
    Returns detailed status of backend services.
    """
    db_status = "connected" if engine else "not connected"

    # Test database connection
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_status = "connected"
        db_test = "✓"
    except Exception as e:
        db_status = "error"
        db_test = f"✗ {str(e)[:50]}"

    response = {
        "status": "ok",
        "service": "Leadership OS",
        "version": "3.0",
        "timestamp": datetime.now().isoformat(),
        "database": db_status,
        "database_test": db_test,
        "environment": {
            "has_openai_key": bool(os.getenv("OPENAI_API_KEY")),
            "has_twilio_config": bool(os.getenv("TWILIO_SID")),
            "has_mailgun_config": bool(os.getenv("MAILGUN_API_KEY")),
        }
    }

    logger.info(f"🏥 Health check called - Status: {response['status']}, DB: {db_status}")
    return response


logger.info("✓ Health check endpoints configured")

# --------------------------------------
# Serve React static files
# --------------------------------------
logger.info("📁 Configuring static file serving...")
static_path = Path(__file__).parent.parent / "static"
logger.info(f"  Static path: {static_path.absolute()}")

if static_path.exists():
    logger.info("  ✓ Static directory found")

    # List contents
    try:
        contents = list(static_path.iterdir())
        logger.info(f"  📂 Static files: {[f.name for f in contents]}")

        # Check for critical files
        index_html = static_path / "index.html"
        if index_html.exists():
            logger.info(f"  ✓ index.html found ({index_html.stat().st_size} bytes)")
        else:
            logger.warning("  ⚠️  index.html NOT found!")

    except Exception as e:
        logger.error(f"  ✗ Could not list static directory: {e}")

    # Mount assets
    assets_path = static_path / "assets"
    if assets_path.exists():
        try:
            app.mount("/assets", StaticFiles(directory=str(assets_path)), name="assets")

            # Count asset files
            asset_files = list(assets_path.glob("*"))
            logger.info(f"  ✓ Assets mounted at /assets ({len(asset_files)} files)")
        except Exception as e:
            logger.error(f"  ✗ Failed to mount assets: {e}")
    else:
        logger.warning("  ⚠️  Assets directory not found")


    # Serve SVG files
    @app.get("/batman.svg")
    async def serve_batman_svg():
        svg_file = static_path / "batman.svg"
        if svg_file.exists():
            logger.info("🦇 Serving batman.svg favicon")
            return FileResponse(str(svg_file))
        logger.warning("batman.svg requested but not found")
        return JSONResponse({"error": "batman.svg not found"}, status_code=404)


    @app.get("/vite.svg")
    async def serve_vite_svg():
        svg_file = static_path / "vite.svg"
        if svg_file.exists():
            return FileResponse(str(svg_file))
        return JSONResponse({"error": "vite.svg not found"}, status_code=404)


    # Catch-all for React Router - MUST BE LAST!
    @app.get("/{full_path:path}")
    async def serve_react_or_404(full_path: str):
        # Don't catch API routes
        if full_path.startswith(("api/", "assets/", "docs", "redoc", "openapi.json")):
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Not found")

        # Try to serve static files first (images, etc.)
        file_path = static_path / full_path
        if file_path.is_file():
            logger.info(f"📄 Serving static file: /{full_path}")
            return FileResponse(str(file_path))

        # Serve React app for everything else (including root "/")
        index_file = static_path / "index.html"
        if index_file.exists():
            logger.info(f"🎨 Serving React app for: /{full_path}")
            return FileResponse(str(index_file))

        logger.error(f"React app requested but index.html not found at {index_file}")
        return JSONResponse({
            "error": "React app not found",
            "message": "Frontend not built",
            "api_docs": "/docs"
        }, status_code=404)


    logger.info("✓ Static file serving configured")

else:
    logger.warning(f"⚠️  Static directory not found at {static_path.absolute()}")
    logger.warning("  Frontend will not be available!")
    logger.warning("  API endpoints will still work.")


#----------------------- email service

@app.on_event("startup")
def start_email():
    thread = threading.Thread(target=run_email_loop, daemon=True)
    thread.start()

# --------------------------------------
# Startup Complete
# --------------------------------------
logger.info("=" * 70)
logger.info("✅ LEADERSHIP OS - STARTUP COMPLETE")
logger.info("=" * 70)
logger.info("📍 Available endpoints:")
logger.info("   • Root:        / (serves React app)")
logger.info("   • Health:      /api/health")
logger.info("   • API Docs:    /docs")
logger.info("   • Tasks:       /api/tasks")
logger.info("   • Journey:     /api/journey")
logger.info("   • Webhook:     /api/webhook")
logger.info("   • Email:       /api/email/webhook")
logger.info("=" * 70)
logger.info("🎯 Ready to serve requests!")
logger.info("=" * 70)