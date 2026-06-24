import { createClient } from "./supabase/client";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;

  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = await getAuthHeaders();
  const url = `${API_BASE}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    let errorMessage: string;
    try {
      const parsed = JSON.parse(errorBody);
      errorMessage = parsed.detail || parsed.message || response.statusText;
    } catch {
      errorMessage = errorBody || response.statusText;
    }
    throw new Error(errorMessage);
  }

  return response.json();
}

export async function createJob(params: CreateJobParams): Promise<Job> {
  return apiFetch<Job>("/api/jobs", {
    method: "POST",
    body: JSON.stringify(params),
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
