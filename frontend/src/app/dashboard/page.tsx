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

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [videos, setVideos] = useState<Video[]>([]);
  const [videosLoading, setVideosLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [tier, setTier] = useState<"free" | "pro">("free");
  const [tierUsed, setTierUsed] = useState(0);
  const [tierLimit, setTierLimit] = useState(3);

  // Fetch user
  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setUser(user);
      setLoading(false);
    };
    getUser();
  }, [supabase, router]);

  // Fetch videos
  const fetchVideos = useCallback(async () => {
    try {
      const data = await getVideos();
      setVideos(data);
      setTierUsed(data.length);
    } catch (err: any) {
      if (err.message?.includes("401") || err.message?.includes("unauthorized") || err.message?.includes("Session expired")) {
        toast.error("Session expired");
        router.push("/login");
        return;
      }
      toast.error("Connection lost. Retrying...");
      // Auto-retry after 3s
      setTimeout(fetchVideos, 3000);
    } finally {
      setVideosLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (!loading && user) {
      fetchVideos();
    }
  }, [loading, user, fetchVideos]);

  // Poll for updates when any job is processing
  useEffect(() => {
    const hasProcessing = videos.some((v) => v.status === "processing");
    if (!hasProcessing) return;

    const interval = setInterval(fetchVideos, 5000);
    return () => clearInterval(interval);
  }, [videos, fetchVideos]);

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
      await createJob(params);
      toast.success("Video job created");
      fetchVideos();
    } catch (err: any) {
      if (err.message?.includes("rate") || err.message?.includes("limit")) {
        toast.error("You've used all 3 free videos this month. Upgrade to Pro.");
      } else {
        toast.error(err.message || "Failed to create job");
      }
    } finally {
      setCreating(false);
    }
  };

  const handleDownload = async (id: string) => {
    try {
      const url = await getVideoDownloadUrl(id);
      window.open(url, "_blank");
    } catch {
      toast.error("Failed to get download URL");
    }
  };

  const handleRetry = async (id: string) => {
    // For now, this is a stub — re-creates a job
    toast.info("Retry coming soon");
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <SpinnerIcon size={32} className="text-[var(--accent)]" />
      </div>
    );
  }

  const doneCount = videos.filter((v) => v.status === "done").length;

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-[var(--border)]">
        <Link href="/" className="text-lg font-bold tracking-widest">
          MON<span className="text-[var(--accent)]">†</span>AGE
        </Link>
        <div className="flex items-center gap-3">
          {user?.email && (
            <span className="text-xs font-mono text-[var(--text-tertiary)] hidden sm:block">
              {user.email}
            </span>
          )}
          <div className="p-2 border border-[var(--border)]">
            <UserIcon size={18} className="text-[var(--text-secondary)]" />
          </div>
          <LogoutButton />
        </div>
      </header>

      <div className="flex-1 max-w-5xl w-full mx-auto px-4 py-6 space-y-6">
        {/* Tier indicator */}
        <TierBadge tier={tier} used={doneCount} limit={tierLimit} />

        {/* Rate-limited overlay */}
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

        {/* Create form */}
        {!(!creating && doneCount >= tierLimit && tier === "free") && (
          <CreateForm onSubmit={handleCreate} loading={creating} />
        )}

        {/* Gallery */}
        <section>
          <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-4">
            Your Videos ({videos.length})
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
          ) : videos.length === 0 ? (
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
              {videos.map((video) => (
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
