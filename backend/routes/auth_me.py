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
    """Return the authenticated user's profile and tier info.

    Requires a valid Supabase JWT in the Authorization header.
    """
    user_id: str = request.state.user_id

    # Fetch from Supabase Auth user metadata (email)
    email: str | None = None
    payload = getattr(request.state, "token_payload", {})
    if payload:
        email = payload.get("email") or payload.get("user_metadata", {}).get("email")

    # Fetch tier record
    tier_data = await fetch_one(
        "montage_user_tiers",
        eq_column="user_id",
        eq_value=user_id,
        admin=True,
    )

    if tier_data:
        tier = UserTier(tier_data.get("tier", "free"))
        videos_this_month = tier_data.get("videos_this_month", 0)
    else:
        tier = UserTier.free
        videos_this_month = 0

    return MeResponse(
        id=user_id,
        email=email,
        tier=tier,
        videos_this_month=videos_this_month,
        videos_limit=TIER_LIMITS.get(tier, 3),
    )
