"""Rate-limiting middleware by user tier.

Checks the user's monthly video limit before allowing job creation.
Exempts pro and enterprise tiers from rate checks.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from fastapi import HTTPException, Request, status
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.types import ASGIApp

from backend.db import get_admin

logger = logging.getLogger(__name__)

TIER_LIMITS = {
    "free": 3,
    "pro": 50,
    "enterprise": 9999,
}


class TierLimitMiddleware(BaseHTTPMiddleware):
    """Check user tier limit before POST /api/jobs."""

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> ...:  # noqa: ANN401
        # Only apply to POST /api/jobs
        if request.method == "POST" and request.url.path == "/api/jobs":
            user_id = getattr(request.state, "user_id", None)
            if user_id:
                await self._check_limit(user_id)

        return await call_next(request)

    async def _check_limit(self, user_id: str) -> None:
        """Check and optionally block based on tier."""
        admin = get_admin()

        # Fetch tier record
        result = admin.table("montage_user_tiers").select("*").eq("user_id", user_id).limit(1).execute()
        rows = result.data
        if not rows:
            logger.warning("No tier record for user %s — using free limits", user_id)
            return

        tier_data = rows[0]
        tier: str = tier_data.get("tier", "free")
        limit = TIER_LIMITS.get(tier, 3)

        if limit >= 9999:
            return  # unlimited tier

        # Count jobs this month
        reset_at = tier_data.get("reset_at")
        now = datetime.now(timezone.utc)

        # Parse reset_at
        if reset_at:
            if isinstance(reset_at, str):
                reset_at_dt = datetime.fromisoformat(reset_at.replace("Z", "+00:00"))
            else:
                reset_at_dt = reset_at
        else:
            reset_at_dt = now

        # Count montage_videos created after the reset date
        count_result = (
            admin.table("montage_videos")
            .select("id", count="exact")
            .eq("user_id", user_id)
            .gte("created_at", reset_at_dt.isoformat())
            .execute()
        )
        count = count_result.count or 0

        if count >= limit:
            logger.warning("User %s hit tier limit: %d/%d", user_id, count, limit)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "message": "Monthly video limit reached. Upgrade your plan.",
                    "tier": tier,
                    "limit": limit,
                    "used": count,
                },
            )
