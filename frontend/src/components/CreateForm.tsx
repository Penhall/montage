"use client";

import { useState } from "react";
import { ChevronDownIcon, SpinnerIcon, SparklesIcon } from "./IconComponents";

const PIPELINES = [
  { value: "animated-explainer", label: "Animated Explainer" },
  { value: "social-clip", label: "Social Clip" },
];

const DURATIONS = ["30s", "60s", "90s"];

const PLATFORMS = [
  { value: "tiktok-9:16", label: "TikTok 9:16" },
  { value: "youtube-16:9", label: "YouTube 16:9" },
  { value: "instagram-1:1", label: "Instagram 1:1" },
];

const STYLES = [
  { value: "clean-professional", label: "Clean Professional" },
  { value: "flat-motion", label: "Flat Motion" },
  { value: "minimalist", label: "Minimalist" },
];

const TEMPLATES = [
  { value: "nerdologia", label: "Nerdologia (educacional rápido)" },
  { value: "hook_3points_cta", label: "Hook + 3 Pontos + CTA" },
  { value: "problem_solution", label: "Problema → Solução (demo)" },
];

interface CreateFormProps {
  onSubmit: (params: {
    pipeline: string;
    title: string;
    topic: string;
    duration: string;
    platform: string;
    style: string;
    template: string;
  }) => Promise<void>;
  loading: boolean;
}

export default function CreateForm({ onSubmit, loading }: CreateFormProps) {
  const [pipeline, setPipeline] = useState(PIPELINES[0].value);
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [duration, setDuration] = useState(DURATIONS[0]);
  const [platform, setPlatform] = useState(PLATFORMS[0].value);
  const [style, setStyle] = useState(STYLES[0].value);
  const [_template, setTemplate] = useState(TEMPLATES[0].value);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await onSubmit({ pipeline, title: title.trim(), topic: topic.trim(), duration, platform, style, template: _template });
  };

  return (
    <form onSubmit={handleSubmit} className="border border-[var(--border)] bg-[var(--bg-secondary)] p-4 space-y-4">
      <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">
        Create New Video
      </h2>

      {/* Pipeline + Title row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="block text-xs font-mono text-[var(--text-tertiary)] uppercase tracking-wider">
            Pipeline
          </label>
          <div className="relative">
            <select
              value={pipeline}
              onChange={(e) => setPipeline(e.target.value)}
              className="w-full appearance-none bg-[var(--bg-tertiary)] border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--border-active)] transition-colors"
            >
              {PIPELINES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            <ChevronDownIcon size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" />
          </div>
        </div>

        <div className="space-y-1">
          <label className="block text-xs font-mono text-[var(--text-tertiary)] uppercase tracking-wider">
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter video title"
            required
            className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none focus:border-[var(--border-active)] transition-colors"
          />
        </div>
      </div>

      {/* Template selector */}
      <div className="space-y-1">
        <label className="block text-xs font-mono text-[var(--text-tertiary)] uppercase tracking-wider">
          Template Narrativo
        </label>
        <div className="relative">
          <select
            value={_template}
            onChange={(e) => setTemplate(e.target.value)}
            className="w-full appearance-none bg-[var(--bg-tertiary)] border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-colors"
          >
            {TEMPLATES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <ChevronDownIcon size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" />
        </div>
      </div>

      {/* Topic (optional) */}
      <div className="space-y-1">
        <label className="block text-xs font-mono text-[var(--text-tertiary)] uppercase tracking-wider">
          Topic <span className="text-[var(--text-tertiary)] font-normal normal-case">(optional)</span>
        </label>
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. machine learning basics"
          className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none focus:border-[var(--border-active)] transition-colors"
        />
      </div>

      {/* Duration + Platform + Style row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="block text-xs font-mono text-[var(--text-tertiary)] uppercase tracking-wider">
            Duration
          </label>
          <div className="flex border border-[var(--border)]">
            {DURATIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDuration(d)}
                className={`flex-1 px-2 py-2 text-xs font-mono transition-colors ${
                  duration === d
                    ? "bg-[var(--accent)] text-black font-bold"
                    : "bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-primary)]"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <label className="block text-xs font-mono text-[var(--text-tertiary)] uppercase tracking-wider">
            Platform
          </label>
          <div className="relative">
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="w-full appearance-none bg-[var(--bg-tertiary)] border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--border-active)] transition-colors"
            >
              {PLATFORMS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            <ChevronDownIcon size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" />
          </div>
        </div>

        <div className="space-y-1">
          <label className="block text-xs font-mono text-[var(--text-tertiary)] uppercase tracking-wider">
            Style
          </label>
          <div className="relative">
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              className="w-full appearance-none bg-[var(--bg-tertiary)] border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--border-active)] transition-colors"
            >
              {STYLES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <ChevronDownIcon size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={loading || !title.trim()}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[var(--accent)] text-black font-bold text-sm uppercase tracking-wider border border-[var(--accent)] hover:bg-transparent hover:text-[var(--accent)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? (
          <>
            <SpinnerIcon size={16} />
            Generating...
          </>
        ) : (
          <>
            <SparklesIcon size={16} />
            Generate Video →
          </>
        )}
      </button>
    </form>
  );
}
