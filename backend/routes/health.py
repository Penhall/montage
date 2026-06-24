"""GET /api/health — health check endpoint."""

from __future__ import annotations

from fastapi import APIRouter

from backend.models import HealthResponse

router = APIRouter()


@router.get("/api/health", response_model=HealthResponse, tags=["System"])
async def health_check() -> HealthResponse:
    """Return service health status."""
    return HealthResponse()
