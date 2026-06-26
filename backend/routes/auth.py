"""Auth endpoints — local signup and login with bcrypt."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, status
import bcrypt as _bcrypt

from backend.auth import create_token
from backend.db import fetch_one, insert

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["Auth"])


@router.post("/signup", status_code=status.HTTP_201_CREATED)
async def signup(body: dict) -> dict:
    """Create a new user account."""
    email: str = body.get("email", "").strip().lower()
    password: str = body.get("password", "")

    if not email or "@" not in email:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Valid email required",
        )
    if not password or len(password) < 8:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Password must be at least 8 characters",
        )

    # Check uniqueness
    existing = await fetch_one("users", eq_column="email", eq_value=email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    password_hash = _bcrypt.hashpw(
        password.encode(), _bcrypt.gensalt()
    ).decode()
    is_admin = body.get("is_admin", False)
    user = await insert("users", {
        "email": email,
        "password_hash": password_hash,
        "name": body.get("name", email.split("@")[0]),
        "is_admin": is_admin,
    })

    token = create_token(str(user["id"]), email, user.get("is_admin", False))
    logger.info("User signed up: %s (admin=%s)", email, user.get("is_admin"))
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"id": str(user["id"]), "email": email, "tier": user["tier"], "is_admin": user.get("is_admin", False)},
    }


@router.post("/login")
async def login(body: dict) -> dict:
    """Authenticate and return a JWT."""
    email: str = body.get("email", "").strip().lower()
    password: str = body.get("password", "")

    if not email or not password:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Email and password required",
        )

    user = await fetch_one("users", eq_column="email", eq_value=email)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    if not _bcrypt.checkpw(password.encode(), user["password_hash"].encode()):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    token = create_token(str(user["id"]), email, user.get("is_admin", False))
    logger.info("User logged in: %s", email)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"id": str(user["id"]), "email": email, "tier": user["tier"], "is_admin": user.get("is_admin", False)},
    }
