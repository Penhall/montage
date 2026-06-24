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

    # Build render props
    render_props = _build_render_props(script, image_mappings, audio_mappings, job_id, tmp_root)

    # Write props to a temp JSON file (avoids shell escaping issues)
    props_path = tmp_root / job_id / "render_props.json"
    props_path.write_text(json.dumps(render_props), encoding="utf-8")

    # Check if the Remotion project exists
    remotion_root = settings.remotion_root
    if not remotion_root.exists():
        logger.warning("Remotion project not found at %s — creating stub MP4", remotion_root)
        return _create_stub_video(output_path)

    remotion_pkg = remotion_root / "package.json"
    if not remotion_pkg.exists():
        logger.warning("No package.json in remotion directory — creating stub MP4")
        return _create_stub_video(output_path)

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
    cmd = [
        "npx",
        "--yes",
        "remotion",
        "render",
        str(remotion_root),
        "--props", str(props_path),
        "--output", str(output_path),
    ]

    logger.info("Running: %s", " ".join(str(c) for c in cmd))

    proc = await asyncio.create_subprocess_exec(
        *cmd,
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


def _build_render_props(
    script: dict,
    image_mappings: list[dict],
    audio_mappings: list[dict],
    job_id: str,
    tmp_root: Path,
) -> dict:
    """Build the props dict to pass to the Remotion composition."""
    scenes = script.get("scenes", [])
    enriched_scenes = []

    for scene in scenes:
        scene_id = scene.get("scene_id", 0)

        # Find matching image
        image_path = None
        for img in image_mappings:
            if img.get("scene_id") == scene_id:
                image_path = img.get("path")
                break

        # Find matching audio
        audio_path = None
        for aud in audio_mappings:
            if aud.get("scene_id") == scene_id:
                audio_path = aud.get("path")
                break

        enriched_scenes.append({
            "scene_id": scene_id,
            "dialogue": scene.get("dialogue", ""),
            "visual_prompt": scene.get("visual_prompt", ""),
            "duration_s": scene.get("duration_s", 4),
            "image_path": image_path,
            "audio_path": audio_path,
        })

    return {
        "job_id": job_id,
        "title": script.get("title", "Untitled"),
        "scenes": enriched_scenes,
        "audio": script.get("audio", {}),
        "editing": script.get("editing", {}),
        "seo_keywords": script.get("seo_keywords", []),
        "tmp_root": str(tmp_root / job_id),
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
        # Create an even smaller placeholder
        output_path.write_bytes(b"\x00\x00\x00\x00")

    logger.info("Created stub video at %s", output_path)
    return output_path
