import { apiFetch } from "./api-client";

// API_BASE kept for backward compat; api-client.ts now handles base URL

// ── Value mappers (frontend form → backend enum) ──────────────────────

const PLATFORM_MAP: Record<string, string> = {
  "tiktok-9:16": "tiktok_9_16",
  "youtube-16:9": "youtube_shorts",
  "instagram-1:1": "instagram_reel",
};

const STYLE_MAP: Record<string, string> = {
  "clean-professional": "clean_professional",
  "flat-motion": "energetic",
  "minimalist": "storytelling",
};

export interface CreateJobParams {
  pipeline: string;
  title: string;
  topic?: string;
  duration: string;
  platform: string;
  style: string;
}

export interface Job {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  pipeline: string;
  title: string;
  duration: string;
  platform: string;
  style: string;
  progress: number;
  progress_message?: string;
  stage_started_at?: string;
  stage: string;
  created_at: string;
  video_id?: string;
  error?: string;
}

export interface Video {
  id: string;
  title: string;
  duration: string;
  platform: string;
  style: string;
  status: "processing" | "done" | "failed";
  thumbnail_url?: string;
  size?: number;
  created_at: string;
  stage?: string;
  progress?: number;
  progress_message?: string;
  stage_started_at?: string;
}

export async function createJob(params: CreateJobParams): Promise<Job> {
  // Map frontend form values to backend enum values
  const body = {
    title: params.title,
    topic: params.topic || params.title,
    duration: parseInt(params.duration) || 60,
    platform: PLATFORM_MAP[params.platform] || "tiktok_9_16",
    style: STYLE_MAP[params.style] || "clean_professional",
  };
  return apiFetch<Job>("/api/jobs", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getJobs(): Promise<Job[]> {
  return apiFetch<Job[]>("/api/jobs");
}

export async function getJob(id: string): Promise<Job> {
  return apiFetch<Job>(`/api/jobs/${id}`);
}

export async function getVideos(): Promise<Video[]> {
  return apiFetch<Video[]>("/api/videos");
}

export async function getVideo(id: string): Promise<Video> {
  return apiFetch<Video>(`/api/videos/${id}`);
}

export async function getVideoDownloadUrl(id: string): Promise<string> {
  const data = await apiFetch<{ url: string }>(`/api/videos/${id}/download`);
  return data.url;
}

export async function deleteVideo(id: string): Promise<void> {
  await apiFetch<void>(`/api/videos/${id}`, { method: "DELETE" });
}
