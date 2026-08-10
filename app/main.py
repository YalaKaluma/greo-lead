from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import logging
import sys
import os
import time
from urllib.parse import parse_qsl, urlencode
from datetime import datetime
from app.db import engine, SessionLocal
from app.routers import journal, tasks, nudge, journey, messages, habits, waitlist, onboarding, chat, priority, leadership_coaching_router, audio, meetings, projects, message_feedback, opportunities, message_signals, settings, admin, admin_operations, admin_cto, usage, home, notifications
from app.routers import auth
from sqlalchemy import text
import threading
from app.email_poller import run_email_loop
from app.security_middleware import (
    CsrfProtectionMiddleware,
    RateLimitMiddleware,
    SecurityHeadersMiddleware,
    trusted_application_origins,
)
from app.security_dependencies import require_authenticated_identity
from app.services.operations_director.health_events import record_exception, record_health_event
from app.utils.schema_readiness import verify_database_schema

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
logger.info(
    "Deployment marker: commit=%s service=%s environment=%s deployment=%s",
    os.getenv("RAILWAY_GIT_COMMIT_SHA") or os.getenv("GIT_COMMIT_SHA") or "unknown",
    os.getenv("RAILWAY_SERVICE_NAME") or "unknown",
    os.getenv("RAILWAY_ENVIRONMENT_NAME") or "unknown",
    os.getenv("RAILWAY_DEPLOYMENT_ID") or "unknown",
)
logger.info("=" * 70)

# --------------------------------------
# Environment Check
# --------------------------------------
logger.info("📋 Checking Environment Variables...")
required_vars = [
    "DATABASE_URL",
    "OPENAI_API_KEY",
    "DEFAULT_USER_NUMBER",
    "APP_SESSION_SECRET",
    "ALFRED_SCHEDULER_SECRET",
    "PUBLIC_APP_URL",
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
# Initialize App
# --------------------------------------
logger.info("⚙️  Initializing FastAPI application...")
app = FastAPI(
    title="Leadership OS API",
    version="3.0",
    description="AI-powered Chief of Staff for busy executives",
    docs_url="/docs" if os.getenv("ENABLE_API_DOCS", "").lower() in {"1", "true", "yes"} else None,
    redoc_url=None,
    openapi_url="/openapi.json" if os.getenv("ENABLE_API_DOCS", "").lower() in {"1", "true", "yes"} else None,
    redirect_slashes=True  # ← ADDED: Handle both /api/tasks and /api/tasks/
)


@app.exception_handler(StarletteHTTPException)
async def sanitized_http_exception_handler(request: Request, exc: StarletteHTTPException):
    """Never expose implementation errors from server-side failures."""

    if exc.status_code >= 500:
        logger.error(
            "Request failed method=%s path=%s status=%s error_type=%s",
            request.method,
            request.url.path,
            exc.status_code,
            type(exc).__name__,
        )
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": "The request could not be completed."},
        )
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail}, headers=exc.headers)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_request: Request, exc: RequestValidationError):
    # Values rejected by validation may contain credentials or private content.
    errors = [
        {key: value for key, value in error.items() if key not in {"input", "ctx"}}
        for error in exc.errors()
    ]
    return JSONResponse(status_code=422, content={"detail": errors})
logger.info("✓ FastAPI app created")

# --------------------------------------
# CORS middleware
# --------------------------------------
logger.info("🌐 Configuring CORS middleware...")
app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(trusted_application_origins()),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Alfred-Scheduler-Secret"],
)
logger.info("✓ CORS middleware configured for trusted application origins")


# --------------------------------------
# Security headers and rate limiting
# --------------------------------------
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(CsrfProtectionMiddleware)
app.add_middleware(RateLimitMiddleware)
logger.info("✓ Security headers and rate limiting configured")


# --------------------------------------
# Request logging middleware
# --------------------------------------
SENSITIVE_QUERY_KEYS = {
    "token",
    "access_token",
    "refresh_token",
    "code",
    "password",
    "secret",
    "api_key",
    "key",
    "authorization",
}


def _request_log_target(request: Request) -> str:
    if not request.url.query:
        return request.url.path

    safe_params = []
    for key, value in parse_qsl(request.url.query, keep_blank_values=True):
        if key.lower() in SENSITIVE_QUERY_KEYS:
            safe_params.append((key, "[REDACTED]"))
        else:
            safe_params.append((key, value))

    return f"{request.url.path}?{urlencode(safe_params)}"


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.perf_counter()
    log_target = _request_log_target(request)
    logger.info("Request started method=%s target=%s", request.method, log_target)
    try:
        response = await call_next(request)
    except Exception as exc:
        elapsed_ms = round((time.perf_counter() - start) * 1000)
        _record_system_health_event(
            event_type=_classify_exception_event(request.url.path, exc),
            severity="high",
            source="api",
            path=request.url.path,
            method=request.method,
            status_code=500,
            response_time_ms=elapsed_ms,
            message=type(exc).__name__,
            exc=exc,
        )
        logger.error(
            "Request raised an exception method=%s path=%s error_type=%s",
            request.method,
            request.url.path,
            type(exc).__name__,
        )
        raise

    elapsed_ms = round((time.perf_counter() - start) * 1000)
    logger.info(
        "Request completed method=%s target=%s status=%s",
        request.method,
        log_target,
        response.status_code,
    )
    if _should_record_system_health_event(request.url.path, response.status_code, elapsed_ms):
        _record_system_health_event(
            event_type=_classify_response_event(request.url.path, response.status_code, elapsed_ms),
            severity=_severity_for_response(response.status_code, elapsed_ms),
            source="api",
            path=request.url.path,
            method=request.method,
            status_code=response.status_code,
            response_time_ms=elapsed_ms,
            message=None if response.status_code < 400 else f"HTTP {response.status_code}",
        )
    return response


logger.info("✓ Request logging middleware configured")


def _should_record_system_health_event(path: str, status_code: int, elapsed_ms: int) -> bool:
    if not path.startswith("/api/"):
        return False
    return status_code >= 400 or elapsed_ms >= 2000


def _classify_response_event(path: str, status_code: int, elapsed_ms: int) -> str:
    path_lower = path.lower()
    if status_code in {401, 403} or ("auth" in path_lower and status_code >= 400):
        return "auth_failure"
    if status_code >= 500 and any(part in path_lower for part in ["chat", "journey", "priority", "nudge", "audio", "opportunities"]):
        return "openai_failure"
    if status_code >= 500 and any(part in path_lower for part in ["email", "invitation"]):
        return "email_failure"
    if status_code >= 500:
        return "api_error"
    if elapsed_ms >= 2000:
        return "slow_request"
    return "api_response"


def _classify_exception_event(path: str, exc: Exception) -> str:
    combined = f"{path} {type(exc).__name__} {exc}".lower()
    if "database" in combined or "sqlalchemy" in combined or "psycopg" in combined:
        return "database_failure"
    if "openai" in combined:
        return "openai_failure"
    if "gmail" in combined or "email" in combined:
        return "email_failure"
    return "api_error"


def _severity_for_response(status_code: int, elapsed_ms: int) -> str:
    if status_code >= 500:
        return "high"
    if status_code in {401, 403} or elapsed_ms >= 2000:
        return "medium"
    return "low"


def _record_system_health_event(
    event_type: str,
    severity: str,
    source: str,
    path: str,
    method: str,
    status_code: int,
    response_time_ms: int,
    message: str | None = None,
    exc: Exception | None = None,
) -> None:
    # Telemetry must not wait for a connection while user requests already
    # occupy the base pool. Skipping one event is safer than cascading stalls.
    try:
        pool_size = engine.pool.size()
        checked_out = engine.pool.checkedout()
        if pool_size and checked_out >= pool_size:
            logger.warning(
                "Skipping system health event because the DB pool is busy (%s/%s base connections checked out)",
                checked_out,
                pool_size,
            )
            return
    except (AttributeError, NotImplementedError):
        pass

    db = None
    try:
        db = SessionLocal()
        try:
            if exc:
                record_exception(
                    db,
                    source=source,
                    category=event_type,
                    severity=severity,
                    endpoint=path,
                    method=method,
                    status_code=status_code,
                    details={"response_time_ms": response_time_ms},
                    exc=exc,
                )
            else:
                record_health_event(
                    db,
                    source=source,
                    category=event_type,
                    severity=severity,
                    endpoint=path,
                    method=method,
                    status_code=status_code,
                    message=message,
                    details={"response_time_ms": response_time_ms},
                )
        finally:
            if db:
                db.close()
    except Exception as exc:
        logger.warning(
            "Could not record system health event error_type=%s",
            type(exc).__name__,
        )

# --------------------------------------
# Include API routers
# --------------------------------------
logger.info("🔌 Registering API routers...")
routers_to_register = [
    (journal.router, "/api/journal", "Journal", "authenticated"),
    (auth.router, "/api/auth", "Auth", "mixed"),
    (onboarding.public_router, "/api/onboarding", "Onboarding-Public", "public"),
    (onboarding.router, "/api/onboarding", "Onboarding", "authenticated"),
    (tasks.router, "/api/tasks", "Tasks", "authenticated"),
    (nudge.router, "/api", "Nudge", "scheduler"),
    (journey.router, "/api/journey", "Journey", "authenticated"),
    (messages.router, "/api", "Messages", "authenticated"),
    (waitlist.router, "/api", "Waitlist", "public"),
    (habits.router, "/api/habits", "Habits", "authenticated"),
    (chat.router, "/api", "Chat", "authenticated"),
    (settings.router, "/api", "Settings", "authenticated"),
    (notifications.router, "/api", "Notifications", "authenticated"),
    (admin.router, "/api/admin", "Admin", "admin"),
    (admin_operations.router, "/api/admin", "Admin-Operations", "admin"),
    (admin_cto.router, "/api/admin", "Admin-CTO", "admin"),
    (audio.router, "/api/audio", "Audio", "authenticated"),
    (meetings.router, "/api/meetings", "Meetings", "authenticated"),
    (projects.router, "/api/projects", "Projects", "authenticated"),
    (message_feedback.router, "/api", "Message-Feedback", "authenticated"),
    (message_signals.router, "/api/message-signals", "Message-Signals", "authenticated"),
    (usage.router, "/api", "Usage", "authenticated"),
    (opportunities.router, "/api/opportunities", "Opportunities", "authenticated"),
    (priority.router, "/api/priority", "Priority", "authenticated"),
    (home.router, "/api/home", "Home", "authenticated"),
    (leadership_coaching_router.router, "/api/leadership-coaching", "Leadership-Coaching", "authenticated"),
]



for router, prefix, tag, access_class in routers_to_register:
    try:
        dependencies = [Depends(require_authenticated_identity)] if access_class == "authenticated" else None
        app.include_router(router, prefix=prefix, tags=[tag], dependencies=dependencies)
        logger.info(f"  ✓ {tag} router registered at {prefix} ({access_class})")
    except Exception as e:
        logger.error("Failed to register router tag=%s error_type=%s", tag, type(e).__name__)

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
    except Exception:
        db_status = "error"
        db_test = "failed"

    response = {
        "status": "ok" if db_status == "connected" else "error",
        "service": "Leadership OS",
        "version": "3.0",
        "timestamp": datetime.now().isoformat(),
        "database": db_status,
        "database_test": db_test,
    }

    logger.info(f"🏥 Health check called - Status: {response['status']}, DB: {db_status}")
    return JSONResponse(status_code=200 if db_status == "connected" else 503, content=response)


logger.info("✓ Health check endpoints configured")

# --------------------------------------
# Serve React static files
# --------------------------------------
logger.info("📁 Configuring static file serving...")
static_path = Path(__file__).parent.parent / "static"
static_root = static_path.resolve()
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
        logger.error("Could not inspect static directory error_type=%s", type(e).__name__)

    # Mount assets
    assets_path = static_path / "assets"
    if assets_path.exists():
        try:
            app.mount("/assets", StaticFiles(directory=str(assets_path)), name="assets")

            # Count asset files
            asset_files = list(assets_path.glob("*"))
            logger.info(f"  ✓ Assets mounted at /assets ({len(asset_files)} files)")
            logger.info(f"  Frontend JS assets: {[asset.name for asset in asset_files if asset.suffix == '.js']}")
        except Exception as e:
            logger.error("Failed to mount assets error_type=%s", type(e).__name__)
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
        file_path = (static_root / full_path).resolve()
        if not file_path.is_relative_to(static_root):
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Not found")
        if file_path.is_file():
            logger.info("Serving static file")
            return FileResponse(str(file_path))

        # Serve React app for everything else (including root "/")
        index_file = static_path / "index.html"
        if index_file.exists():
            logger.info("Serving React application")
            return FileResponse(str(index_file))

        logger.error("React app requested but index.html is unavailable")
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
    revision = verify_database_schema(engine)
    logger.info("Database readiness verified revision=%s", revision)
    if os.getenv("SKIP_STARTUP_TASKS", "").lower() in {"1", "true", "yes"}:
        logger.info("Startup background tasks skipped by SKIP_STARTUP_TASKS")
        return
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
logger.info("   • Tasks:       /api/tasks")
logger.info("   • Journey:     /api/journey")
logger.info("=" * 70)
logger.info("🎯 Ready to serve requests!")
logger.info("=" * 70)
