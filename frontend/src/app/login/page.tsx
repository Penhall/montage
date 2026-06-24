"use client";
export const dynamic = "force-dynamic";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { SpinnerIcon } from "@/components/IconComponents";
import { isTauri, tauriLogin } from "@/lib/tauri";
import { useAuth } from "@/lib/auth-context";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const { login: setAuthUser } = useAuth();
  const tauriMode = isTauri();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (tauriMode) {
      try {
        const user = await tauriLogin(email, password);
        setAuthUser(user);
        const redirect = searchParams.get("redirect") || "/dashboard";
        router.push(redirect);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Login failed");
      }
      setLoading(false);
      return;
    }

    const { error: supabaseError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (supabaseError) {
      setError(supabaseError.message);
      setLoading(false);
      return;
    }

    const redirect = searchParams.get("redirect") || "/dashboard";
    router.push(redirect);
    router.refresh();
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    const { error: googleError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (googleError) {
      setError(googleError.message);
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
        <>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[var(--border)]" />
            </div>
            <div className="relative flex justify-center">
              <span className="px-3 text-xs text-[var(--text-tertiary)] bg-[var(--bg-secondary)]">
                or
              </span>
            </div>
          </div>

          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold uppercase tracking-wider border border-[var(--border)] text-[var(--text-primary)] hover:border-[var(--text-tertiary)] disabled:opacity-50 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>
        </>
      )}

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
