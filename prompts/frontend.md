# Montage Frontend — Implementation Prompt

## What to Build

A Next.js 14 frontend for Montage — AI video production SaaS. Landing page, auth, dashboard, video gallery.

### Stack
- Next.js 14 (App Router) + TypeScript
- Tailwind CSS (brutalist theme)
- shadcn/ui components (Button, Input, Card, Dialog, Toast)
- Supabase Auth (email/password + Google OAuth)
- Supabase JS client for data fetching

### Project Location
The frontend lives at `/root/montage/frontend/`. Initialize with:
```bash
npx create-next-app@latest frontend --typescript --tailwind --app --src-dir --no-eslint
```

### Design System (Brutalist)

```css
:root {
  --bg-primary: #0a0a0a;
  --bg-secondary: #141414;
  --bg-tertiary: #1a1a1a;
  --border: #2a2a2a;
  --border-active: #ffffff;
  --text-primary: #f5f5f5;
  --text-secondary: #888888;
  --text-tertiary: #555555;
  --accent: #ff4500;
  --accent-green: #00ff88;
  --accent-red: #ff3333;
  --accent-blue: #3388ff;
}
```

Typography: Space Grotesk (headings + body), Instrument Serif (italic accents), JetBrains Mono (data/metrics).

Rules:
- Zero border-radius everywhere
- 1px solid borders on all interactive elements
- No shadows, no gradients, no glassmorphism
- High density — maximize information per screen
- Whitespace as structure, not decoration

### Routes

```
/               Landing page (public)
/login          Login (public)
/signup         Signup (public)
/auth/callback  OAuth callback (public)
/dashboard      Dashboard + gallery (auth required)
/videos/[id]    Video detail (auth required)
/settings       Settings + tier (auth required)
```

### Supabase Setup
```typescript
// lib/supabase/client.ts — browser client
// lib/supabase/server.ts — server component client (cookies)
// lib/supabase/middleware.ts — middleware client
```

### Landing Page `/`

Single-page scroll with sections:
1. **Hero:** "AI Video Production" — h1. "No terminal. No config. Just describe your video." — p. CTA "Start free" → /signup. Placeholder video player (dark rectangle with play icon).
2. **How it works:** 3 steps cards — "1. Describe your video" → "2. AI generates script & visuals" → "3. Download & post". Icons: [Pencil], [Sparkles], [Download].
3. **Example videos:** 3 cards with placeholder thumbnails (colored rectangles) labeled "Animated Explainer", "Social Clip", "Product Teaser".
4. **Pricing:** 2-column grid — Free (3 videos/mo, watermark, 7-day storage, $0) vs Pro (unlimited, no watermark, 4K, priority, 30-day storage, $19/mo).
5. **Footer:** "Built on OpenMontage" + GitHub link + "AGPL-3.0"

### Login `/login`

- Card centered on dark bg
- Email input + Password input
- "Sign in" button (accent color)
- Divider "or"
- "Continue with Google" button
- Link "Don't have an account? Sign up" → /signup
- Error state: red border on inputs + "Invalid credentials" message

### Signup `/signup`
- Same card style
- Email + Password + "Create account" button
- "Continue with Google" button
- Link "Already have an account? Sign in"
- Password requirements tooltip (min 8 chars)
- On success: redirect to /dashboard

### Dashboard `/dashboard`

Layout:
- Top bar: "MON†AGE" logo (left) + user avatar + logout (right)
- Tier indicator bar: "Free tier · 2/3 videos this month" + [UPGRADE TO PRO →] button
- Create form (inline, not modal):
  ```
  Pipeline: [Animated Explainer ▾] [Social Clip ▾]
  Title: [input]
  Topic: [input — optional]
  Duration: [30s] [60s ▾] [90s]
  Platform: [TikTok 9:16 ▾] [YouTube 16:9 ▾] [Instagram 1:1 ▾]
  Style: [Clean Professional ▾] [Flat Motion ▾] [Minimalist ▾]
  [Generate Video →]
  ```
- Gallery: "Your Videos (N)" heading + grid of video cards
- Video card states:
  - **processing:** Dark card with spinner + progress bar + status label (researching/scripting/gathering/rendering)
  - **done:** Thumbnail image + title + duration + relative time + download icon
  - **failed:** Red-tinted card + error icon + "Failed" + retry icon
- Empty state: "No videos yet. Create your first one above." + example prompt

### Video Detail `/videos/[id]`

- Breadcrumb: Dashboard → Video Title
- Video player (HTML5 <video>)
- Metadata card: Title, Duration, Created, Style, Platform, Size
- Actions: [Download] [Delete] [Create Similar]
- Delete shows confirmation dialog

### Settings `/settings`

- Email (readonly)
- Tier: "Free" or "Pro" with usage (2/3 this month)
- [Upgrade to Pro] button → Stripe checkout (stub — just show coming soon toast)
- Danger zone: [Delete Account] with confirmation + password

### Loading & Error States

All pages:
- **Loading:** Skeleton cards (pulsing dark rectangles) while fetching
- **Auth expired:** Redirect to /login + toast "Session expired"
- **Network error:** Toast "Connection lost. Retrying..." with auto-retry
- **Rate limited:** Card overlay "You've used all 3 free videos this month. Upgrade to Pro."

### State Management

- Use React hooks (useState, useEffect) + Supabase realtime subscription for job status
- Poll `/api/jobs` every 5s when any job is in non-terminal state
- Use `useRouter` for navigation
- Use `sonner` (from shadcn/ui) for toasts

### API Integration

The backend runs at `NEXT_PUBLIC_API_URL` (env var, default `http://localhost:8000`).

```typescript
// lib/api.ts
export async function createJob(params: CreateJobParams): Promise<Job> { ... }
export async function getJobs(): Promise<Job[]> { ... }
export async function getJob(id: string): Promise<Job> { ... }
export async function getVideos(): Promise<Video[]> { ... }
export async function getVideoDownloadUrl(id: string): Promise<string> { ... }
export async function deleteVideo(id: string): Promise<void> { ... }
```

All calls include `Authorization: Bearer <supabase_session.access_token>`.

## What to Actually Build

1. Initialize Next.js with `create-next-app`
2. Install deps: `@supabase/ssr @supabase/supabase-js @radix-ui/react-dialog sonner`
3. Configure Tailwind with brutalist theme (globals.css)
4. Configure fonts (layout.tsx)
5. Create supabase client utilities (lib/supabase/)
6. Create auth middleware (middleware.ts)
7. Build ALL pages listed above
8. Build ALL components needed (VideoCard, CreateForm, JobProgress, TierBadge, etc.)
9. Create api.ts helper
10. Create .env.example (not real .env)

Make it production-quality. Every page handles loading, empty, error, and success states.
