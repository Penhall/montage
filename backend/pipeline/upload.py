"""Upload stage — local filesystem storage.

Copies the rendered MP4 and optional thumbnail to the videos directory,
then creates the corresponding ``videos`` database row.
"""

from __future__ import annotations

import logging
import shutil
from datetime import datetime, timedelta, timezone
from pathlib import Path

from backend.config import settings
from backend.db import insert

logger = logging.getLogger(__name__)


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
    """Copy video and thumbnail to local storage, create DB row."""

    now = datetime.now(timezone.utc)
    storage_prefix = f"{user_id}/{job_id}"

    # Ensure user directory exists
    user_dir = settings.videos_dir / user_id / job_id
    user_dir.mkdir(parents=True, exist_ok=True)

    # ── Copy video ─────────────────────────────────────────────────────
    video_storage_path = f"{storage_prefix}/output.mp4"
    video_dest = settings.videos_dir / video_storage_path
    shutil.copy2(video_path, video_dest)
    size_bytes = video_dest.stat().st_size
    logger.info(
        "Upload stage: copied video (%d bytes) to %s",
        size_bytes,
        video_dest,
    )

    # ── Copy thumbnail (optional) ──────────────────────────────────────
    thumbnail_storage_path: str | None = None
    if thumbnail_path and thumbnail_path.exists():
        thumbnail_storage_path = f"{storage_prefix}/thumbnail.jpg"
        thumb_dest = settings.videos_dir / thumbnail_storage_path
        shutil.copy2(thumbnail_path, thumb_dest)
        logger.info("Thumbnail copied to %s", thumb_dest)
    else:
        logger.info("No thumbnail provided for job %s", job_id)

    # ── Create database row ────────────────────────────────────────────
    expires_at = now + timedelta(days=30)

    video_row = await insert("videos", {
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

    logger.info("Upload complete: video %s for job %s", video_row["id"], job_id)
    return video_row
