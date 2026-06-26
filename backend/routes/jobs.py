"""CRUD endpoints for /api/jobs."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, status

from backend.db import delete, fetch_many, fetch_one, insert, update
from backend.models import (
    CreateJobRequest,
    CreateJobResponse,
    JobDetail,
    JobStatus,
    JobSummary,
)
from backend.pipeline.engine import PipelineEngine

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "/api/jobs",
    response_model=CreateJobResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Jobs"],
)
async def create_job(
    body: CreateJobRequest,
    request: Request,
    background_tasks: BackgroundTasks,
) -> CreateJobResponse:
    """Create a new video generation job. Pipeline runs in background."""
    user_id: str = request.state.user_id
    now = datetime.now(timezone.utc).isoformat()

    params = body.model_dump()
    job = await insert("jobs", {
        "user_id": user_id,
        "status": JobStatus.pending.value,
        "params": json.dumps(params),
        "progress": 0,
        "created_at": now,
        "updated_at": now,
    })

    job_id: str = str(job["id"])

    # Kick off pipeline in background
    engine = PipelineEngine()
    background_tasks.add_task(engine.run, job_id)

    logger.info("Job %s created for user %s", job_id, user_id)
    return CreateJobResponse(id=job_id, status=JobStatus.pending)


@router.get("/api/jobs", response_model=list[JobSummary], tags=["Jobs"])
async def list_jobs(request: Request) -> list[JobSummary]:
    """List all jobs for the authenticated user (newest first)."""
    user_id: str = request.state.user_id

    rows = await fetch_many(
        "jobs",
        eq_column="user_id",
        eq_value=user_id,
        order_column="created_at",
        order_desc=True,
    )

    result: list[JobSummary] = []
    for r in rows:
        params = r.get("params", {})
        if isinstance(params, str):
            params = json.loads(params)
        title = params.get("title", "Untitled")
        created = _parse_dt(r.get("created_at"))
        result.append(
            JobSummary(
                id=str(r["id"]),
                status=JobStatus(r.get("status", "pending")),
                progress=r.get("progress", 0),
                title=title,
                created_at=created,
            )
        )
    return result


@router.get("/api/jobs/{job_id}", response_model=JobDetail, tags=["Jobs"])
async def get_job(job_id: str, request: Request) -> JobDetail:
    """Return full job detail."""
    user_id: str = request.state.user_id

    row = await fetch_one("jobs", eq_column="id", eq_value=job_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Job not found"
        )
    if str(row["user_id"]) != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Access denied"
        )

    return _row_to_job_detail(row)


@router.delete(
    "/api/jobs/{job_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["Jobs"],
)
async def delete_job(job_id: str, request: Request) -> None:
    """Cancel (delete) a job that is still pending."""
    user_id: str = request.state.user_id

    row = await fetch_one("jobs", eq_column="id", eq_value=job_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Job not found"
        )
    if str(row["user_id"]) != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Access denied"
        )

    status_val = row.get("status", "")
    if status_val not in ("pending", "researching", "scripting"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot delete job in status '{status_val}'",
        )

    await delete("jobs", id_=job_id)
    logger.info("Job %s deleted by user %s", job_id, user_id)


# ── Helpers ────────────────────────────────────────────────────────────


def _row_to_job_detail(row: dict) -> JobDetail:
    params = row.get("params", {})
    if isinstance(params, str):
        params = json.loads(params)

    return JobDetail(
        id=str(row["id"]),
        user_id=str(row["user_id"]),
        status=JobStatus(row.get("status", "pending")),
        params=params,
        script=row.get("script"),
        progress=row.get("progress", 0),
        result_path=row.get("result_path"),
        thumbnail_path=row.get("thumbnail_path"),
        duration_s=row.get("duration_s"),
        error=row.get("error"),
        cost_estimate=row.get("cost_estimate", 0.02),
        cost_actual=row.get("cost_actual"),
        created_at=_parse_dt(row.get("created_at")),
        updated_at=_parse_dt(row.get("updated_at")),
    )


def _parse_dt(val: str | None) -> datetime | None:
    if val is None:
        return None
    if isinstance(val, datetime):
        return val
    try:
        return datetime.fromisoformat(val.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None
