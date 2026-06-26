"use client";
export const dynamic = "force-dynamic";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { SpinnerIcon } from "@/components/IconComponents";
import { isTauri, tauriLogin } from "@/lib/tauri";
import { useAuth } from "@/lib/auth-context";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login: apiLogin, isTauriMode } = useAuth();
  const tauriMode = isTauri();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (tauriMode) {
        const user = await tauriLogin(email, password);
        // In Tauri mode, login via context stores the user
        isTauriMode && null; // keep reference for clarity
        const redirect = searchParams.get("redirect") || "/dashboard";
        router.push(redirect);
      } else {
        await apiLogin(email, password);
        const redirect = searchParams.get("redirect") || "/dashboard";
        router.push(redirect);
        router.refresh();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm border border-[var(--border)] bg-[var(--bg-secondary)] p-8 space-y-6">
      <Link href="/" className="block text-center text-xl font-bold tracking-widest">
        MON<span className="text-[var(--accent)]">†</span>AGE
      </Link>
      <h1 className="text-sm font-bold uppercase tracking-wider text-center">
        {tauriMode ? "Montage Desktop" : "Sign in"}
      </h1>

      {tauriMode && (
        <div className="px-3 py-2 border border-[var(--border)] text-xs text-[var(--text-secondary)] font-mono text-center">
          Local mode — no internet required
        </div>
      )}

      {error && (
        <div className="px-3 py-2 border border-[var(--accent-red)] bg-[var(--accent-red)]/10 text-xs text-[var(--accent-red)] font-mono">
          {error}
        </div>
      )}

      <form onSubmit={handleEmailLogin} className="space-y-4">
        <div className="space-y-1">
          <label className="block text-xs font-mono text-[var(--text-tertiary)] uppercase tracking-wider">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={tauriMode ? "admin@montage.local" : "you@example.com"}
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
            placeholder="••••••••"
            required
            className={`w-full bg-[var(--bg-tertiary)] border px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none transition-colors ${
              error ? "border-[var(--accent-red)]" : "border-[var(--border)]"
            } focus:border-[var(--border-active)]`}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[var(--accent)] text-black font-bold text-sm uppercase tracking-wider border border-[var(--accent)] hover:bg-transparent hover:text-[var(--accent)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? <SpinnerIcon size={16} /> : null}
          Sign in
        </button>
      </form>

      {!tauriMode && (
        <p className="text-center text-xs text-[var(--text-tertiary)]">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-[var(--text-primary)] hover:underline">
            Sign up
          </Link>
        </p>
      )}

      {tauriMode && (
        <div className="px-3 py-2 border border-[var(--border)] bg-[var(--bg-tertiary)] text-xs font-mono text-[var(--text-tertiary)] space-y-1">
          <p><strong>Admin:</strong> admin@montage.local / Admin!234</p>
          <p><strong>Tester:</strong> tester@montage.local / Test!234</p>
        </div>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <Suspense
        fallback={
          <div className="flex items-center justify-center">
            <SpinnerIcon size={24} className="text-[var(--accent)]" />
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
