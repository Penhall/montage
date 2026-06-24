"""Montage Backend — FastAPI application entry point.

Initialises the ASGI app, registers middleware and routers, and provides
the ``uvicorn.run()`` entry point.
"""

from __future__ import annotations

import logging
import sys

import structlog
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.auth import AuthMiddleware
from backend.config import settings
from backend.middleware.tier_limit import TierLimitMiddleware

# ── Logging ────────────────────────────────────────────────────────────

def _configure_logging() -> None:
    """Configure structured logging with structlog."""
    timestamper = structlog.processors.TimeStamper(fmt="iso")

    structlog.configure(
        processors=[
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            timestamper,
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.dev.ConsoleRenderer(),
        ],
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=getattr(logging, settings.log_level.upper(), logging.INFO),
    )


_configure_logging()
logger = structlog.get_logger()


# ── Application ────────────────────────────────────────────────────────

app = FastAPI(
    title="Montage Backend",
    description="AI Video Production SaaS — backend API",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)


# ── CORS ───────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://localhost:3000",
        # Production frontend URLs go here
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Custom Middleware ──────────────────────────────────────────────────

# Order matters: AuthMiddleware runs first, then TierLimitMiddleware
app.add_middleware(AuthMiddleware)  # validates JWT, sets request.state.user_id
app.add_middleware(TierLimitMiddleware)  # rate-limits POST /api/jobs


# ── Routers ────────────────────────────────────────────────────────────

from backend.routes.health import router as health_router
from backend.routes.auth_me import router as auth_me_router
from backend.routes.jobs import router as jobs_router
from backend.routes.videos import router as videos_router
from backend.routes.checkout import router as checkout_router

app.include_router(health_router)
app.include_router(auth_me_router)
app.include_router(jobs_router)
app.include_router(videos_router)
app.include_router(checkout_router)


# ── Startup / Shutdown ─────────────────────────────────────────────────

@app.on_event("startup")
async def on_startup() -> None:
    """Log on startup and verify critical env vars."""
    logger.info(
        "Starting Montage Backend",
        version="0.1.0",
        supabase_url=settings.supabase_url,
    )
    missing = []
    if not settings.supabase_service_role_key:
        missing.append("SUPABASE_SERVICE_ROLE_KEY")
    if not settings.supabase_anon_key:
        missing.append("SUPABASE_ANON_KEY")
    if missing:
        logger.warning("Missing required env vars", vars=missing)


# ── Entry Point ────────────────────────────────────────────────────────

def main() -> None:
    """Run the Uvicorn server."""
    uvicorn.run(
        "backend.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=True,
        log_level=settings.log_level.lower(),
    )


if __name__ == "__main__":
    main()
