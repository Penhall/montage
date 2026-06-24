"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LogoutIcon } from "./IconComponents";

export default function LogoutButton() {
  const router = useRouter();
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <button
      onClick={handleLogout}
      className="p-2 border border-[var(--border)] hover:border-[var(--accent-red)] hover:text-[var(--accent-red)] transition-colors"
      title="Sign out"
    >
      <LogoutIcon size={18} />
    </button>
  );
}
