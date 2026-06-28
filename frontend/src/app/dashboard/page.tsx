"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import CreateForm from "@/components/CreateForm";
import VideoCard from "@/components/VideoCard";
import TierBadge from "@/components/TierBadge";
import LogoutButton from "@/components/LogoutButton";
import { UserIcon, SpinnerIcon } from "@/components/IconComponents";
import ProgressOverlay from "@/components/ProgressOverlay";
import { createJob, getJobs, getVideos, getVideoDownloadUrl, getVideo, type Job, type Video } from "@/lib/api";
import { getUser } from "@/lib/auth-client";
import { useAuth } from "@/lib/auth-context";
import {
  isTauri,
  tauriCreateJob,
  tauriListJobs,
  tauriRunPipeline,
  type MontageJob,
} from "@/lib/tauri";

export default function DashboardPage() {
  const router = useRouter();
  const { user: tauriCtxUser, logout: tauriLogout, isTauriMode } = useAuth();

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [videos, setVideos] = useState<Video[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [tauriJobs, setTauriJobs] = useState<MontageJob[]>([]);
  const [videosLoading, setVideosLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [tier, setTier] = useState<"free" | "pro">("free");
  const [tierUsed, setTierUsed] = useState(0);
  const [tierLimit, setTierLimit] = useState(3);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"create" | "videos">("create");

  // Composition preview — updated when a job is created or completes
  const [composition, setComposition] = useState<{
    title: string;
    topic: string;
    platform: string;
    style: string;
    duration: string;
  } | null>(null);

  const tauriJobToVideo = useCallback((job: MontageJob): Video => {
    const status: Video["status"] =
      job.status === "done"
        ? "done"
        : job.status === "failed"
          ? "failed"
          : "processing";

    return {
      id: job.id,
      title: job.title,
      status,
      duration_s: 0,
      platform_profile: "Desktop",
      style_playbook: "Local",
      created_at: job.created_at,
      progress: job.progress,
    };
  }, []);

  // ── Auth ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (isTauriMode) {
      if (!tauriCtxUser) {
        router.push("/login");
        return;
      }
      setUser({ email: tauriCtxUser.email, id: tauriCtxUser.id });
      setTier(tauriCtxUser.tier as "free" | "pro");
      setTierLimit(tauriCtxUser.tier === "pro" ? 999 : 3);
      setLoading(false);
      return;
    }

    const fetchUser = async () => {
      const u = await getUser();
      if (!u) {
        router.push("/login");
        return;
      }
      setUser(u);
      setTier(u.tier as "free" | "pro");
      setTierLimit(u.tier === "pro" ? 999 : 3);
      setLoading(false);
    };
    fetchUser();
  }, [isTauriMode, tauriCtxUser, router]);

  // ── Fetch videos/jobs ──────────────────────────────────────────────
  const fetchItems = useCallback(async () => {
    try {
      if (isTauriMode) {
        if (!tauriCtxUser) return;
        const jobs = await tauriListJobs(tauriCtxUser.id);
        setTauriJobs(jobs);
        const videoItems: Video[] = jobs
          .filter((j: MontageJob) => j.status === "done")
          .map(tauriJobToVideo);
        setVideos(videoItems);
        setTierUsed(videoItems.length);
      } else {
        const [videoData, jobData] = await Promise.all([
          getVideos(),
          getJobs(),
        ]);
        setVideos(videoData);
        setJobs(jobData);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("401") || msg.includes("unauthorized")) {
        toast.error("Session expired");
        router.push("/login");
        return;
      }
      if (!isTauriMode) {
        toast.error("Connection lost. Retrying...");
        setTimeout(fetchItems, 3000);
      }
    } finally {
      setVideosLoading(false);
    }
  }, [isTauriMode, tauriCtxUser, router, tauriJobToVideo]);

  // Fetch tier info from /api/me for web mode
  useEffect(() => {
    if (isTauriMode) return;
    if (!loading && user) {
      getUser().then((u) => {
        if (u) {
          setTier(u.tier as "free" | "pro");
          setTierLimit(u.tier === "pro" ? 999 : 3);
          setTierUsed(u.videos_this_month || 0);
        }
      });
    }
  }, [loading, user, isTauriMode]);

  useEffect(() => {
    if (!loading && (user || (isTauriMode && tauriCtxUser))) {
      fetchItems();
    }
  }, [loading, user, isTauriMode, tauriCtxUser, fetchItems]);

  // Poll for processing jobs
  useEffect(() => {
    const processingItems = isTauriMode
      ? tauriJobs.filter((j) => j.status === "processing" || j.status === "pending")
      : [...videos, ...jobs].filter(
          (v) =>
            v.status !== "completed" &&
            v.status !== "done" &&
            v.status !== "failed",
        );
    if (processingItems.length === 0) return;
    const interval = setInterval(fetchItems, 3000);
    return () => clearInterval(interval);
  }, [isTauriMode, tauriJobs, videos, jobs, fetchItems]);

  // ── Create job ─────────────────────────────────────────────────────
  const handleCreate = async (params: {
    pipeline: string;
    title: string;
    topic: string;
    duration: string;
    platform: string;
    style: string;
    template: string;
  }) => {
    setCreating(true);
    try {
      if (isTauriMode) {
        if (!tauriCtxUser) throw new Error("Not logged in");
        const job = await tauriCreateJob(tauriCtxUser.id, {
          title: params.title,
          topic: params.topic || undefined,
          duration: parseInt(params.duration) || 60,
          platform: params.platform,
          style: params.style,
          pipeline: params.pipeline,
        });
        toast.success("Video job created");
        tauriRunPipeline(job.id).catch(() => {});
        fetchItems();
      } else {
        const job = await createJob(params);
        setActiveJobId(job.id);
        setComposition({
          title: params.title,
          topic: params.topic || params.title,
          platform: params.platform,
          style: params.style,
          duration: params.duration,
          template: params.template || "hook_3points_cta",
        } as any);
        toast.success("Video job created");
        fetchItems();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create job";
      if (msg.includes("rate") || msg.includes("limit") || msg.includes("Tier limit")) {
        toast.error("You've used all your free videos. Upgrade to Pro.");
      } else {
        toast.error(msg);
      }
    } finally {
      setCreating(false);
    }
  };

  const handleDownload = async (id: string) => {
    try {
      if (isTauriMode) {
        const job = tauriJobs.find((j) => j.id === id);
        if (job?.result_path) {
          window.open(`file://${job.result_path}`, "_blank");
          return;
        }
      }
      const url = await getVideoDownloadUrl(id);
      window.open(url, "_blank");
    } catch {
      toast.error("Failed to get download URL");
    }
  };

  const handleRetry = async (_id: string) => {
    toast.info("Retry coming soon");
  };

  const displayUser = user;

  // Map non-completed backend jobs to Video shape for gallery display
  const jobVideos: Video[] = isTauriMode
    ? []
    : jobs
        .filter((j) => j.status !== "completed")
        .map((job) => ({
          id: job.id,
          title: (job as any).params?.title || job.title || "Untitled",
          status: job.status === "failed" ? "failed" : "processing",
          created_at: job.created_at,
          progress: job.progress,
          progress_message: job.progress_message,
          stage: job.status,
          stage_started_at: job.stage_started_at,
        }));

  const allItems: Video[] = isTauriMode
    ? tauriJobs.map(tauriJobToVideo)
    : [...jobVideos, ...videos].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <SpinnerIcon size={32} className="text-[var(--accent)]" />
      </div>
    );
  }

  const doneCount = isTauriMode
    ? allItems.filter((v: { status: string }) => v.status === "done").length
    : tierUsed;

  const platformLabels: Record<string, string> = {
    "tiktok-9:16": "TikTok (9:16)",
    "youtube-16:9": "YouTube (16:9)",
    "instagram-1:1": "Instagram (1:1)",
  };
  const styleLabels: Record<string, string> = {
    "clean-professional": "Clean Professional",
    "flat-motion": "Flat Motion",
    "minimalist": "Minimalist",
  };
  const templateLabels: Record<string, string> = {
    "nerdologia": "Nerdologia",
    "hook_3points_cta": "Hook + 3 Pontos + CTA",
    "problem_solution": "Problema → Solução",
  };

  return (
    <div className="flex flex-col min-h-screen">
      <header className="flex items-center justify-between px-6 py-3 border-b border-[var(--border)]">
        <Link href="/" className="text-lg font-bold tracking-widest">
          MON<span className="text-[var(--accent)]">†</span>AGE
        </Link>
        <div className="flex items-center gap-3">
          {displayUser?.email && (
            <span className="text-xs font-mono text-[var(--text-tertiary)] hidden sm:block">
              {displayUser.email}
            </span>
          )}
          <div className="p-2 border border-[var(--border)]">
            <UserIcon size={18} className="text-[var(--text-secondary)]" />
          </div>
          {isTauriMode ? (
            <button
              onClick={() => tauriLogout()}
              className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider border border-[var(--border)] hover:border-[var(--accent-red)] hover:text-[var(--accent-red)] transition-colors"
            >
              Logout
            </button>
          ) : (
            <LogoutButton />
          )}
        </div>
      </header>

      <div className="flex-1 max-w-5xl w-full mx-auto px-4 py-6 space-y-6">
        <TierBadge tier={tier} used={doneCount} limit={tierLimit} />

        {/* ── Tab Navigation ────────────────────────────────────────── */}
        <div className="flex border-b border-[var(--border)]">
          <button
            onClick={() => setActiveTab("create")}
            className={`px-6 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors ${
              activeTab === "create"
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            }`}
          >
            Criar Vídeo
          </button>
          <button
            onClick={() => setActiveTab("videos")}
            className={`px-6 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors ${
              activeTab === "videos"
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            }`}
          >
            Vídeos Gerados ({allItems.filter(v => v.status === "done").length})
          </button>
        </div>

        {/* ── Tab: Criar Vídeo ──────────────────────────────────────── */}
        {activeTab === "create" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Form */}
            <div className="space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                Novo Vídeo
              </h2>

              {!creating && doneCount >= tierLimit && tier === "free" ? (
                <div className="border border-[var(--accent)] bg-[var(--accent)]/5 p-6 text-center space-y-3">
                  <p className="text-sm font-bold">
                    Você usou os {tierLimit} vídeos gratuitos deste mês.
                  </p>
                  <p className="text-sm text-[var(--text-secondary)]">
                    Upgrade para Pro para criar vídeos ilimitados.
                  </p>
                  <Link
                    href="/settings"
                    className="inline-block px-6 py-3 text-xs font-bold uppercase tracking-wider bg-[var(--accent)] text-black border border-[var(--accent)] hover:bg-transparent hover:text-[var(--accent)] transition-colors"
                  >
                    Upgrade to Pro
                  </Link>
                </div>
              ) : (
                <CreateForm onSubmit={handleCreate} loading={creating} />
              )}
            </div>

            {/* Composition Panel */}
            <div className="space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                Composição
              </h2>

              {composition ? (
                <div className="border border-[var(--border)] bg-[var(--bg-secondary)]">
                  <div className="divide-y divide-[var(--border)]">
                    <div className="px-4 py-3">
                      <span className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider">Título</span>
                      <p className="text-sm font-medium mt-0.5">{composition.title}</p>
                    </div>
                    <div className="px-4 py-3">
                      <span className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider">Tema / Tópico</span>
                      <p className="text-sm font-medium mt-0.5">{composition.topic}</p>
                    </div>
                    <div className="px-4 py-3">
                      <span className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider">Plataforma</span>
                      <p className="text-sm font-mono mt-0.5">
                        {platformLabels[composition.platform] || composition.platform}
                      </p>
                    </div>
                    <div className="px-4 py-3">
                      <span className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider">Estilo</span>
                      <p className="text-sm font-mono mt-0.5">
                        {styleLabels[composition.style] || composition.style}
                      </p>
                    </div>
                    <div className="px-4 py-3">
                      <span className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider">Duração</span>
                      <p className="text-sm font-mono mt-0.5">{composition.duration}s</p>
                    </div>
                    <div className="px-4 py-3">
                      <span className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider">Template</span>
                      <p className="text-sm font-mono mt-0.5">
                        {templateLabels[(composition as any).template] || (composition as any).template || "Hook + 3 Pontos"}
                      </p>
                    </div>
                  </div>
                  {activeJobId && (
                    <div className="border-t border-[var(--border)] p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <SpinnerIcon size={14} className="text-[var(--accent)] animate-spin" />
                        <span className="text-xs font-mono text-[var(--text-tertiary)]">
                          Pipeline em andamento...
                        </span>
                      </div>
                      <button
                        onClick={() => setActiveJobId(null)}
                        className="text-[10px] font-mono text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] underline"
                      >
                        Esconder progresso
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="border border-dashed border-[var(--border)] bg-[var(--bg-secondary)] p-6 text-center">
                  <p className="text-xs text-[var(--text-tertiary)] font-mono">
                    Preencha o formulário e crie um vídeo.
                  </p>
                  <p className="text-xs text-[var(--text-tertiary)] font-serif italic mt-1">
                    O roteiro, tema e composição aparecerão aqui.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Tab: Vídeos Gerados ───────────────────────────────────── */}
        {activeTab === "videos" && (
          <section>
            <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-4">
              Vídeos Gerados ({allItems.filter(v => v.status === "done").length})
            </h2>

            {videosLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="border border-[var(--border)] bg-[var(--bg-secondary)] animate-pulse"
                  >
                    <div className="aspect-video bg-[var(--bg-tertiary)]" />
                    <div className="p-3 space-y-2">
                      <div className="h-4 bg-[var(--bg-tertiary)] w-3/4" />
                      <div className="h-3 bg-[var(--bg-tertiary)] w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : allItems.length === 0 ? (
              <div className="border border-[var(--border)] bg-[var(--bg-secondary)] p-8 text-center">
                <p className="text-sm text-[var(--text-secondary)] mb-2">
                  Nenhum vídeo ainda.
                </p>
                <button
                  onClick={() => setActiveTab("create")}
                  className="text-xs font-bold uppercase tracking-wider text-[var(--accent)] hover:underline"
                >
                  Criar primeiro vídeo →
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {allItems.map((video) => (
                  <VideoCard
                    key={video.id}
                    video={video}
                    onDownload={handleDownload}
                    onRetry={handleRetry}
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {/* Progress Overlay */}
      {activeJobId && (
        <ProgressOverlay
          jobId={activeJobId}
          onClose={() => setActiveJobId(null)}
        />
      )}
    </div>
  );
}
