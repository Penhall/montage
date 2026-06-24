"""Pydantic models for the Montage backend.

These mirror the Supabase table schemas and add request/response
shapes for the API routes.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


# ── Enums ──────────────────────────────────────────────────────────────

class JobStatus(str, Enum):
    pending = "pending"
    researching = "researching"
    scripting = "scripting"
    gathering_images = "gathering_images"
    generating_tts = "generating_tts"
    rendering = "rendering"
    uploading = "uploading"
    completed = "completed"
    failed = "failed"


class UserTier(str, Enum):
    free = "free"
    pro = "pro"
    enterprise = "enterprise"


class PlatformProfile(str, Enum):
    tiktok_9_16 = "tiktok_9_16"
    instagram_reel = "instagram_reel"
    youtube_shorts = "youtube_shorts"


class StylePlaybook(str, Enum):
    clean_professional = "clean_professional"
    energetic = "energetic"
    storytelling = "storytelling"
    educational = "educational"


# ── Request bodies ─────────────────────────────────────────────────────

class CreateJobRequest(BaseModel):
    title: str = Field(..., max_length=120, description="Video title")
    topic: str = Field(..., max_length=500, description="Topic for research & script")
    duration: int = Field(default=45, ge=15, le=120, description="Target duration in seconds")
    platform: PlatformProfile = Field(default=PlatformProfile.tiktok_9_16)
    style: StylePlaybook = Field(default=StylePlaybook.clean_professional)


# ── Database-mirror models ────────────────────────────────────────────

class Job(BaseModel):
    id: str
    user_id: str
    status: JobStatus = JobStatus.pending
    params: dict[str, Any] = {}
    script: str | None = None
    progress: int = 0
    result_path: str | None = None
    thumbnail_path: str | None = None
    duration_s: int | None = None
    error: str | None = None
    cost_estimate: float = 0.02
    cost_actual: float | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True


class Video(BaseModel):
    id: str
    job_id: str
    user_id: str
    title: str
    storage_path: str
    thumbnail_path: str | None = None
    duration_s: int | None = None
    platform_profile: str = "tiktok_9_16"
    style_playbook: str = "clean_professional"
    size_bytes: int | None = None
    created_at: datetime | None = None
    expires_at: datetime | None = None

    class Config:
        from_attributes = True


class UserTierRecord(BaseModel):
    user_id: str
    tier: UserTier = UserTier.free
    videos_this_month: int = 0
    reset_at: datetime | None = None
    stripe_customer_id: str | None = None
    stripe_subscription_id: str | None = None
    created_at: datetime | None = None

    class Config:
        from_attributes = True


# ── Response shapes ────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str = "ok"
    version: str = "0.1.0"


class MeResponse(BaseModel):
    id: str
    email: str | None = None
    tier: UserTier = UserTier.free
    videos_this_month: int = 0
    videos_limit: int = 3


class JobSummary(BaseModel):
    id: str
    status: JobStatus
    progress: int
    title: str
    created_at: datetime | None = None


class JobDetail(Job):
    """Full job content — same fields as Job so we reuse it."""


class VideoSummary(BaseModel):
    id: str
    title: str
    thumbnail_url: str | None = None
    duration_s: int | None = None
    created_at: datetime | None = None
    download_url: str | None = None


class CreateJobResponse(BaseModel):
    id: str
    status: JobStatus = JobStatus.pending
