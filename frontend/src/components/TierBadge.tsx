"use client";

interface TierBadgeProps {
  tier: "free" | "pro";
  used: number;
  limit: number;
}

export default function TierBadge({ tier, used, limit }: TierBadgeProps) {
  const isPro = tier === "pro";
  const remaining = limit - used;

  return (
    <div className="flex items-center justify-between px-4 py-3 border border-[var(--border)] bg-[var(--bg-secondary)]">
      <div className="flex items-center gap-3">
        <span
          className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 border ${
            isPro
              ? "border-[var(--accent-green)] text-[var(--accent-green)]"
              : "border-[var(--text-tertiary)] text-[var(--text-tertiary)]"
          }`}
        >
          {tier}
        </span>
        <span className="text-sm text-[var(--text-secondary)] font-mono">
          {used}/{limit} videos this month
        </span>
      </div>
      {!isPro && (
        <a
          href="/settings"
          className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 border border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-black transition-colors"
        >
          Upgrade to Pro →
        </a>
      )}
    </div>
  );
}
