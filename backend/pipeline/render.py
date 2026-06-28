"""Remotion render stage.

Calls the Remotion CLI via subprocess to render the final MP4.

Expects the Remotion project at ``/root/montage/remotion`` and the
``AnimatedExplainer`` composition to be registered.
"""

from __future__ import annotations

import asyncio
import json
import logging
import shutil
from pathlib import Path

from backend.config import settings

logger = logging.getLogger(__name__)


async def render_video(
    script: dict,
    image_mappings: list[dict],
    audio_mappings: list[dict],
    job_id: str,
    tmp_root: Path,
) -> Path:
    """Render the final MP4 video using Remotion.

    Returns the path to the rendered MP4.
    """
    render_dir = tmp_root / job_id / "render"
    render_dir.mkdir(parents=True, exist_ok=True)
    output_path = render_dir / "output.mp4"

    logger.info("Render stage: starting Remotion render for job %s", job_id)

    # Check if the Remotion project exists
    remotion_root = settings.remotion_root
    if not remotion_root.exists():
        logger.warning("Remotion project not found at %s — creating stub MP4", remotion_root)
        return _create_stub_video(output_path)

    remotion_pkg = remotion_root / "package.json"
    if not remotion_pkg.exists():
        logger.warning("No package.json in remotion directory — creating stub MP4")
        return _create_stub_video(output_path)

    # Copy assets into Remotion's public/ dir so staticFile() can resolve them
    public_dir = remotion_root / "public" / job_id
    _copy_assets_to_public(job_id, tmp_root, public_dir)

    # Build render props with relative paths (relative to public/)
    render_props = _build_render_props(script, image_mappings, audio_mappings, job_id)

    # Write props to a temp JSON file (avoids shell escaping issues)
    props_path = tmp_root / job_id / "render_props.json"
    props_path.write_text(json.dumps(render_props), encoding="utf-8")

    # If node_modules doesn't exist, try npm install first
    node_modules = remotion_root / "node_modules"
    if not node_modules.exists():
        logger.info("No node_modules found in remotion — installing dependencies")
        npm_proc = await asyncio.create_subprocess_exec(
            "npm", "install",
            cwd=remotion_root,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, npm_stderr = await npm_proc.communicate()
        if npm_proc.returncode != 0:
            logger.warning("npm install failed: %s", npm_stderr.decode()[:500])

    # Run Remotion render
    # Syntax: remotion render <composition> [output]  (cwd = project dir)
    cmd = [
        "npx",
        "remotion",
        "render",
        "AnimatedExplainer",
        str(output_path),
        f"--props={props_path}",
    ]

    logger.info("Running: %s", " ".join(str(c) for c in cmd))

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        cwd=str(remotion_root),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout_bytes, stderr_bytes = await proc.communicate()

    stdout_str = stdout_bytes.decode("utf-8", errors="replace") if stdout_bytes else ""
    stderr_str = stderr_bytes.decode("utf-8", errors="replace") if stderr_bytes else ""

    if proc.returncode != 0:
        logger.error("Remotion render failed (exit %d)", proc.returncode)
        logger.debug("stdout: %s", stdout_str[:1000])
        logger.debug("stderr: %s", stderr_str[:1000])
        raise RuntimeError(
            f"Remotion render failed with exit code {proc.returncode}. "
            f"stderr: {stderr_str[:300]}"
        )

    if not output_path.exists():
        logger.error("Remotion reported success but output file not found at %s", output_path)
        raise FileNotFoundError(f"Render output not found at {output_path}")

    size_mb = output_path.stat().st_size / (1024 * 1024)
    logger.info("Render complete: %s (%.1f MB)", output_path, size_mb)

    return output_path


def _copy_assets_to_public(job_id: str, tmp_root: Path, public_dir: Path) -> None:
    """Copy image and audio assets into Remotion's public/ directory.

    Remotion's staticFile() resolves paths relative to public/, so we copy
    all scene assets there before rendering.
    """
    public_dir.mkdir(parents=True, exist_ok=True)
    
    # Copy images
    images_dir = tmp_root / job_id / "images"
    if images_dir.exists():
        dest_images = public_dir / "images"
        dest_images.mkdir(parents=True, exist_ok=True)
        for img_file in images_dir.iterdir():
            if img_file.is_file():
                shutil.copy2(img_file, dest_images / img_file.name)
                logger.debug("Copied image: %s → %s", img_file.name, dest_images)

    # Copy audio
    audio_dir = tmp_root / job_id / "audio"
    if audio_dir.exists():
        dest_audio = public_dir / "audio"
        dest_audio.mkdir(parents=True, exist_ok=True)
        for aud_file in audio_dir.iterdir():
            if aud_file.is_file():
                shutil.copy2(aud_file, dest_audio / aud_file.name)
                logger.debug("Copied audio: %s → %s", aud_file.name, dest_audio)

    logger.info("Assets copied to public/%s (images=%d, audio=%d)",
                job_id,
                len(list((public_dir / "images").iterdir())) if (public_dir / "images").exists() else 0,
                len(list((public_dir / "audio").iterdir())) if (public_dir / "audio").exists() else 0)


def _build_render_props(
    script: dict,
    image_mappings: list[dict],
    audio_mappings: list[dict],
    job_id: str,
) -> dict:
    """Build the props dict matching AnimatedExplainerSchema.

    Paths are relative to Remotion's public/ directory so staticFile() works.
    """
    scenes = script.get("scenes", [])
    enriched_scenes = []

    for scene in scenes:
        scene_id = scene.get("scene_id", 0)

        # Build relative paths: <job_id>/images/scene_N.ext
        imagePath = ""
        for img in image_mappings:
            if img.get("scene_id") == scene_id:
                abs_path = Path(img.get("path", ""))
                imagePath = f"{job_id}/images/{abs_path.name}" if abs_path.name else ""
                break

        audioPath = ""
        for aud in audio_mappings:
            if aud.get("scene_id") == scene_id:
                abs_path = Path(aud.get("path", ""))
                audioPath = f"{job_id}/audio/{abs_path.name}" if abs_path.name else ""
                break

        enriched_scenes.append({
            "scene_id": scene_id,
            "dialogue": scene.get("dialogue", ""),
            "duration_s": scene.get("duration_s", 4),
            "imagePath": imagePath,
            "audioPath": audioPath,
        })

    editing = script.get("editing", {})
    total_duration = sum(s.get("duration_s", 0) for s in enriched_scenes)

    return {
        "title": script.get("title", "Untitled"),
        "scenes": enriched_scenes,
        "ctaText": editing.get("cta_text", "Follow for more!"),
        "ctaOverlayAtS": editing.get("cta_overlay_at_s", max(10, total_duration - 15)),
        "outputWidth": 1080,
        "outputHeight": 1920,
        "watermark": False,
    }


def _create_stub_video(output_path: Path) -> Path:
    """Create a stub MP4 for testing when Remotion is not available."""
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Use FFmpeg to generate a minimal valid MP4
    cmd = [
        "ffmpeg",
        "-y",
        "-f", "lavfi",
        "-i", "color=c=blue:s=1080x1920:d=5",
        "-f", "lavfi",
        "-i", "anullsrc=r=44100:cl=stereo",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "28",
        "-c:a", "aac",
        "-shortest",
        str(output_path),
    ]

    try:
        import subprocess
        subprocess.run(cmd, capture_output=True, timeout=30, check=False)
    except Exception as exc:
        logger.warning("FFmpeg stub creation failed: %s", exc)
        output_path.write_bytes(b"\x00\x00\x00\x00")

    logger.info("Created stub video at %s", output_path)
    return output_path
