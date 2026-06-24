"""Image gathering stage.

For each scene in the script, searches Pexels (primary), Pixabay (first
fallback), and Unsplash (second fallback) for a matching image.

Downloads the best match to ``tmp/<job_id>/images/scene_<N>.<ext>``.
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path

import httpx

from backend.config import settings

logger = logging.getLogger(__name__)

PEXELS_BASE = "https://api.pexels.com/v1/search"
PIXABAY_BASE = "https://pixabay.com/api/"
UNSPLASH_BASE = "https://api.unsplash.com/search/photos"


async def gather_images(
    scenes: list[dict],
    job_id: str,
    tmp_root: Path,
) -> list[dict]:
    """Gather one image per scene and return scene→file-path mappings.

    Returns a list of dicts: ``{"scene_id": int, "path": str}``.
    """
    image_dir = tmp_root / job_id / "images"
    image_dir.mkdir(parents=True, exist_ok=True)

    logger.info("Images stage: gathering %d images for job %s", len(scenes), job_id)

    results: list[dict] = []
    tasks = []

    for scene in scenes:
        scene_id = scene.get("scene_id", 0)
        visual_prompt = scene.get("visual_prompt", "")
        out_path = image_dir / f"scene_{scene_id}.jpg"
        tasks.append(_fetch_single_image(visual_prompt, out_path, scene_id))

    # Run all image fetches concurrently
    fetched = await asyncio.gather(*tasks, return_exceptions=True)

    for i, scene in enumerate(scenes):
        scene_id = scene.get("scene_id", 0)
        result = fetched[i]
        if isinstance(result, Exception):
            logger.error("Image fetch failed for scene %d: %s", scene_id, result)
            continue
        if result:
            results.append({"scene_id": scene_id, "path": str(result)})

    logger.info("Images gathered: %d/%d", len(results), len(scenes))
    return results


async def _fetch_single_image(
    prompt: str,
    out_path: Path,
    scene_id: int,
) -> Path | None:
    """Try to fetch one image from Pexels → Pixabay → Unsplash."""
    # Try Pexels first
    pexels_key = settings.pexels_api_key
    if pexels_key:
        try:
            result = await _fetch_pexels(prompt, out_path, pexels_key)
            if result:
                return result
        except Exception as exc:
            logger.warning("Pexels failed for scene %d: %s", scene_id, exc)

    # Try Pixabay
    pixabay_key = settings.pixabay_api_key
    if pixabay_key:
        try:
            result = await _fetch_pixabay(prompt, out_path, pixabay_key)
            if result:
                return result
        except Exception as exc:
            logger.warning("Pixabay failed for scene %d: %s", scene_id, exc)

    # Try Unsplash
    unsplash_key = settings.unsplash_access_key
    if unsplash_key:
        try:
            result = await _fetch_unsplash(prompt, out_path, unsplash_key)
            if result:
                return result
        except Exception as exc:
            logger.warning("Unsplash failed for scene %d: %s", scene_id, exc)

    # All failed — create a placeholder
    logger.warning("All image sources failed for scene %d — creating placeholder", scene_id)
    return _create_placeholder(out_path, prompt)


async def _fetch_pexels(prompt: str, out_path: Path, api_key: str) -> Path | None:
    """Search Pexels and download the first portrait image."""
    headers = {"Authorization": api_key}
    params = {"query": prompt, "per_page": 3, "orientation": "portrait"}

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(PEXELS_BASE, headers=headers, params=params)
        resp.raise_for_status()
        data = resp.json()

    photos = data.get("photos", [])
    if not photos:
        return None

    # Pick the first medium-sized image
    photo = photos[0]
    src = photo.get("src", {})
    img_url = src.get("medium") or src.get("large") or src.get("original")
    if not img_url:
        return None

    return await _download_image(img_url, out_path)


async def _fetch_pixabay(prompt: str, out_path: Path, api_key: str) -> Path | None:
    """Search Pixabay and download the first image."""
    params = {
        "key": api_key,
        "q": prompt,
        "image_type": "photo",
        "orientation": "vertical",
        "per_page": 3,
        "safesearch": "true",
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(PIXABAY_BASE, params=params)
        resp.raise_for_status()
        data = resp.json()

    hits = data.get("hits", [])
    if not hits:
        return None

    img_url = hits[0].get("webformatURL") or hits[0].get("largeImageURL")
    if not img_url:
        return None

    return await _download_image(img_url, out_path)


async def _fetch_unsplash(prompt: str, out_path: Path, api_key: str) -> Path | None:
    """Search Unsplash and download the first image."""
    headers = {"Authorization": f"Client-ID {api_key}"}
    params = {"query": prompt, "per_page": 3, "orientation": "portrait"}

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(UNSPLASH_BASE, headers=headers, params=params)
        resp.raise_for_status()
        data = resp.json()

    results = data.get("results", [])
    if not results:
        return None

    img_url = results[0].get("urls", {}).get("regular") or results[0].get("urls", {}).get("raw")
    if not img_url:
        return None

    return await _download_image(img_url, out_path)


async def _download_image(url: str, out_path: Path) -> Path:
    """Download an image from *url* to *out_path*."""
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()

    # Ensure correct extension
    content_type = resp.headers.get("content-type", "")
    ext = ".jpg"
    if "png" in content_type:
        ext = ".png"
    elif "webp" in content_type:
        ext = ".webp"

    final_path = out_path.with_suffix(ext)
    final_path.write_bytes(resp.content)
    logger.debug("Downloaded image (%d bytes) to %s", len(resp.content), final_path)
    return final_path


def _create_placeholder(out_path: Path, prompt: str) -> Path:
    """Create a minimal placeholder image when all APIs fail."""
    # Write a tiny valid JPEG (1x1 pixel) as placeholder
    # Minimal JPEG bytes
    placeholder = (
        b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
        b"\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t\x08\n"
        b"\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a\x1f\x1e\x1d"
        b"\x1a\x1c\x1c $.' \",#\x1c\x1c(7),01444\x1f'9=82<.342\xff\xc0\x00\x0b"
        b"\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xc4\x00\x1f\x00\x00\x01\x05"
        b"\x01\x01\x01\x01\x01\x01\x00\x00\x00\x00\x00\x00\x00\x01\x02\x03\x04"
        b"\x05\x06\x07\x08\t\n\x0b\xff\xc4\x00\xb5\x10\x00\x02\x01\x03\x03\x02"
        b"\x04\x03\x05\x05\x04\x04\x00\x00\x00\x00\x00\x00\x00\x01\x02\x03\x11"
        b"\x04\x12!1A\x06\x13Qa\x07\"q\x142\x81\x91\xa1\x08#B\xb1\xc1\x15R"
        b"\xd1\xf0$Cbr\x82\xff\xc4\x00\x1f\x01\x01\x01\x01\x01\x01\x01\x01"
        b"\x01\x01\x00\x00\x00\x00\x00\x00\x00\x01\x02\x03\x04\x05\x06\x07\x08"
        b"\t\n\x0b\xff\xc4\x00\x41\x11\x00\x02\x01\x02\x04\x03\x04\x08\x07\x08"
        b"\x07\x06\x05\x01\x00\x00\x01\x02\x03\x11\x04\x12!1\x05A\x06\x13Qa"
        b"\x07\"q\x142\x81\x91\xa1\x08#B\xb1\xc1\x15R\xd1\xf0$Cbr\x82"
        b"\xff\xda\x00\x08\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00"
        b"\xff\xd9"
    )
    final_path = out_path.with_suffix(".jpg")
    final_path.write_bytes(placeholder)
    logger.debug("Created placeholder image at %s", final_path)
    return final_path
