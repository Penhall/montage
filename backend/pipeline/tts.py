"""Text-to-speech generation stage.

Uses Piper TTS (local) to generate a WAV file per scene.
Falls back to a basic ``espeak-ng`` call or stub file if Piper is not
available.
"""

from __future__ import annotations

import asyncio
import logging
import subprocess
import wave
from pathlib import Path

logger = logging.getLogger(__name__)

PIPER_MODEL = "en_US-lessac-medium"


async def generate_tts(
    scenes: list[dict],
    job_id: str,
    tmp_root: Path,
) -> list[dict]:
    """Generate one WAV file per scene.

    Returns a list of dicts: ``{"scene_id": int, "path": str, "duration_s": float}``.
    """
    tts_dir = tmp_root / job_id / "audio"
    tts_dir.mkdir(parents=True, exist_ok=True)

    logger.info("TTS stage: generating %d audio files for job %s", len(scenes), job_id)

    # Check if Piper is installed
    piper_available = await _check_piper()

    results: list[dict] = []
    tasks = []

    for scene in scenes:
        scene_id = scene.get("scene_id", 0)
        dialogue = scene.get("dialogue", "")
        out_path = tts_dir / f"scene_{scene_id}.wav"
        tasks.append(
            _generate_single_tts(dialogue, out_path, scene_id, piper_available)
        )

    audio_results = await asyncio.gather(*tasks, return_exceptions=True)

    for i, scene in enumerate(scenes):
        scene_id = scene.get("scene_id", 0)
        result = audio_results[i]
        if isinstance(result, Exception):
            logger.error("TTS failed for scene %d: %s", scene_id, result)
            continue
        if result:
            results.append(result)

    logger.info("TTS complete: %d/%d files", len(results), len(scenes))
    return results


async def _check_piper() -> bool:
    """Check if the ``piper`` command is available on PATH."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "piper",
            "--help",
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await proc.wait()
        return proc.returncode == 0
    except FileNotFoundError:
        logger.warning("Piper TTS not found on PATH")
        return False


async def _generate_single_tts(
    text: str,
    out_path: Path,
    scene_id: int,
    piper_available: bool,
) -> dict | None:
    """Generate TTS for one scene."""
    if not text:
        logger.warning("Scene %d has empty dialogue — creating silent audio", scene_id)
        _create_silent_wav(out_path, duration_s=2.0)
        return {"scene_id": scene_id, "path": str(out_path), "duration_s": 2.0}

    if piper_available:
        return await _generate_with_piper(text, out_path, scene_id)
    else:
        return await _generate_with_espeak(text, out_path, scene_id)


async def _generate_with_piper(text: str, out_path: Path, scene_id: int) -> dict:
    """Generate TTS using the Piper command-line tool."""
    logger.debug("Piper TTS for scene %d: %s…", scene_id, text[:60])

    proc = await asyncio.create_subprocess_exec(
        "piper",
        "--model", PIPER_MODEL,
        "--output_file", str(out_path),
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout_data, stderr_data = await proc.communicate(input=text.encode("utf-8"))

    if proc.returncode != 0:
        error_msg = stderr_data.decode("utf-8", errors="replace") if stderr_data else "unknown error"
        logger.error("Piper failed for scene %d: %s", scene_id, error_msg)
        _create_silent_wav(out_path, duration_s=2.0)
    else:
        logger.debug("Piper TTS done for scene %d", scene_id)

    duration = _get_wav_duration(out_path)
    return {"scene_id": scene_id, "path": str(out_path), "duration_s": duration}


async def _generate_with_espeak(text: str, out_path: Path, scene_id: int) -> dict:
    """Fallback: generate TTS using ``espeak-ng`` + FFmpeg WAV conversion."""
    logger.debug("espeak-ng fallback for scene %d", scene_id)

    temp_file = out_path.with_suffix(".raw")

    try:
        proc = await asyncio.create_subprocess_exec(
            "espeak-ng",
            "-w", str(temp_file),
            "-s", "150",
            text,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await proc.wait()

        if temp_file.exists() and temp_file.stat().st_size > 0:
            # espeak-ng writes WAV directly with -w flag
            import shutil
            shutil.move(str(temp_file), str(out_path))
        else:
            _create_silent_wav(out_path, duration_s=2.0)
    except FileNotFoundError:
        logger.warning("espeak-ng not available — creating silent audio")
        _create_silent_wav(out_path, duration_s=2.0)
    except Exception as exc:
        logger.error("espeak-ng failed for scene %d: %s", scene_id, exc)
        _create_silent_wav(out_path, duration_s=2.0)
    finally:
        if temp_file.exists():
            temp_file.unlink(missing_ok=True)

    duration = _get_wav_duration(out_path)
    return {"scene_id": scene_id, "path": str(out_path), "duration_s": duration}


def _create_silent_wav(path: Path, duration_s: float = 2.0) -> None:
    """Create a silent WAV file of the given duration."""
    sample_rate = 22050
    num_frames = int(sample_rate * duration_s)

    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)  # 16-bit
        wf.setframerate(sample_rate)
        wf.writeframes(b"\x00\x00" * num_frames)

    logger.debug("Created silent WAV at %s (%.1fs)", path, duration_s)


def _get_wav_duration(path: Path) -> float:
    """Get the duration of a WAV file in seconds."""
    if not path.exists() or path.stat().st_size < 44:
        return 0.0
    try:
        with wave.open(str(path), "rb") as wf:
            frames = wf.getnframes()
            rate = wf.getframerate()
            return frames / rate if rate > 0 else 0.0
    except (wave.Error, Exception) as exc:
        logger.warning("Could not read WAV duration from %s: %s", path, exc)
        return 0.0
