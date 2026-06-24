"""Upload stage.

Uploads the rendered MP4 and optional thumbnail to Supabase Storage,
then creates the corresponding ``montage_videos`` database row.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

from backend.db import get_admin

logger = logging.getLogger(__name__)

STORAGE_BUCKET = "montage-videos"


async def upload_video(
    video_path: Path,
    thumbnail_path: Path | None,
    job_id: str,
    user_id: str,
    title: str,
    duration_s: int | None = None,
    platform_profile: str = "tiktok_9_16",
    style_playbook: str = "clean_professional",
) -> dict:
    """Upload video (and optional thumbnail) to Supabase Storage.

    Creates a ``montage_videos`` row and returns it.
    """
    admin = get_admin()
    now = datetime.now(timezone.utc)

    storage_prefix = f"{user_id}/{job_id}"

    # ── Upload video ──────────────────────────────────────────────────
    video_storage_path = f"{storage_prefix}/output.mp4"
    logger.info("Upload stage: uploading video (%d bytes) to %s", video_path.stat().st_size, video_storage_path)

    with video_path.open("rb") as f:
        video_result = admin.storage.from_(STORAGE_BUCKET).upload(
            path=video_storage_path,
            file=f,
            file_options={"content-type": "video/mp4", "upsert": "true"},
        )
    logger.debug("Video upload result: %s", video_result)

    # ── Upload thumbnail (optional) ───────────────────────────────────
    thumbnail_storage_path: str | None = None
    if thumbnail_path and thumbnail_path.exists():
        thumbnail_storage_path = f"{storage_prefix}/thumbnail.jpg"
        with thumbnail_path.open("rb") as f:
            thumb_result = admin.storage.from_(STORAGE_BUCKET).upload(
                path=thumbnail_storage_path,
                file=f,
                file_options={"content-type": "image/jpeg", "upsert": "true"},
            )
        logger.debug("Thumbnail upload result: %s", thumb_result)
    else:
        logger.info("No thumbnail provided for job %s", job_id)

    # ── Compute file size ─────────────────────────────────────────────
    size_bytes = video_path.stat().st_size

    # ── Create database row ───────────────────────────────────────────
    expires_at = now + timedelta(days=30)  # videos expire after 30 days

    row = (
        admin.table("montage_videos")
        .insert({
            "job_id": job_id,
            "user_id": user_id,
            "title": title,
            "storage_path": video_storage_path,
            "thumbnail_path": thumbnail_storage_path,
            "duration_s": duration_s,
            "platform_profile": platform_profile,
            "style_playbook": style_playbook,
            "size_bytes": size_bytes,
            "created_at": now.isoformat(),
            "expires_at": expires_at.isoformat(),
        })
        .execute()
    )

    if not row.data:
        raise RuntimeError(f"Failed to insert video row for job {job_id}")

    video_row = row.data[0]
    logger.info("Upload complete: video %s for job %s", video_row["id"], job_id)

    return video_row
