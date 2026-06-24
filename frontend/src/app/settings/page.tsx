"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import LogoutButton from "@/components/LogoutButton";
import ConfirmDialog from "@/components/ConfirmDialog";
import { SpinnerIcon, UserIcon } from "@/components/IconComponents";

export default function SettingsPage() {
  const router = useRouter();
  const supabase = createClient();

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  const [tier] = useState<"free" | "pro">("free");
  const [used] = useState(0);
  const [limit] = useState(3);

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setUser(user);
      setLoading(false);
    };
    getUser();
  }, [supabase, router]);

  const handleUpgrade = () => {
    toast.info("Stripe checkout coming soon!");
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword) return;
    setDeleting(true);

    // Re-authenticate before deleting
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: deletePassword,
    });

    if (signInError) {
      toast.error("Password incorrect");
      setDeleting(false);
      return;
    }

    // Stub: actual deletion requires admin API
    toast.info("Account deletion requires admin action. Contact support.");
    setDeleting(false);
    setDeleteOpen(false);
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <SpinnerIcon size={32} className="text-[var(--accent)]" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-[var(--border)]">
        <Link href="/" className="text-lg font-bold tracking-widest">
          MON<span className="text-[var(--accent)]">†</span>AGE
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="text-xs font-mono text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
          >
            ← Dashboard
          </Link>
          <div className="p-2 border border-[var(--border)]">
            <UserIcon size={18} className="text-[var(--text-secondary)]" />
          </div>
          <LogoutButton />
        </div>
      </header>

      <div className="flex-1 max-w-xl w-full mx-auto px-4 py-8 space-y-8">
        <h1 className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">
          Settings
        </h1>

        {/* Profile */}
        <section className="space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] font-mono">
            Profile
          </h2>
          <div className="border border-[var(--border)] bg-[var(--bg-secondary)] divide-y divide-[var(--border)]">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-xs font-mono text-[var(--text-tertiary)] uppercase tracking-wider">
                Email
              </span>
              <span className="text-sm text-[var(--text-primary)] font-mono">
                {user?.email || "—"}
              </span>
            </div>
          </div>
        </section>

        {/* Tier */}
        <section className="space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] font-mono">
            Plan
          </h2>
          <div className="border border-[var(--border)] bg-[var(--bg-secondary)] divide-y divide-[var(--border)]">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-xs font-mono text-[var(--text-tertiary)] uppercase tracking-wider">
                Current tier
              </span>
              <span
                className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 border ${
                  tier === "pro"
                    ? "border-[var(--accent-green)] text-[var(--accent-green)]"
                    : "border-[var(--text-tertiary)] text-[var(--text-tertiary)]"
                }`}
              >
                {tier}
              </span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-xs font-mono text-[var(--text-tertiary)] uppercase tracking-wider">
                Usage
              </span>
              <span className="text-sm font-mono text-[var(--text-secondary)]">
                {used}/{limit} this month
              </span>
            </div>
          </div>

          {tier === "free" && (
            <button
              onClick={handleUpgrade}
              className="w-full flex items-center justify-center px-4 py-3 text-xs font-bold uppercase tracking-wider bg-[var(--accent)] text-black border border-[var(--accent)] hover:bg-transparent hover:text-[var(--accent)] transition-colors"
            >
              Upgrade to Pro
            </button>
          )}
        </section>

        {/* Danger zone */}
        <section className="space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--accent-red)] font-mono">
            Danger zone
          </h2>
          <div className="border border-[var(--accent-red)] bg-[var(--bg-secondary)] p-4 space-y-3">
            <p className="text-sm text-[var(--text-secondary)]">
              Permanently delete your account and all data. This cannot be undone.
            </p>
            <button
              onClick={() => setDeleteOpen(true)}
              className="px-4 py-2 text-xs font-bold uppercase tracking-wider border border-[var(--accent-red)] text-[var(--accent-red)] hover:bg-[var(--accent-red)] hover:text-black transition-colors"
            >
              Delete Account
            </button>
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete Account"
        message="Enter your password to confirm account deletion. This action cannot be undone."
        confirmLabel={deleting ? "Deleting..." : "Delete Account"}
        variant="danger"
        onConfirm={handleDeleteAccount}
        onCancel={() => {
          setDeleteOpen(false);
          setDeletePassword("");
        }}
      >
        <input
          type="password"
          value={deletePassword}
          onChange={(e) => setDeletePassword(e.target.value)}
          placeholder="Enter password"
          className="w-full mt-3 bg-[var(--bg-tertiary)] border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none focus:border-[var(--border-active)] transition-colors"
        />
      </ConfirmDialog>
    </div>
  );
}
