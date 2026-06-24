"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SpinnerIcon } from "@/components/IconComponents";

export default function AuthCallbackPage() {
  const router = useRouter();
  const supabase = createClient();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleAuthCallback = async () => {
      const { error } = await supabase.auth.exchangeCodeForSession(
        window.location.search,
      );

      if (error) {
        setError(error.message);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    };

    handleAuthCallback();
  }, [router, supabase]);

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-sm border border-[var(--accent-red)] bg-[var(--bg-secondary)] p-6 text-center space-y-3">
          <p className="text-sm text-[var(--accent-red)]">Authentication failed</p>
          <p className="text-xs text-[var(--text-secondary)] font-mono">{error}</p>
          <a
            href="/login"
            className="inline-block px-4 py-2 text-xs font-bold uppercase tracking-wider border border-[var(--border)] text-[var(--text-primary)] hover:border-[var(--text-tertiary)] transition-colors"
          >
            Back to login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <SpinnerIcon size={32} className="text-[var(--accent)]" />
        <p className="text-sm text-[var(--text-secondary)] font-mono">
          Completing authentication...
        </p>
      </div>
    </div>
  );
}
