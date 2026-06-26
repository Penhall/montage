"""Rate-limiting middleware by user tier.

Checks the user's monthly video limit before allowing job creation.
Exempts pro and enterprise tiers from rate checks.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import HTTPException, Request, status
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.types import ASGIApp

from backend.db import fetch_one, get_pool

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
        pool = await get_pool()

        # Fetch user tier from users table
        user = await fetch_one("users", eq_column="id", eq_value=user_id)
        if user is None:
            logger.warning("No user record for %s — allowing", user_id)
            return

        tier: str = user.get("tier", "free")
        limit = TIER_LIMITS.get(tier, 3)

        if limit >= 9999:
            return  # unlimited tier

        # Count videos created after reset_at
        now = datetime.now(timezone.utc)
        reset_at = user.get("reset_at") or now
        if isinstance(reset_at, str):
            reset_at = datetime.fromisoformat(reset_at.replace("Z", "+00:00"))

        row = await pool.fetchrow(
            "SELECT COUNT(*) as count FROM videos "
            "WHERE user_id = $1 AND created_at >= $2",
            user_id,
            reset_at.isoformat(),
        )
        count = row["count"] if row else 0

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
