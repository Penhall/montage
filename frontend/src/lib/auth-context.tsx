"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { isTauri, tauriGetUser, type MontageUser } from "@/lib/tauri";

interface AuthState {
  user: MontageUser | null;
  loading: boolean;
  isTauriMode: boolean;
  login: (user: MontageUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  isTauriMode: false,
  login: () => {},
  logout: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<MontageUser | null>(null);
  const [loading, setLoading] = useState(true);
  const tauriMode = isTauri();

  useEffect(() => {
    if (!tauriMode) {
      setLoading(false);
      return;
    }

    // Restore session from localStorage
    const saved = localStorage.getItem("montage_user");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as MontageUser;
        // Verify user still exists
        tauriGetUser(parsed.id).then((fresh) => {
          if (fresh) {
            setUser(fresh);
          } else {
            localStorage.removeItem("montage_user");
          }
          setLoading(false);
        });
      } catch {
        localStorage.removeItem("montage_user");
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  }, [tauriMode]);

  const login = (u: MontageUser) => {
    setUser(u);
    if (tauriMode) {
      localStorage.setItem("montage_user", JSON.stringify(u));
    }
  };

  const logout = () => {
    setUser(null);
    if (tauriMode) {
      localStorage.removeItem("montage_user");
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, isTauriMode: tauriMode, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}
