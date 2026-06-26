"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import CreateForm from "@/components/CreateForm";
import VideoCard from "@/components/VideoCard";
import TierBadge from "@/components/TierBadge";
import LogoutButton from "@/components/LogoutButton";
import { UserIcon, SpinnerIcon } from "@/components/IconComponents";
import { createJob, getVideos, getVideoDownloadUrl, type Video } from "@/lib/api";
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
  const supabase = createClient();
  const { user: tauriUser, isTauriMode } = useAuth();
  const { logout: tauriLogout } = useAuth();

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [videos, setVideos] = useState<Video[]>([]);
  const [tauriJobs, setTauriJobs] = useState<MontageJob[]>([]);
  const [videosLoading, setVideosLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [tier, setTier] = useState<"free" | "pro">("free");
  const [tierUsed, setTierUsed] = useState(0);
  const [tierLimit, setTierLimit] = useState(3);

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
      duration: "0s",
      platform: "Desktop",
      style: "Local",
      created_at: job.created_at,
      progress: job.progress,
    };
  }, []);

  // ── Tauri mode: auth from context ──────────────────────────────────
  useEffect(() => {
    if (!isTauriMode) return;
    if (tauriUser) {
      setUser({ email: tauriUser.email, id: tauriUser.id });
      setTier(tauriUser.tier as "free" | "pro");
      setTierUsed(tauriUser.videos_this_month);
      setTierLimit(tauriUser.tier === "pro" ? 999 : 3);
      setLoading(false);
    } else {
      router.push("/login");
    }
  }, [isTauriMode, tauriUser, router]);

  // ── Web mode: Supabase auth ────────────────────────────────────────
  useEffect(() => {
    if (isTauriMode) return;
    const getUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.push("/login");
        return;
      }
      setUser(data.user);
      setLoading(false);
    };
    getUser();
  }, [isTauriMode, supabase, router]);

  // ── Fetch videos/jobs ──────────────────────────────────────────────
  const fetchItems = useCallback(async () => {
    try {
      if (isTauriMode && tauriUser) {
        const jobs = await tauriListJobs(tauriUser.id);
        setTauriJobs(jobs);
        // Convert to Video format for the gallery
        const videoItems: Video[] = jobs
          .filter((j) => j.status === "done")
          .map(tauriJobToVideo);
        setVideos(videoItems);
        setTierUsed(tauriUser.videos_this_month);
      } else {
        const data = await getVideos();
        setVideos(data);
        setTierUsed(data.length);
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
  }, [isTauriMode, tauriUser, router, tauriJobToVideo]);

  useEffect(() => {
    if (!loading && (user || tauriUser)) {
      fetchItems();
    }
  }, [loading, user, tauriUser, fetchItems]);

  // Poll for processing jobs
  useEffect(() => {
    const processingJobs = isTauriMode
      ? tauriJobs.filter((j) => j.status === "processing" || j.status === "pending")
      : videos.filter((v) => v.status === "processing");
    if (processingJobs.length === 0) return;
    const interval = setInterval(fetchItems, 5000);
    return () => clearInterval(interval);
  }, [isTauriMode, tauriJobs, videos, fetchItems]);

  // ── Create job ─────────────────────────────────────────────────────
  const handleCreate = async (params: {
    pipeline: string;
    title: string;
    topic: string;
    duration: string;
    platform: string;
    style: string;
  }) => {
    setCreating(true);
    try {
      if (isTauriMode && tauriUser) {
        const job = await tauriCreateJob(tauriUser.id, {
          title: params.title,
          topic: params.topic || undefined,
          duration: parseInt(params.duration) || 60,
          platform: params.platform,
          style: params.style,
          pipeline: params.pipeline,
        });
        toast.success("Video job created");
        // Start pipeline in background
        tauriRunPipeline(job.id).catch(() => {});
        fetchItems();
      } else {
        await createJob(params);
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

  const displayUser = user || (tauriUser ? { email: tauriUser.email } : null);
  const allItems: Video[] = isTauriMode
    ? tauriJobs.map(tauriJobToVideo)
    : videos;

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <SpinnerIcon size={32} className="text-[var(--accent)]" />
      </div>
    );
  }

  const doneCount = allItems.filter(
    (v: { status: string }) => v.status === "done",
  ).length;

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
              onClick={tauriLogout}
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

        {!creating && doneCount >= tierLimit && tier === "free" && (
          <div className="border border-[var(--accent)] bg-[var(--accent)]/5 p-6 text-center space-y-3">
            <p className="text-sm font-bold">
              You&apos;ve used all {tierLimit} free videos this month.
            </p>
            <p className="text-sm text-[var(--text-secondary)]">
              Upgrade to Pro for unlimited video creation.
            </p>
            <Link
              href="/settings"
              className="inline-block px-6 py-3 text-xs font-bold uppercase tracking-wider bg-[var(--accent)] text-black border border-[var(--accent)] hover:bg-transparent hover:text-[var(--accent)] transition-colors"
            >
              Upgrade to Pro
            </Link>
          </div>
        )}

        {!(!creating && doneCount >= tierLimit && tier === "free") && (
          <CreateForm onSubmit={handleCreate} loading={creating} />
        )}

        <section>
          <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-4">
            Your Videos ({allItems.length})
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
                No videos yet. Create your first one above.
              </p>
              <p className="text-xs text-[var(--text-tertiary)] font-serif italic">
                Try &ldquo;Explainer video about AI&rdquo;
              </p>
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
      </div>
    </div>
  );
}
