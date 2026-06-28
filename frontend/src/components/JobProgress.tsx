"use client";

import { useState, useEffect, useRef } from "react";

interface JobProgressProps {
  stage: string;
  progress: number;
  progressMessage?: string;
  stageStartedAt?: string;
  createdAt?: string;
}

const STAGE_LABELS: Record<string, string> = {
  pending: "Preparing",
  researching: "Researching topic",
  scripting: "Writing script",
  gathering_images: "Gathering images",
  generating_tts: "Generating audio",
  rendering: "Rendering video",
  uploading: "Saving video",
  completed: "Complete",
  failed: "Failed",
};

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function JobProgress({
  stage,
  progress,
  progressMessage,
  stageStartedAt,
  createdAt,
}: JobProgressProps) {
  const label = STAGE_LABELS[stage] || stage || "Processing";
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    // Determine the best start timestamp for the elapsed timer
    let startMs: number | null = null;

    // Prefer stage_started_at for per-stage timer
    if (stageStartedAt) {
      startMs = new Date(stageStartedAt).getTime();
    } else if (createdAt) {
      // Fall back to job creation time for total elapsed
      startMs = new Date(createdAt).getTime();
    } else {
      // Final fallback: use component mount time
      startMs = Date.now();
    }

    startRef.current = startMs;

    // Update elapsed every second
    const update = () => {
      if (startRef.current) {
        setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
      }
    };
    update();
    const interval = setInterval(update, 1000);

    return () => clearInterval(interval);
  }, [stageStartedAt, createdAt, stage]);

  // Reset elapsed when stage_started_at changes
  useEffect(() => {
    if (stageStartedAt) {
      startRef.current = new Date(stageStartedAt).getTime();
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }
  }, [stageStartedAt]);

  const isDone = stage === "completed";
  const isFailed = stage === "failed";

  return (
    <div className="w-full space-y-2">
      {/* Stage label + timer */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-[var(--text-secondary)]">
          {label}
        </span>
        <span className="text-xs font-mono text-[var(--text-tertiary)] tabular-nums">
          {isDone ? "✓" : isFailed ? "✗" : formatElapsed(elapsed)}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 w-full bg-[var(--bg-tertiary)] overflow-hidden">
        <div
          className={`h-full transition-all duration-500 ${
            isFailed ? "bg-[var(--accent-red)]" : "bg-[var(--accent)]"
          }`}
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>

      {/* Progress percentage + detail message */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono text-[var(--text-tertiary)]">
          {Math.round(progress)}%
        </span>
        {progressMessage && (
          <span className="text-[10px] font-mono text-[var(--text-tertiary)] truncate max-w-[60%] text-right">
            {progressMessage}
          </span>
        )}
      </div>
    </div>
  );
}
