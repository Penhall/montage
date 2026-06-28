"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PlayIcon, PencilIcon, SparklesIcon, DownloadIcon, SpinnerIcon } from "@/components/IconComponents";
import { getUser } from "@/lib/auth-client";

const EXAMPLES = [
  { title: "Animated Explainer", color: "#1a3a2a" },
  { title: "Social Clip", color: "#3a1a2a" },
  { title: "Product Teaser", color: "#2a1a3a" },
];

export default function LandingPage() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    getUser()
      .then((user) => {
        if (user) {
          router.push("/dashboard");
        } else {
          setAuthLoading(false);
        }
      })
      .catch(() => {
        setAuthLoading(false);
      });
  }, [router]);

  if (authLoading) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-screen">
        <SpinnerIcon size={32} className="text-[var(--accent)]" />
      </div>
    );
  }
  return (
    <div className="flex flex-col min-h-screen">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
        <Link href="/" className="text-lg font-bold tracking-widest">
          MON<span className="text-[var(--accent)]">†</span>AGE
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href="/login"
            className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="px-4 py-2 text-sm font-bold uppercase tracking-wider bg-[var(--accent)] text-black border border-[var(--accent)] hover:bg-transparent hover:text-[var(--accent)] transition-colors"
          >
            Start free
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex flex-col items-center justify-center px-6 py-24 md:py-32 border-b border-[var(--border)]">
        <h1 className="text-4xl md:text-6xl font-bold text-center max-w-2xl leading-tight">
          AI Video Production
        </h1>
        <p className="mt-4 text-lg text-[var(--text-secondary)] text-center max-w-lg">
          No terminal. No config. Just describe your video.
        </p>
        <Link
          href="/signup"
          className="mt-8 px-8 py-4 text-sm font-bold uppercase tracking-wider bg-[var(--accent)] text-black border border-[var(--accent)] hover:bg-transparent hover:text-[var(--accent)] transition-colors"
        >
          Start free
        </Link>
        <div className="mt-12 w-full max-w-lg aspect-video bg-[var(--bg-tertiary)] border border-[var(--border)] flex items-center justify-center">
          <PlayIcon size={64} className="text-[var(--text-tertiary)]" />
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 py-20 border-b border-[var(--border)]">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-sm font-bold uppercase tracking-widest text-[var(--text-secondary)] text-center mb-12">
            How it works
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: PencilIcon, step: "1", title: "Describe your video", desc: "Write a title, pick a style and platform. That&apos;s it." },
              { icon: SparklesIcon, step: "2", title: "AI generates script & visuals", desc: "Our pipeline researches, scripts, and assembles your video." },
              { icon: DownloadIcon, step: "3", title: "Download & post", desc: "Export a finished MP4 ready for any social platform." },
            ].map(({ icon: Icon, step, title, desc }) => (
              <div
                key={step}
                className="border border-[var(--border)] bg-[var(--bg-secondary)] p-6 space-y-4"
              >
                <span className="text-xs font-mono text-[var(--text-tertiary)]">
                  {String(step).padStart(2, "0")}
                </span>
                <Icon size={24} className="text-[var(--accent)]" />
                <h3 className="font-bold">{title}</h3>
                <p className="text-sm text-[var(--text-secondary)]">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Examples */}
      <section className="px-6 py-20 border-b border-[var(--border)]">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-sm font-bold uppercase tracking-widest text-[var(--text-secondary)] text-center mb-12">
            Example videos
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {EXAMPLES.map(({ title, color }) => (
              <div
                key={title}
                className="border border-[var(--border)] group cursor-pointer"
              >
                <div
                  className="aspect-video flex items-center justify-center"
                  style={{ backgroundColor: color }}
                >
                  <PlayIcon
                    size={32}
                    className="text-white/60 group-hover:text-white transition-colors"
                  />
                </div>
                <div className="p-3 bg-[var(--bg-secondary)]">
                  <span className="text-sm font-medium">{title}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="px-6 py-20 border-b border-[var(--border)]">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-sm font-bold uppercase tracking-widest text-[var(--text-secondary)] text-center mb-12">
            Pricing
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            {/* Free */}
            <div className="border border-[var(--border)] bg-[var(--bg-secondary)] p-6 space-y-4">
              <h3 className="text-lg font-bold">Free</h3>
              <p className="text-3xl font-bold">
                $0<span className="text-sm text-[var(--text-tertiary)] font-normal">/mo</span>
              </p>
              <ul className="space-y-2 text-sm text-[var(--text-secondary)]">
                <li>3 videos per month</li>
                <li>Watermark on exports</li>
                <li>7-day storage</li>
                <li>Standard quality</li>
              </ul>
              <Link
                href="/signup"
                className="block w-full text-center px-4 py-3 text-xs font-bold uppercase tracking-wider border border-[var(--border)] text-[var(--text-primary)] hover:border-[var(--text-tertiary)] transition-colors"
              >
                Get started
              </Link>
            </div>

            {/* Pro */}
            <div className="border border-[var(--accent)] bg-[var(--bg-secondary)] p-6 space-y-4 relative">
              <div className="absolute -top-3 right-4 px-3 py-1 bg-[var(--accent)] text-black text-xs font-bold uppercase tracking-wider">
                Popular
              </div>
              <h3 className="text-lg font-bold">Pro</h3>
              <p className="text-3xl font-bold">
                $19<span className="text-sm text-[var(--text-tertiary)] font-normal">/mo</span>
              </p>
              <ul className="space-y-2 text-sm text-[var(--text-secondary)]">
                <li>Unlimited videos</li>
                <li>No watermark</li>
                <li>4K exports</li>
                <li>Priority processing</li>
                <li>30-day storage</li>
              </ul>
              <Link
                href="/signup"
                className="block w-full text-center px-4 py-3 text-xs font-bold uppercase tracking-wider bg-[var(--accent)] text-black border border-[var(--accent)] hover:bg-transparent hover:text-[var(--accent)] transition-colors"
              >
                Upgrade to Pro
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-8 border-t border-[var(--border)]">
        <div className="max-w-4xl mx-auto flex items-center justify-between text-xs text-[var(--text-tertiary)]">
          <span>
            Built on{" "}
            <a
              href="https://github.com/calesthio/OpenMontage"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline"
            >
              OpenMontage
            </a>
          </span>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/calesthio/OpenMontage"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--text-primary)] transition-colors"
            >
              GitHub
            </a>
            <span>AGPL-3.0</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
