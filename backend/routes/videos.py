"""Endpoints for /api/videos — local filesystem storage."""

from __future__ import annotations

import logging
import os
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import FileResponse, RedirectResponse

from backend.config import settings
from backend.db import delete, fetch_many, fetch_one
from backend.models import Video, VideoSummary

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/api/videos", response_model=list[VideoSummary], tags=["Videos"])
async def list_videos(request: Request) -> list[VideoSummary]:
    """List all videos for the authenticated user (newest first)."""
    user_id: str = request.state.user_id

    rows = await fetch_many(
        "videos",
        eq_column="user_id",
        eq_value=user_id,
        order_column="created_at",
        order_desc=True,
    )

    result: list[VideoSummary] = []
    for r in rows:
        created = _parse_dt(r.get("created_at"))

        # Build local download/thumbnail URLs
        video_id = str(r["id"])
        download_url = f"/api/videos/{video_id}/download"
        thumbnail_url = f"/api/videos/{video_id}/thumbnail"

        result.append(
            VideoSummary(
                id=video_id,
                title=r.get("title", "Untitled"),
                thumbnail_url=thumbnail_url,
                duration_s=r.get("duration_s"),
                created_at=created,
                download_url=download_url,
            )
        )

    return result


@router.get("/api/videos/{video_id}", response_model=Video, tags=["Videos"])
async def get_video(video_id: str, request: Request) -> Video:
    """Return full video metadata."""
    user_id: str = request.state.user_id

    row = await fetch_one("videos", eq_column="id", eq_value=video_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Video not found"
        )
    if str(row["user_id"]) != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Access denied"
        )

    return Video(
        id=str(row["id"]),
        job_id=str(row["job_id"]) if row.get("job_id") else None,
        user_id=str(row["user_id"]),
        title=row.get("title", "Untitled"),
        storage_path=row.get("storage_path", ""),
        thumbnail_path=row.get("thumbnail_path"),
        duration_s=row.get("duration_s"),
        platform_profile=row.get("platform_profile", "tiktok_9_16"),
        style_playbook=row.get("style_playbook", "clean_professional"),
        size_bytes=row.get("size_bytes"),
        created_at=_parse_dt(row.get("created_at")),
        expires_at=_parse_dt(row.get("expires_at")),
    )


@router.get("/api/videos/{video_id}/download", tags=["Videos"])
async def download_video(video_id: str, request: Request):
    """Serve the video file directly from local filesystem."""
    user_id: str = request.state.user_id

    row = await fetch_one("videos", eq_column="id", eq_value=video_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Video not found"
        )
    if str(row["user_id"]) != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Access denied"
        )

    storage_path: str = row.get("storage_path", "")
    if not storage_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No storage path for this video",
        )

    full_path = settings.videos_dir / storage_path
    if not full_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Video file not found on disk",
        )

    return FileResponse(
        path=str(full_path),
        media_type="video/mp4",
        filename=row.get("title", "video") + ".mp4",
    )


@router.get("/api/videos/{video_id}/thumbnail", tags=["Videos"])
async def video_thumbnail(video_id: str, request: Request):
    """Serve the video thumbnail from local filesystem."""
    user_id: str = request.state.user_id

    row = await fetch_one("videos", eq_column="id", eq_value=video_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Video not found"
        )
    if str(row["user_id"]) != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Access denied"
        )

    thumb_path = row.get("thumbnail_path")
    if not thumb_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No thumbnail"
        )

    full_path = settings.videos_dir / thumb_path
    if not full_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Thumbnail file not found on disk",
        )

    return FileResponse(path=str(full_path), media_type="image/jpeg")


@router.delete(
    "/api/videos/{video_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["Videos"],
)
async def delete_video(video_id: str, request: Request) -> None:
    """Delete video metadata and local files."""
    user_id: str = request.state.user_id

    row = await fetch_one("videos", eq_column="id", eq_value=video_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Video not found"
        )
    if str(row["user_id"]) != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Access denied"
        )

    # Remove local files
    for field in ("storage_path", "thumbnail_path"):
        filepath = row.get(field)
        if filepath:
            full_path = settings.videos_dir / filepath
            try:
                os.remove(full_path)
            except FileNotFoundError:
                pass
            except OSError as exc:
                logger.warning("Failed to remove %s: %s", filepath, exc)

    await delete("videos", id_=video_id)
    logger.info("Video %s deleted by user %s", video_id, user_id)


# ── Helpers ────────────────────────────────────────────────────────────


def _parse_dt(val: str | None) -> datetime | None:
    if val is None:
        return None
    if isinstance(val, datetime):
        return val
    try:
        return datetime.fromisoformat(val.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None
