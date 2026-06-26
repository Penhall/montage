# Frontend Auth Migration — Supabase → Local Backend

## Context
The Montage backend has been migrated from Supabase to a local PostgreSQL + FastAPI backend.
The frontend (Next.js 16, App Router, TypeScript) still uses `@supabase/ssr` and `@supabase/supabase-js`.
Replace ALL Supabase auth with a simple cookie-based JWT auth that talks to the local backend at `http://localhost:8000`.

## Backend API (already running)
- POST /api/auth/signup  {email, password, name?, is_admin?} → {access_token, token_type, user: {id, email, tier, is_admin}}
- POST /api/auth/login   {email, password} → same
- GET  /api/me           Authorization: Bearer <token> → {id, email, tier, videos_this_month, videos_limit, is_admin}
- GET  /api/jobs         Authorization: Bearer <token> → [...]
- POST /api/jobs         Authorization: Bearer <token> + body → {id, status}
- GET  /api/videos       Authorization: Bearer <token> → [...]
- GET  /api/videos/{id}/download
- DEL  /api/videos/{id}

## What to do

### 1. Create `src/lib/auth-client.ts` — Browser-side auth module
```typescript
// Key functions:
getToken(): string | null        // read JWT from cookie or localStorage
setToken(token: string): void    // store JWT in cookie (document.cookie) + localStorage backup
clearToken(): void               // remove JWT

async login(email: string, password: string): Promise<User>
async signup(email: string, password: string, name?: string): Promise<User>
async logout(): void
async getUser(): Promise<User | null>   // calls GET /api/me
isAdmin(): boolean                      // decode JWT payload, check is_admin claim

// User type: { id: string, email: string, tier: string, is_admin: boolean }
```

Use `document.cookie` to set an httpOnly-accessible cookie named `montage_token` with:
- Path=/
- Max-Age=86400 (24h)
- SameSite=Lax

Also mirror to localStorage as fallback.

For JWT decoding (to check is_admin without API call), use a simple base64 decode of the payload section.

### 2. Create `src/lib/api-client.ts` — Authenticated fetch helper
```typescript
// Export a function that wraps fetch() with Authorization header
async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  const token = getToken();
  const headers = { ...options?.headers, 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(`${API_URL}${path}`, { ...options, headers });
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
```

### 3. Create `src/lib/auth-context.tsx` — AuthProvider (React Context)
- Wraps the app, provides user state
- On mount: calls getUser() to restore session
- Exposes: { user, loading, login, signup, logout, isAdmin }

### 4. Rewrite `src/middleware.ts` — Simple cookie-based auth guard
```typescript
// Read 'montage_token' cookie
// If missing and path is protected → redirect to /login
// Protected paths: /dashboard, /videos, /settings
// Public paths: /login, /signup, /auth/callback, / (landing)
```

### 5. Update page files
Replace ALL Supabase imports with the new auth module:

**src/app/login/page.tsx:**
- Remove `import { createClient } from "@/lib/supabase/client"`
- Use `login(email, password)` from auth-client
- Remove Google OAuth button (not supported in local backend)
- Keep the same UI/styling

**src/app/signup/page.tsx:**
- Replace supabase signUp with `signup(email, password, name)` from auth-client
- Remove Google OAuth
- Keep the same UI

**src/app/auth/callback/page.tsx:**
- Can be deleted or simplified to a no-op (no OAuth callback needed)

**src/app/dashboard/page.tsx:**
- Replace `supabase.auth.getUser()` with `getUser()`
- Replace supabase client with api-client for data fetching
- Keep the Tauri mode detection (isTauriMode) — it's separate from auth

**src/app/videos/[id]/VideoDetailClient.tsx:**
- Replace supabase auth check with getUser()
- Replace data fetching with api-client

**src/app/videos/[id]/page.tsx:**
- Check for supabase references and replace

**src/app/settings/page.tsx:**
- Replace supabase auth with getUser()
- Replace supabase data fetching with api-client

**src/components/LogoutButton.tsx:**
- Replace `supabase.auth.signOut()` with `logout()`

**src/components/AuthProviderWrapper.tsx:**
- If it wraps supabase auth, replace with AuthContext provider
- Check the file first

### 6. Remove Supabase dependencies
**package.json:** Remove `@supabase/ssr` and `@supabase/supabase-js`
**Delete:** `src/lib/supabase/` directory (client.ts, server.ts, middleware.ts)

### 7. Create/update `.env.local`
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### 8. Fix `next.config.ts`
The current config has `output: "export"` and `trailingSlash: true` — these are for Tauri static export.
For web development (Vercel deploy), we need a standard Next.js config.
Change to:
```typescript
import type { NextConfig } from "next";
const nextConfig: NextConfig = {};
export default nextConfig;
```

## Important constraints
- Keep ALL existing UI/styling exactly as-is
- Keep Tauri-related code intact (isTauriMode checks, src-tauri directory)
- Next.js version is 16.2.9 — check node_modules/next/dist/docs/ for API changes
- The project uses TypeScript with strict mode
- Font: Space Grotesk + Instrument Serif + JetBrains Mono (keep these)
- Do NOT change any backend files
- Do NOT add new dependencies (no axios, no react-query — use plain fetch)
- Google OAuth is REMOVED — no OAuth flow at all

## Validation
After all changes:
```bash
cd frontend && npm run build 2>&1 | tail -20
```
Build must succeed with 0 errors.

## Test users (for manual testing)
- Admin: admin@montage.local / abc12345
- Tester: tester@montage.local / abc12345
- Backend URL: http://localhost:8000
