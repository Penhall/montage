"""PipelineEngine — orchestrates all pipeline stages.

Called as a FastAPI BackgroundTask when a new job is created.
Each stage updates the job's status and progress in PostgreSQL.
"""

from __future__ import annotations

import asyncio
import json
import logging
import shutil
from datetime import datetime, timezone
from pathlib import Path

from backend.config import settings
from backend.db import fetch_one, update
from backend.models import JobStatus
from backend.pipeline.images import gather_images
from backend.pipeline.render import render_video
from backend.pipeline.research import run_research
from backend.pipeline.script import generate_script
from backend.pipeline.tts import generate_tts
from backend.pipeline.upload import upload_video

logger = logging.getLogger(__name__)


class PipelineEngine:
    """Orchestrates the full Montage video generation pipeline."""

    # ── Stage boundaries (progress percentage) ────────────────────────
    RESEARCH_RANGE = (0, 20)
    SCRIPT_RANGE = (20, 40)
    IMAGES_RANGE = (40, 60)
    TTS_RANGE = (60, 75)
    RENDER_RANGE = (75, 95)
    UPLOAD_RANGE = (95, 100)

    # ── Human-readable stage labels ────────────────────────────────────
    STAGE_LABELS: dict[JobStatus, str] = {
        JobStatus.pending: "Preparing",
        JobStatus.researching: "Researching topic",
        JobStatus.scripting: "Writing script",
        JobStatus.gathering_images: "Gathering images",
        JobStatus.generating_tts: "Generating audio",
        JobStatus.rendering: "Rendering video",
        JobStatus.uploading: "Saving video",
        JobStatus.completed: "Complete",
        JobStatus.failed: "Failed",
    }

    def __init__(self) -> None:
        self._tmp_root: Path = settings.tmp_root
        self._job_id: str = ""
        self._user_id: str = ""
        self._params: dict = {}
        self._job_dir: Path | None = None

    async def run(self, job_id: str) -> None:
        """Execute the full pipeline for *job_id*.

        This is designed to be called via ``BackgroundTasks.add_task``.
        """
        self._job_id = job_id
        self._job_dir = self._tmp_root / job_id

        logger.info("=" * 60)
        logger.info("Pipeline START: job %s", job_id)
        logger.info("=" * 60)

        try:
            # Load job params
            await self._load_job()

            # ── Stage 1: Research ─────────────────────────────────────
            await self._stage_start(JobStatus.researching, 0,
                                    "Searching the web for relevant content...")
            research = await run_research(
                topic=self._params.get("topic", ""),
                max_results=5,
            )
            kp_count = len(research.key_points)
            print(f"[Pipeline] Research complete: {kp_count} key points")
            await self._set_progress_msg(self.RESEARCH_RANGE[1],
                                         f"Found {kp_count} key points")

            # ── Stage 2: Script ───────────────────────────────────────
            await self._stage_start(JobStatus.scripting, self.SCRIPT_RANGE[0],
                                    "Writing video script with scene breakdown...")
            script = await generate_script(
                topic=self._params.get("topic", ""),
                research=research,
                duration=self._params.get("duration", 45),
                platform=self._params.get("platform", "tiktok_9_16"),
                style=self._params.get("style", "clean_professional"),
            )
            # Store script JSON in DB
            script_json = json.dumps(script)
            await update("jobs", id_=job_id, data={"script": script_json})
            scene_count = len(script.get("scenes", []))
            print(f"[Pipeline] Script generated: {scene_count} scenes, title='{script.get('title', '')}'")
            await self._set_progress_msg(self.SCRIPT_RANGE[1],
                                         f"Script ready: {scene_count} scenes, {self._compute_duration(script)}s")

            # ── Stage 3: Images ───────────────────────────────────────
            await self._stage_start(JobStatus.gathering_images, self.IMAGES_RANGE[0],
                                    f"Searching images for {scene_count} scenes...")
            image_mappings = await gather_images(
                scenes=script.get("scenes", []),
                job_id=job_id,
                tmp_root=self._tmp_root,
            )
            img_count = len(image_mappings)
            print(f"[Pipeline] Images gathered: {img_count}/{scene_count}")
            await self._set_progress_msg(self.IMAGES_RANGE[1],
                                         f"Images: {img_count}/{scene_count} found")

            # ── Stage 4: TTS ──────────────────────────────────────────
            await self._stage_start(JobStatus.generating_tts, self.TTS_RANGE[0],
                                    f"Generating voiceover for {scene_count} slides...")
            audio_mappings = await generate_tts(
                scenes=script.get("scenes", []),
                job_id=job_id,
                tmp_root=self._tmp_root,
            )
            audio_count = len(audio_mappings)
            print(f"[Pipeline] TTS generated: {audio_count}/{scene_count} files")
            await self._set_progress_msg(self.TTS_RANGE[1],
                                         f"Audio: {audio_count}/{scene_count} slides voiced")

            # ── Stage 5: Render ───────────────────────────────────────
            await self._stage_start(JobStatus.rendering, self.RENDER_RANGE[0],
                                    f"Rendering {scene_count}-scene video with Remotion...")
            output_path = await render_video(
                script=script,
                image_mappings=image_mappings,
                audio_mappings=audio_mappings,
                job_id=job_id,
                tmp_root=self._tmp_root,
            )
            duration_s = self._compute_duration(script)
            print(f"[Pipeline] Render complete: {output_path}, ~{duration_s}s")
            await self._set_progress_msg(self.RENDER_RANGE[1],
                                         f"Render complete: {duration_s}s video")

            # ── Stage 6: Upload ───────────────────────────────────────
            await self._stage_start(JobStatus.uploading, self.UPLOAD_RANGE[0],
                                    "Saving final video to storage...")
            thumbnail_path = self._find_thumbnail(image_mappings)
            video_row = await upload_video(
                video_path=output_path,
                thumbnail_path=thumbnail_path,
                job_id=job_id,
                user_id=self._user_id,
                title=script.get("title", "Untitled"),
                duration_s=duration_s,
                platform_profile=self._params.get("platform", "tiktok_9_16"),
                style_playbook=self._params.get("style", "clean_professional"),
            )
            print(f"[Pipeline] Upload complete: video {video_row['id']}")
            await self._set_progress_msg(self.UPLOAD_RANGE[1],
                                         "Video saved successfully")

            # ── Mark completed ────────────────────────────────────────
            await self._set_status(JobStatus.completed, 100)
            await update("jobs", id_=job_id, data={
                "result_path": video_row.get("storage_path"),
                "duration_s": duration_s,
                "progress_message": "Complete!",
            })

            print(f"[Pipeline] Job {job_id} COMPLETED successfully!")
            logger.info("Pipeline COMPLETE: job %s", job_id)

        except Exception as exc:
            logger.exception("Pipeline failed for job %s", job_id)
            print(f"[Pipeline] Job {job_id} FAILED: {exc}")
            await self._set_status(JobStatus.failed, progress=None, error=str(exc))
            await update("jobs", id_=job_id, data={
                "progress_message": f"Failed: {str(exc)[:200]}",
            })

        finally:
            # Cleanup temp files
            await self._cleanup()

    # ── Internal helpers ──────────────────────────────────────────────

    async def _load_job(self) -> None:
        """Load job params and user_id from the database."""
        row = await fetch_one("jobs", eq_column="id", eq_value=self._job_id)
        if row is None:
            raise ValueError(f"Job {self._job_id} not found in database")

        self._user_id = str(row["user_id"])
        params_raw = row.get("params", "{}")
        if isinstance(params_raw, str):
            self._params = json.loads(params_raw)
        else:
            self._params = params_raw

        logger.info("Loaded job %s for user %s", self._job_id, self._user_id)

    async def _stage_start(
        self,
        status: JobStatus,
        progress: int,
        message: str,
    ) -> None:
        """Record stage start with timestamp and progress message."""
        data: dict = {
            "status": status.value,
            "progress": progress,
            "stage_started_at": datetime.now(timezone.utc).isoformat(),
            "progress_message": message,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await update("jobs", id_=self._job_id, data=data)
        label = self.STAGE_LABELS.get(status, status.value)
        print(f"[Pipeline] {label} (progress={progress}%): {message}")

    async def _set_status(
        self,
        status: JobStatus,
        progress: int | None = None,
        error: str | None = None,
    ) -> None:
        """Update the job's status (and optionally progress + error)."""
        data: dict = {
            "status": status.value,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        if progress is not None:
            data["progress"] = progress
        if error is not None:
            data["error"] = error

        await update("jobs", id_=self._job_id, data=data)
        status_msg = f"[{status.value.upper()}] progress={progress}%"
        if error:
            status_msg += f" error={error[:100]}"
        print(f"[Pipeline] Status: {status_msg}")

    async def _set_progress(self, progress: int) -> None:
        """Update just the progress field."""
        await update("jobs", id_=self._job_id, data={
            "progress": progress,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        print(f"[Pipeline] Progress: {progress}%")

    async def _set_progress_msg(self, progress: int, message: str) -> None:
        """Update progress + message in a single call."""
        await update("jobs", id_=self._job_id, data={
            "progress": progress,
            "progress_message": message,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        print(f"[Pipeline] Progress: {progress}% — {message}")

    def _compute_duration(self, script: dict) -> int:
        """Compute total video duration from scene durations."""
        scenes = script.get("scenes", [])
        total = sum(s.get("duration_s", 0) for s in scenes)
        return max(total, 1)

    def _find_thumbnail(self, image_mappings: list[dict]) -> Path | None:
        """Use the first scene's image as the video thumbnail."""
        if image_mappings:
            path_str = image_mappings[0].get("path")
            if path_str:
                p = Path(path_str)
                if p.exists():
                    return p
        return None

    async def _cleanup(self) -> None:
        """Remove temporary files for this job."""
        if self._job_dir and self._job_dir.exists():
            try:
                shutil.rmtree(self._job_dir)
                logger.info("Cleaned up temp dir %s", self._job_dir)
            except Exception as exc:
                logger.warning("Cleanup failed for %s: %s", self._job_dir, exc)
