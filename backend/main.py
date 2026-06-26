"""Montage Backend — FastAPI application entry point.

Initialises the ASGI app, registers middleware and routers, and provides
the ``uvicorn.run()`` entry point.
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path

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
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Custom Middleware ──────────────────────────────────────────────────

app.add_middleware(AuthMiddleware)
app.add_middleware(TierLimitMiddleware)


# ── Routers ────────────────────────────────────────────────────────────

from backend.routes.auth import router as auth_router
from backend.routes.auth_me import router as auth_me_router
from backend.routes.checkout import router as checkout_router
from backend.routes.health import router as health_router
from backend.routes.jobs import router as jobs_router
from backend.routes.videos import router as videos_router

app.include_router(auth_router)
app.include_router(auth_me_router)
app.include_router(checkout_router)
app.include_router(health_router)
app.include_router(jobs_router)
app.include_router(videos_router)


# ── Startup / Shutdown ─────────────────────────────────────────────────


@app.on_event("startup")
async def on_startup() -> None:
    """Ensure directories exist and log startup."""
    settings.videos_dir.mkdir(parents=True, exist_ok=True)
    logger.info(
        "Starting Montage Backend",
        version="0.1.0",
        database_url=settings.database_url.split("@")[1] if "@" in settings.database_url else "…",
        videos_dir=str(settings.videos_dir),
    )


@app.on_event("shutdown")
async def on_shutdown() -> None:
    """Close the asyncpg connection pool."""
    from backend.db import close_pool

    await close_pool()
    logger.info("Montage Backend shut down")


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
