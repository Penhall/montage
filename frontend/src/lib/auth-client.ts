"use client";

const TOKEN_COOKIE = "montage_token";
const TOKEN_LOCALSTORAGE = "montage_token_backup";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

// ── Types ───────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  tier: string;
  is_admin: boolean;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

// ── Token management ────────────────────────────────────────────────

export function getToken(): string | null {
  // Try cookie first
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${TOKEN_COOKIE}=([^;]*)`),
  );
  if (match) return decodeURIComponent(match[1]);

  // Fallback to localStorage
  if (typeof window !== "undefined") {
    return localStorage.getItem(TOKEN_LOCALSTORAGE);
  }
  return null;
}

export function setToken(token: string): void {
  // Set cookie with 24h expiry
  const maxAge = 86400; // 24 hours
  document.cookie = `${TOKEN_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;

  // Mirror to localStorage as fallback
  try {
    localStorage.setItem(TOKEN_LOCALSTORAGE, token);
  } catch {
    // localStorage may be unavailable in some contexts
  }
}

export function clearToken(): void {
  // Remove cookie
  document.cookie = `${TOKEN_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;

  // Remove from localStorage
  try {
    localStorage.removeItem(TOKEN_LOCALSTORAGE);
  } catch {
    // ignore
  }
}

// ── JWT helpers ─────────────────────────────────────────────────────

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const decoded = atob(
      payload.replace(/-/g, "+").replace(/_/g, "/"),
    );
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

export function isAdmin(): boolean {
  const token = getToken();
  if (!token) return false;
  const payload = decodeJwtPayload(token);
  return payload?.is_admin === true;
}

// ── API calls ───────────────────────────────────────────────────────

export async function login(
  email: string,
  password: string,
): Promise<User> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Login failed" }));
    throw new Error(err.detail || "Login failed");
  }

  const data: AuthResponse = await res.json();
  setToken(data.access_token);
  return data.user;
}

export async function signup(
  email: string,
  password: string,
  name?: string,
): Promise<User> {
  const body: Record<string, string> = { email, password };
  if (name) body.name = name;

  const res = await fetch(`${API_URL}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Signup failed" }));
    throw new Error(err.detail || "Signup failed");
  }

  const data: AuthResponse = await res.json();
  setToken(data.access_token);
  return data.user;
}

export async function logout(): Promise<void> {
  clearToken();
}

export async function getUser(): Promise<User | null> {
  const token = getToken();
  if (!token) return null;

  try {
    const res = await fetch(`${API_URL}/api/me`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      if (res.status === 401) {
        clearToken();
        return null;
      }
      return null;
    }

    return await res.json();
  } catch {
    return null;
  }
}
