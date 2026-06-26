"use client";
export const dynamic = "force-dynamic";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { SpinnerIcon } from "@/components/IconComponents";

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // No OAuth flow needed — just redirect to dashboard.
    // If there's an error param, show it; otherwise go straight to dashboard.
    const error = searchParams.get("error");
    if (error) {
      return; // Let the UI render the error message
    }
    router.push("/dashboard");
  }, [router, searchParams]);

  const error = searchParams.get("error");

  if (error) {
    return (
      <div className="w-full max-w-sm border border-[var(--accent-red)] bg-[var(--bg-secondary)] p-6 text-center space-y-3">
        <p className="text-sm text-[var(--accent-red)]">Authentication failed</p>
        <p className="text-xs text-[var(--text-secondary)] font-mono">{error}</p>
        <Link
          href="/login"
          className="inline-block px-4 py-2 text-xs font-bold uppercase tracking-wider border border-[var(--border)] text-[var(--text-primary)] hover:border-[var(--text-tertiary)] transition-colors"
        >
          Back to login
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <SpinnerIcon size={32} className="text-[var(--accent)]" />
      <p className="text-sm text-[var(--text-secondary)] font-mono">
        Redirecting...
      </p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <Suspense
        fallback={
          <div className="flex items-center justify-center">
            <SpinnerIcon size={24} className="text-[var(--accent)]" />
          </div>
        }
      >
        <CallbackContent />
      </Suspense>
    </div>
  );
}
