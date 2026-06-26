"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { isTauri, tauriGetUser, type MontageUser } from "@/lib/tauri";
import {
  getUser as apiGetUser,
  login as apiLogin,
  signup as apiSignup,
  logout as apiLogout,
  isAdmin as checkIsAdmin,
  type User,
} from "@/lib/auth-client";

interface AuthState {
  user: User | null;
  loading: boolean;
  isTauriMode: boolean;
  login: (email: string, password: string) => Promise<User>;
  signup: (email: string, password: string, name?: string) => Promise<User>;
  logout: () => Promise<void>;
  isAdmin: () => boolean;
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  isTauriMode: false,
  login: async () => {
    throw new Error("AuthProvider not mounted");
  },
  signup: async () => {
    throw new Error("AuthProvider not mounted");
  },
  logout: async () => {},
  isAdmin: () => false,
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const tauriMode = isTauri();

  useEffect(() => {
    if (tauriMode) {
      // Tauri mode: restore session from localStorage
      const saved = localStorage.getItem("montage_user");
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as MontageUser;
          tauriGetUser(parsed.id).then((fresh) => {
            if (fresh) {
              setUser({
                id: fresh.id,
                email: fresh.email,
                tier: fresh.tier,
                is_admin: false,
              });
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
    } else {
      // Web mode: restore session from JWT cookie
      apiGetUser().then((u) => {
        setUser(u);
        setLoading(false);
      });
    }
  }, [tauriMode]);

  const login = async (email: string, password: string): Promise<User> => {
    const u = await apiLogin(email, password);
    setUser(u);
    return u;
  };

  const signup = async (
    email: string,
    password: string,
    name?: string,
  ): Promise<User> => {
    const u = await apiSignup(email, password, name);
    setUser(u);
    return u;
  };

  const logout = async (): Promise<void> => {
    await apiLogout();
    setUser(null);
    if (tauriMode) {
      localStorage.removeItem("montage_user");
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isTauriMode: tauriMode,
        login,
        signup,
        logout,
        isAdmin: checkIsAdmin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
