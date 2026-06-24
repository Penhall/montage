"""Endpoints for /api/videos.

- GET  /api/videos            — list user's videos
- GET  /api/videos/{id}       — full metadata
- GET  /api/videos/{id}/download — redirect to signed Supabase Storage URL
- DELETE /api/videos/{id}     — delete video + storage file
"""

from __future__ import annotations

import logging
from datetime import datetime

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import RedirectResponse

from backend.db import fetch_many, fetch_one, get_admin
from backend.models import Video, VideoSummary

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/api/videos", response_model=list[VideoSummary], tags=["Videos"])
async def list_videos(request: Request) -> list[VideoSummary]:
    """List all videos for the authenticated user (newest first)."""
    user_id: str = request.state.user_id

    rows = await fetch_many(
        "montage_videos",
        eq_column="user_id",
        eq_value=user_id,
        order_column="created_at",
        order_desc=True,
        admin=True,
    )

    admin = get_admin()

    result: list[VideoSummary] = []
    for r in rows:
        created = _parse_dt(r.get("created_at"))

        # Generate signed download URL
        storage_path: str = r.get("storage_path", "")
        download_url: str | None = None
        if storage_path:
            try:
                signed = admin.storage.from_("montage-videos").create_signed_url(
                    storage_path, expires_in=3600
                )
                download_url = signed.get("signedURL") or signed.get("url")
            except Exception as exc:
                logger.warning("Failed to create signed URL for %s: %s", storage_path, exc)

        # Thumbnail URL
        thumbnail_url: str | None = None
        thumb_path = r.get("thumbnail_path")
        if thumb_path:
            try:
                signed_thumb = admin.storage.from_("montage-videos").create_signed_url(
                    thumb_path, expires_in=86400
                )
                thumbnail_url = signed_thumb.get("signedURL") or signed_thumb.get("url")
            except Exception as exc:
                logger.warning("Failed to create thumb signed URL: %s", exc)

        result.append(
            VideoSummary(
                id=r["id"],
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

    row = await fetch_one("montage_videos", eq_column="id", eq_value=video_id, admin=True)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")
    if row["user_id"] != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    return Video(
        id=row["id"],
        job_id=row["job_id"],
        user_id=row["user_id"],
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
    """Redirect to a signed Supabase Storage URL for direct download."""
    user_id: str = request.state.user_id
    admin = get_admin()

    row = await fetch_one("montage_videos", eq_column="id", eq_value=video_id, admin=True)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")
    if row["user_id"] != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    storage_path: str = row.get("storage_path", "")
    if not storage_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No storage path for this video")

    try:
        signed = admin.storage.from_("montage-videos").create_signed_url(
            storage_path, expires_in=3600
        )
        url = signed.get("signedURL") or signed.get("url")
        if not url:
            raise ValueError("No URL in response")
    except Exception as exc:
        logger.error("Failed to create signed download URL: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate download link",
        ) from exc

    return RedirectResponse(url=url, status_code=status.HTTP_302_FOUND)


@router.delete("/api/videos/{video_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Videos"])
async def delete_video(video_id: str, request: Request) -> None:
    """Delete video metadata and the underlying storage file."""
    user_id: str = request.state.user_id
    admin = get_admin()

    row = await fetch_one("montage_videos", eq_column="id", eq_value=video_id, admin=True)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")
    if row["user_id"] != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    # Delete storage file
    storage_path = row.get("storage_path")
    if storage_path:
        try:
            admin.storage.from_("montage-videos").remove([storage_path])
        except Exception as exc:
            logger.warning("Failed to remove storage file %s: %s", storage_path, exc)

    thumb_path = row.get("thumbnail_path")
    if thumb_path:
        try:
            admin.storage.from_("montage-videos").remove([thumb_path])
        except Exception as exc:
            logger.warning("Failed to remove thumbnail %s: %s", thumb_path, exc)

    # Delete row
    admin.table("montage_videos").delete().eq("id", video_id).execute()
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
