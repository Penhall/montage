"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SpinnerIcon } from "@/components/IconComponents";
import { useAuth } from "@/lib/auth-context";

export default function SignupPage() {
  const router = useRouter();
  const { signup } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      setLoading(false);
      return;
    }

    try {
      await signup(email, password, name || undefined);
      router.push("/dashboard");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Signup failed");
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm border border-[var(--border)] bg-[var(--bg-secondary)] p-8 space-y-6">
        <Link href="/" className="block text-center text-xl font-bold tracking-widest">
          MON<span className="text-[var(--accent)]">†</span>AGE
        </Link>
        <h1 className="text-sm font-bold uppercase tracking-wider text-center">
          Create account
        </h1>

        {error && (
          <div className="px-3 py-2 border border-[var(--accent-red)] bg-[var(--accent-red)]/10 text-xs text-[var(--accent-red)] font-mono">
            {error}
          </div>
        )}

        <form onSubmit={handleEmailSignup} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-xs font-mono text-[var(--text-tertiary)] uppercase tracking-wider">
              Name (optional)
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className={`w-full bg-[var(--bg-tertiary)] border px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none transition-colors ${
                error ? "border-[var(--accent-red)]" : "border-[var(--border)]"
              } focus:border-[var(--border-active)]`}
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-mono text-[var(--text-tertiary)] uppercase tracking-wider">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className={`w-full bg-[var(--bg-tertiary)] border px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none transition-colors ${
                error ? "border-[var(--accent-red)]" : "border-[var(--border)]"
              } focus:border-[var(--border-active)]`}
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-mono text-[var(--text-tertiary)] uppercase tracking-wider">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
              required
              minLength={8}
              className={`w-full bg-[var(--bg-tertiary)] border px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none transition-colors ${
                error ? "border-[var(--accent-red)]" : "border-[var(--border)]"
              } focus:border-[var(--border-active)]`}
            />
            <p className="text-[10px] font-mono text-[var(--text-tertiary)]">
              Minimum 8 characters
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[var(--accent)] text-black font-bold text-sm uppercase tracking-wider border border-[var(--accent)] hover:bg-transparent hover:text-[var(--accent)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? <SpinnerIcon size={16} /> : null}
            Create account
          </button>
        </form>

        <p className="text-center text-xs text-[var(--text-tertiary)]">
          Already have an account?{" "}
          <Link href="/login" className="text-[var(--text-primary)] hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
