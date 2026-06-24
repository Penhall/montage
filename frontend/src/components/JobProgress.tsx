interface JobProgressProps {
  stage: string;
  progress: number;
}

const STAGE_LABELS: Record<string, string> = {
  researching: "Researching topic",
  scripting: "Generating script",
  gathering: "Gathering assets",
  rendering: "Rendering video",
};

export default function JobProgress({ stage, progress }: JobProgressProps) {
  const label = STAGE_LABELS[stage] || stage || "Processing";

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-[var(--text-secondary)]">
          {label}
        </span>
        <span className="text-xs font-mono text-[var(--text-tertiary)]">
          {Math.round(progress)}%
        </span>
      </div>
      <div className="h-1 w-full bg-[var(--bg-tertiary)]">
        <div
          className="h-full bg-[var(--accent)] transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
