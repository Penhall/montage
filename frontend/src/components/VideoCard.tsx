"use client";

import Link from "next/link";
import {
  PlayIcon,
  SpinnerIcon,
  CheckIcon,
  XIcon,
  DownloadIcon,
  RetryIcon,
} from "./IconComponents";
import JobProgress from "./JobProgress";
import type { Video } from "@/lib/api";

interface VideoCardProps {
  video: Video;
  onDownload?: (id: string) => void;
  onRetry?: (id: string) => void;
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function VideoCard({ video, onDownload, onRetry }: VideoCardProps) {
  return (
    <Link
      href={`/videos/${video.id}`}
      className="block border border-[var(--border)] bg-[var(--bg-secondary)] hover:border-[var(--text-tertiary)] transition-colors group"
    >
      {/* Thumbnail area */}
      <div
        className={`relative aspect-video flex items-center justify-center overflow-hidden ${
          video.status === "failed" ? "bg-[var(--accent-red)]/10" : "bg-[var(--bg-tertiary)]"
        }`}
      >
        {video.status === "processing" && (
          <div className="flex flex-col items-center gap-3 p-4 w-full">
            <SpinnerIcon size={32} className="text-[var(--accent)]" />
            <JobProgress
              stage={video.stage || "processing"}
              progress={video.progress || 0}
            />
          </div>
        )}

        {video.status === "done" && (
          <>
            {video.thumbnail_url ? (
              <img
                src={video.thumbnail_url}
                alt={video.title}
                className="object-cover w-full h-full"
              />
            ) : (
              <div className="flex items-center justify-center w-full h-full bg-[var(--bg-tertiary)]">
                <PlayIcon size={48} className="text-[var(--text-tertiary)] group-hover:text-[var(--accent)] transition-colors" />
              </div>
            )}
          </>
        )}

        {video.status === "failed" && (
          <div className="flex flex-col items-center gap-2">
            <XIcon size={32} className="text-[var(--accent-red)]" />
            <span className="text-xs font-bold uppercase text-[var(--accent-red)] tracking-wider">
              Failed
            </span>
          </div>
        )}
      </div>

      {/* Info area */}
      <div className="p-3 space-y-1">
        <h3 className="text-sm font-medium truncate">{video.title}</h3>
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-[var(--text-tertiary)]">
            {video.duration}
          </span>
          <span className="text-xs font-mono text-[var(--text-tertiary)]">
            {relativeTime(video.created_at)}
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 pt-1">
          {video.status === "done" && onDownload && (
            <button
              onClick={(e) => {
                e.preventDefault();
                onDownload(video.id);
              }}
              className="p-1 text-[var(--text-tertiary)] hover:text-[var(--accent-green)] transition-colors"
              title="Download"
            >
              <DownloadIcon size={16} />
            </button>
          )}
          {video.status === "failed" && onRetry && (
            <button
              onClick={(e) => {
                e.preventDefault();
                onRetry(video.id);
              }}
              className="p-1 text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors"
              title="Retry"
            >
              <RetryIcon size={16} />
            </button>
          )}
        </div>
      </div>
    </Link>
  );
}
