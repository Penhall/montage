"""Supabase client singleton.

Provides two clients:
- ``supabase_client`` — the anonymous client (RLS-enforced, used for
  endpoints that proxy the user's token).
- ``supabase_admin`` — the service-role client (bypasses RLS, used
  internally by the pipeline and admin operations).

Both are initialised lazily on first access.
"""

from __future__ import annotations

import logging
from typing import Any

from supabase import Client, create_client

from backend.config import settings

logger = logging.getLogger(__name__)

_client: Client | None = None
_admin: Client | None = None


def get_client() -> Client:
    """Return the anonymous Supabase client (RLS-enforced)."""
    global _client  # noqa: PLW0603
    if _client is None:
        logger.info("Initialising Supabase anonymous client …")
        _client = create_client(settings.supabase_url, settings.supabase_anon_key)
    return _client


def get_admin() -> Client:
    """Return the service-role Supabase client (bypasses RLS)."""
    global _admin  # noqa: PLW0603
    if _admin is None:
        logger.info("Initialising Supabase service-role client …")
        _admin = create_client(
            settings.supabase_url,
            settings.supabase_service_role_key,
        )
        _admin.auth.admin  # eager-check the client isn't broken  # noqa: B018
    return _admin


async def fetch_one(
    table: str,
    eq_column: str,
    eq_value: Any,
    *,
    admin: bool = False,
) -> dict[str, Any] | None:
    """Fetch a single row from *table* where *eq_column* == *eq_value*.

    Returns the row dict, or ``None`` when no match is found.
    """
    client = get_admin() if admin else get_client()
    result = client.table(table).select("*").eq(eq_column, eq_value).limit(1).execute()
    rows = result.data
    return rows[0] if rows else None


async def fetch_many(
    table: str,
    *,
    order_column: str = "created_at",
    order_desc: bool = True,
    eq_column: str | None = None,
    eq_value: Any = None,
    limit: int = 50,
    admin: bool = False,
) -> list[dict[str, Any]]:
    """Fetch multiple rows, optionally filtered and ordered."""
    client = get_admin() if admin else get_client()
    query = client.table(table).select("*")
    if eq_column is not None:
        query = query.eq(eq_column, eq_value)
    query = query.order(order_column, desc=order_desc).limit(limit)
    result = query.execute()
    return result.data
