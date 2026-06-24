"""Supabase JWT validation middleware.

Validates the ``Authorization: Bearer <token>`` header against
Supabase's JWKS endpoint and injects ``request.state.user_id``
and ``request.state.token_payload`` into every request.

Public endpoints (health, webhooks) are excluded.
"""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx
import jwt
from fastapi import HTTPException, Request, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.types import ASGIApp

from backend.config import settings

logger = logging.getLogger(__name__)

JWKS_URL = f"{settings.supabase_url}/auth/v1/jwks"
JWKS_CACHE: dict[str, Any] = {"keys": None, "fetched_at": 0.0}
JWKS_TTL_S = 3600  # re-fetch every hour


# ── Helpers ────────────────────────────────────────────────────────────

async def _fetch_jwks() -> list[dict[str, Any]]:
    """Fetch JWKS from Supabase and cache it."""
    now = time.monotonic()
    if JWKS_CACHE["keys"] and (now - JWKS_CACHE["fetched_at"]) < JWKS_TTL_S:
        return JWKS_CACHE["keys"]  # type: ignore[return-value]

    async with httpx.AsyncClient() as client:
        resp = await client.get(JWKS_URL, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        keys = data.get("keys", [])
        JWKS_CACHE["keys"] = keys
        JWKS_CACHE["fetched_at"] = now
        logger.info("Fetched JWKS (%d key(s))", len(keys))
        return keys


def _get_signing_key(kid: str, jwks: list[dict[str, Any]]) -> jwt.PyJWK | None:
    """Return the matching JWK for a given key ID."""
    for jwk_dict in jwks:
        if jwk_dict.get("kid") == kid:
            return jwt.PyJWK(jwk_dict, algorithm="RS256")
    return None


PUBLIC_PATHS = frozenset({
    "/api/health",
    "/api/webhook/stripe",
    "/docs",
    "/openapi.json",
    "/redoc",
})


# ── Middleware ─────────────────────────────────────────────────────────

class AuthMiddleware(BaseHTTPMiddleware):
    """Validates Supabase JWT on every request except public paths."""

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
            unverified = jwt.decode(token, options={"verify_signature": False})
            kid = unverified.get("kid") or _extract_kid(token)
            jwks = await _fetch_jwks()
            signing_key = _get_signing_key(kid, jwks) if kid else None
            if signing_key is None:
                # fallback: try without kid — iterate all keys
                for jwk_dict in jwks:
                    try:
                        sk = jwt.PyJWK(jwk_dict, algorithm="RS256")
                        payload = jwt.decode(
                            token,
                            sk.key,
                            algorithms=["RS256"],
                            audience="authenticated",
                            options={"require": ["exp", "sub"]},
                        )
                        break
                    except jwt.PyJWTError:
                        continue
                else:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Unable to verify token with any JWKS key",
                    )
            else:
                payload = jwt.decode(
                    token,
                    signing_key.key,
                    algorithms=["RS256"],
                    audience="authenticated",
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

        request.state.user_id = payload.get("sub") or payload.get("id")
        request.state.token_payload = payload
        return await call_next(request)  # type: ignore[return-value]


def _extract_kid(token: str) -> str | None:
    """Extract the *kid* from the JWT header without full verification."""
    try:
        headers = jwt.get_unverified_header(token)
        return headers.get("kid")
    except Exception:
        return None
