"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { SpinnerIcon, DownloadIcon, TrashIcon, CopyIcon } from "@/components/IconComponents";
import ConfirmDialog from "@/components/ConfirmDialog";
import JobProgress from "@/components/JobProgress";
import { getVideo, getVideoDownloadUrl, deleteVideo, type Video } from "@/lib/api";
import { getUser } from "@/lib/auth-client";

interface VideoDetailClientProps {
  id: string;
}

export default function VideoDetailClient({ id }: VideoDetailClientProps) {
  const router = useRouter();

  const [video, setVideo] = useState<Video | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      const user = await getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      try {
        const data = await getVideo(id);
        setVideo(data);
      } catch (err: any) {
        if (err.message?.includes("401") || err.message?.includes("Session expired")) {
          toast.error("Session expired");
          router.push("/login");
          return;
        }
        toast.error("Failed to load video");
        router.push("/dashboard");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id, router]);

  // Poll while processing
  useEffect(() => {
    if (!video || video.status !== "processing") return;

    const interval = setInterval(async () => {
      try {
        const updated = await getVideo(id);
        setVideo(updated);
        if (updated.status !== "processing") clearInterval(interval);
      } catch {
        // silent
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [video?.status, id]);

  const handleDownload = async () => {
    if (!video) return;
    try {
      const url = await getVideoDownloadUrl(id);
      window.open(url, "_blank");
    } catch {
      toast.error("Failed to download video");
    }
  };

  const handleDelete = async () => {
    if (!video) return;
    setDeleting(true);
    try {
      await deleteVideo(id);
      toast.success("Video deleted");
      router.push("/dashboard");
    } catch {
      toast.error("Failed to delete video");
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  const handleCreateSimilar = () => {
    navigator.clipboard.writeText(video?.title || "");
    toast.success("Title copied — head to dashboard");
    router.push("/dashboard");
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <SpinnerIcon size={32} className="text-[var(--accent)]" />
      </div>
    );
  }

  if (!video) return null;

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const formatSize = (bytes?: number) => {
    if (!bytes) return "—";
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-[var(--border)]">
        <Link href="/" className="text-lg font-bold tracking-widest">
          MON<span className="text-[var(--accent)]">†</span>AGE
        </Link>
        <Link
          href="/dashboard"
          className="text-xs font-mono text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
        >
          ← Dashboard
        </Link>
      </header>

      <div className="flex-1 max-w-3xl w-full mx-auto px-4 py-8 space-y-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs font-mono text-[var(--text-tertiary)]">
          <Link href="/dashboard" className="hover:text-[var(--text-primary)] transition-colors">
            Dashboard
          </Link>
          <span>/</span>
          <span className="text-[var(--text-secondary)] truncate max-w-[200px]">
            {video.title}
          </span>
        </div>

        {/* Video player */}
        {video.status === "done" ? (
          <div className="aspect-video bg-black border border-[var(--border)]">
            {video.thumbnail_url ? (
              <video
                controls
                poster={video.thumbnail_url}
                className="w-full h-full object-contain"
              >
                <source
                  src={video.thumbnail_url.replace("/thumbnail", "/video")}
                  type="video/mp4"
                />
              </video>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[var(--text-tertiary)]">
                <span className="text-sm font-mono">Video ready</span>
              </div>
            )}
          </div>
        ) : video.status === "processing" ? (
          <div className="aspect-video border border-[var(--border)] bg-[var(--bg-tertiary)] flex flex-col items-center justify-center gap-4 p-8">
            <SpinnerIcon size={40} className="text-[var(--accent)]" />
            <JobProgress stage={video.stage || "processing"} progress={video.progress || 0} />
          </div>
        ) : (
          <div className="aspect-video border border-[var(--accent-red)] bg-[var(--accent-red)]/5 flex flex-col items-center justify-center gap-2">
            <span className="text-sm font-bold text-[var(--accent-red)] uppercase tracking-wider">
              Generation failed
            </span>
            <span className="text-xs text-[var(--text-tertiary)] font-mono">
              Try again or create a new video
            </span>
          </div>
        )}

        {/* Title */}
        <h1 className="text-2xl font-bold">{video.title}</h1>

        {/* Metadata card */}
        <div className="border border-[var(--border)] bg-[var(--bg-secondary)] divide-y divide-[var(--border)]">
          {[
            ["Duration", video.duration],
            ["Created", formatDate(video.created_at)],
            ["Style", video.style],
            ["Platform", video.platform],
            ["Size", formatSize(video.size)],
          ].map(([label, value]) => (
            <div
              key={label as string}
              className="flex items-center justify-between px-4 py-3"
            >
              <span className="text-xs font-mono text-[var(--text-tertiary)] uppercase tracking-wider">
                {label as string}
              </span>
              <span className="text-sm text-[var(--text-secondary)] font-mono">
                {value as string}
              </span>
            </div>
          ))}
        </div>

        {/* Actions */}
        {video.status === "done" && (
          <div className="flex gap-3">
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-4 py-3 text-xs font-bold uppercase tracking-wider bg-[var(--accent)] text-black border border-[var(--accent)] hover:bg-transparent hover:text-[var(--accent)] transition-colors"
            >
              <DownloadIcon size={16} />
              Download
            </button>
            <button
              onClick={handleCreateSimilar}
              className="flex items-center gap-2 px-4 py-3 text-xs font-bold uppercase tracking-wider border border-[var(--border)] text-[var(--text-primary)] hover:border-[var(--text-tertiary)] transition-colors"
            >
              <CopyIcon size={16} />
              Create similar
            </button>
            <button
              onClick={() => setDeleteOpen(true)}
              className="flex items-center gap-2 px-4 py-3 text-xs font-bold uppercase tracking-wider border border-[var(--accent-red)] text-[var(--accent-red)] hover:bg-[var(--accent-red)] hover:text-black transition-colors ml-auto"
            >
              <TrashIcon size={16} />
              Delete
            </button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete Video"
        message="Are you sure you want to delete this video? This cannot be undone."
        confirmLabel={deleting ? "Deleting..." : "Delete"}
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => {
          setDeleteOpen(false);
        }}
      />
    </div>
  );
}
