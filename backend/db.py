"""PostgreSQL async connection pool and query helpers."""

from __future__ import annotations

import logging
from typing import Any

import asyncpg

from backend.config import settings

logger = logging.getLogger(__name__)

_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    """Return the global asyncpg connection pool (lazy init)."""
    global _pool
    if _pool is None:
        logger.info("Initialising asyncpg connection pool …")
        _pool = await asyncpg.create_pool(
            settings.database_url,
            min_size=2,
            max_size=10,
            command_timeout=30,
        )
    return _pool


async def close_pool() -> None:
    """Close the connection pool (called on shutdown)."""
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
        logger.info("asyncpg pool closed")


# ── Generic query helpers ────────────────────────────────────────────


async def fetch_one(
    table: str,
    eq_column: str,
    eq_value: Any,
    *,
    columns: str = "*",
) -> dict[str, Any] | None:
    """Fetch a single row."""
    pool = await get_pool()
    query = f'SELECT {columns} FROM {table} WHERE {eq_column} = $1 LIMIT 1'
    row = await pool.fetchrow(query, eq_value)
    return dict(row) if row else None


async def fetch_many(
    table: str,
    *,
    order_column: str = "created_at",
    order_desc: bool = True,
    eq_column: str | None = None,
    eq_value: Any = None,
    limit: int = 50,
    columns: str = "*",
) -> list[dict[str, Any]]:
    """Fetch multiple rows, optionally filtered and ordered."""
    pool = await get_pool()
    direction = "DESC" if order_desc else "ASC"
    if eq_column is not None:
        query = (
            f"SELECT {columns} FROM {table} "
            f"WHERE {eq_column} = $1 "
            f"ORDER BY {order_column} {direction} "
            f"LIMIT {limit}"
        )
        rows = await pool.fetch(query, eq_value)
    else:
        query = (
            f"SELECT {columns} FROM {table} "
            f"ORDER BY {order_column} {direction} "
            f"LIMIT {limit}"
        )
        rows = await pool.fetch(query)
    return [dict(r) for r in rows]


async def insert(table: str, data: dict[str, Any]) -> dict[str, Any]:
    """Insert a row and return it."""
    pool = await get_pool()
    columns = list(data.keys())
    placeholders = [f"${i + 1}" for i in range(len(columns))]
    values = list(data.values())
    query = (
        f"INSERT INTO {table} ({', '.join(columns)}) "
        f"VALUES ({', '.join(placeholders)}) "
        f"RETURNING *"
    )
    row = await pool.fetchrow(query, *values)
    return dict(row)


async def update(
    table: str,
    id_: Any,
    data: dict[str, Any],
    id_column: str = "id",
) -> dict[str, Any] | None:
    """Update a row by ID and return it."""
    pool = await get_pool()
    sets = [f"{col} = ${i + 1}" for i, col in enumerate(data.keys())]
    values = list(data.values()) + [id_]
    query = (
        f"UPDATE {table} SET {', '.join(sets)} "
        f"WHERE {id_column} = ${len(values)} "
        f"RETURNING *"
    )
    row = await pool.fetchrow(query, *values)
    return dict(row) if row else None


async def delete(table: str, id_: Any, id_column: str = "id") -> bool:
    """Delete a row by ID. Returns True if deleted."""
    pool = await get_pool()
    query = f"DELETE FROM {table} WHERE {id_column} = $1"
    result = await pool.execute(query, id_)
    # execute() returns "DELETE N" string, parse it
    return "DELETE 1" in result


async def execute(query: str, *args: Any) -> str:
    """Execute raw SQL (INSERT/UPDATE/DELETE without RETURNING)."""
    pool = await get_pool()
    return await pool.execute(query, *args)
