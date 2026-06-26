"""JWT validation middleware (HS256, local).

Validates the ``Authorization: Bearer *** header and injects
``request.state.user_id`` into every request.

Public endpoints (health, webhooks, auth) are excluded.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

import jwt
from fastapi import Request, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.types import ASGIApp

from backend.config import settings

logger = logging.getLogger(__name__)

PUBLIC_PATHS = frozenset({
    "/api/health",
    "/api/auth/signup",
    "/api/auth/login",
    "/api/webhook/stripe",
    "/docs",
    "/openapi.json",
    "/redoc",
})


class AuthMiddleware(BaseHTTPMiddleware):
    """Validates Montage HS256 JWT on every request except public paths."""

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> JSONResponse:
        path = request.url.path

        # ── Skip auth for public paths ────────────────────────────────
        if path in PUBLIC_PATHS or path.startswith(("/docs", "/openapi.json", "/redoc")):
            return await call_next(request)  # type: ignore[return-value]

        # ── Extract Bearer token ──────────────────────────────────────
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return JSONResponse(
                {"detail": "Missing or malformed Authorization header"},
                status_code=status.HTTP_401_UNAUTHORIZED,
            )
        token = auth_header.removeprefix("Bearer ").strip()

        if not token:
            return JSONResponse(
                {"detail": "Empty token"},
                status_code=status.HTTP_401_UNAUTHORIZED,
            )

        # ── Validate JWT ──────────────────────────────────────────────
        try:
            payload = jwt.decode(
                token,
                settings.jwt_secret,
                algorithms=[settings.jwt_algorithm],
                options={"require": ["exp", "sub"]},
            )
        except jwt.ExpiredSignatureError:
            return JSONResponse(
                {"detail": "Token expired"},
                status_code=status.HTTP_401_UNAUTHORIZED,
            )
        except jwt.PyJWTError as exc:
            logger.warning("JWT validation failed: %s", exc)
            return JSONResponse(
                {"detail": "Invalid token"},
                status_code=status.HTTP_401_UNAUTHORIZED,
            )

        request.state.user_id = payload["sub"]
        request.state.token_payload = payload
        return await call_next(request)  # type: ignore[return-value]


# ── Token generation ──────────────────────────────────────────────────


def create_token(user_id: str, email: str, is_admin: bool = False) -> str:
    """Generate a JWT for the given user."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "email": email,
        "is_admin": is_admin,
        "iat": now,
        "exp": now.timestamp() + settings.jwt_expire_minutes * 60,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
