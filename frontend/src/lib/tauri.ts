// Tauri API bridge — detects desktop mode and proxies calls to Rust backend
"use client";

type TauriInvoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

let _tauri: { invoke: TauriInvoke } | null = null;

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function getTauri(): Promise<{ invoke: TauriInvoke }> {
  if (!_tauri) {
    const mod = await import("@tauri-apps/api/core");
    _tauri = { invoke: mod.invoke };
  }
  return _tauri;
}

// ── Auth ─────────────────────────────────────────────────────────────

export interface MontageUser {
  id: string;
  email: string;
  tier: string;
  videos_this_month: number;
  created_at: string;
}

export async function tauriLogin(email: string, password: string): Promise<MontageUser> {
  const api = await getTauri();
  const result = (await api.invoke("login", {
    request: { email, password },
  })) as { success: boolean; user: MontageUser | null; error: string | null };

  if (!result.success || !result.user) {
    throw new Error(result.error || "Login failed");
  }
  return result.user;
}

export async function tauriGetUser(userId: string): Promise<MontageUser | null> {
  const api = await getTauri();
  return (await api.invoke("get_user", { userId })) as MontageUser | null;
}

// ── Jobs ─────────────────────────────────────────────────────────────

export interface CreateJobParams {
  title: string;
  topic?: string;
  duration: number;
  platform: string;
  style: string;
  pipeline: string;
}

export interface MontageJob {
  id: string;
  status: string;
  progress: number;
  title: string;
  created_at: string;
  result_path?: string;
}

export async function tauriCreateJob(
  userId: string,
  params: CreateJobParams,
): Promise<MontageJob> {
  const api = await getTauri();
  return (await api.invoke("create_job", {
    userId,
    request: params,
  })) as MontageJob;
}

export async function tauriListJobs(userId: string): Promise<MontageJob[]> {
  const api = await getTauri();
  return (await api.invoke("list_jobs", { userId })) as MontageJob[];
}

export async function tauriRunPipeline(jobId: string): Promise<string> {
  const api = await getTauri();
  return (await api.invoke("run_pipeline", { jobId })) as string;
}

// ── Videos ───────────────────────────────────────────────────────────

export async function tauriListVideos(userId: string): Promise<Record<string, unknown>[]> {
  const api = await getTauri();
  return (await api.invoke("list_videos", { userId })) as Record<string, unknown>[];
}

// ── System ───────────────────────────────────────────────────────────

export async function getAppDataDir(): Promise<string> {
  const api = await getTauri();
  return (await api.invoke("get_app_data_dir")) as string;
}

export async function checkBackendHealth(): Promise<{
  running: boolean;
  pid: number | null;
  port: number;
}> {
  const api = await getTauri();
  return (await api.invoke("check_backend_health")) as {
    running: boolean;
    pid: number | null;
    port: number;
  };
}
