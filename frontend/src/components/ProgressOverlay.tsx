"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import JobProgress from "./JobProgress";
import { XIcon, CheckIcon, SpinnerIcon } from "./IconComponents";
import { getJob, type Job } from "@/lib/api";

interface ProgressOverlayProps {
  jobId: string;
  onClose: () => void;
}

export default function ProgressOverlay({ jobId, onClose }: ProgressOverlayProps) {
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchJob = useCallback(async () => {
    try {
      const data = await getJob(jobId);
      setJob(data);
      setError(null);

      // Stop polling when job reaches terminal state
      if (data.status === "completed" || data.status === "failed") {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to fetch progress";
      setError(msg);
    }
  }, [jobId]);

  useEffect(() => {
    fetchJob(); // Initial fetch
    pollRef.current = setInterval(fetchJob, 1500); // Poll every 1.5s

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, [fetchJob]);

  const isDone = job?.status === "completed";
  const isFailed = job?.status === "failed";
  // Backend status values ARE the stage identifiers (researching, scripting, etc.)
  const stage = job?.status || "pending";
  // Title is nested in params from backend JobDetail
  const title = (job as any)?.params?.title || "Untitled";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
          <h2 className="text-sm font-bold uppercase tracking-wider">
            {isDone ? "Video Created" : isFailed ? "Creation Failed" : "Creating Video"}
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
            title="Close"
          >
            <XIcon size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Title */}
          {job && (
            <p className="text-sm font-medium truncate">{title}</p>
          )}

          {/* Progress */}
          <JobProgress
            stage={stage}
            progress={job?.progress || 0}
            progressMessage={
              isDone
                ? "Video ready!"
                : isFailed
                  ? job?.error || "Unknown error"
                  : job?.progress_message
            }
            stageStartedAt={job?.stage_started_at}
            createdAt={job?.created_at}
          />

          {/* Error state */}
          {error && (
            <p className="text-xs text-[var(--accent-red)] font-mono">
              Connection lost. Retrying...
            </p>
          )}

          {/* Done state */}
          {isDone && (
            <div className="flex items-center gap-2 pt-2">
              <CheckIcon size={20} className="text-[var(--accent-green)]" />
              <span className="text-sm text-[var(--accent-green)] font-medium">
                Video generated successfully
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2">
            {isDone && (
              <button
                onClick={() => {
                  onClose();
                  router.push(`/videos/${jobId}`);
                }}
                className="flex-1 px-4 py-2.5 text-xs font-bold uppercase tracking-wider bg-[var(--accent)] text-black border border-[var(--accent)] hover:bg-transparent hover:text-[var(--accent)] transition-colors"
              >
                View Video
              </button>
            )}

            {!isDone && !isFailed && (
              <div className="flex items-center gap-2 w-full justify-center py-2">
                <SpinnerIcon size={16} className="text-[var(--accent)] animate-spin" />
                <span className="text-xs text-[var(--text-tertiary)] font-mono">
                  This may take 60–90 seconds
                </span>
              </div>
            )}

            {isFailed && (
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2.5 text-xs font-bold uppercase tracking-wider border border-[var(--accent-red)] text-[var(--accent-red)] hover:bg-[var(--accent-red)]/10 transition-colors"
              >
                Close
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
