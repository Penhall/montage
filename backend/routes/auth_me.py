"""GET /api/me — return current user profile with tier info."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request, status

from backend.db import fetch_one
from backend.models import MeResponse, UserTier

logger = logging.getLogger(__name__)

router = APIRouter()

TIER_LIMITS = {
    UserTier.free: 3,
    UserTier.pro: 50,
    UserTier.enterprise: 9999,
}


@router.get("/api/me", response_model=MeResponse, tags=["Auth"])
async def get_me(request: Request) -> MeResponse:
    """Return the authenticated user's profile and tier info."""
    user_id: str = request.state.user_id

    # Fetch user from local users table (tier info is inline)
    user = await fetch_one("users", eq_column="id", eq_value=user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    email = user.get("email")
    tier = UserTier(user.get("tier", "free"))
    videos_this_month = user.get("videos_this_month", 0)

    return MeResponse(
        id=user_id,
        email=email,
        tier=tier,
        videos_this_month=videos_this_month,
        videos_limit=TIER_LIMITS.get(tier, 3),
    )
