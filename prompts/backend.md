# Montage Backend — Implementation Prompt

## What to Build

A Python FastAPI backend for Montage — an AI video production SaaS. This backend orchestrates video creation pipelines using OpenMontage tools, Piper TTS, and Remotion rendering.

### Stack
- Python 3.12 + FastAPI + Uvicorn
- Supabase (PostgreSQL + Auth + Storage) — project: qzljsendvthfetrntwab.supabase.co
- httpx for HTTP calls (DeepSeek API, Pexels API)
- Piper TTS (local, installed via pip)
- FFmpeg (system package, already installed)
- Subprocess calls to Node.js Remotion renderer

### Project Structure
```
backend/
├── main.py              # FastAPI app, CORS, startup
├── config.py            # Env vars via pydantic-settings
├── db.py                # Supabase client singleton
├── auth.py              # JWT validation middleware
├── models.py            # Pydantic models (Job, Video, UserTier)
├── routes/
│   ├── health.py        # GET /api/health
│   ├── auth_me.py       # GET /api/me
│   ├── jobs.py          # CRUD /api/jobs
│   ├── videos.py        # List/download /api/videos
│   └── checkout.py      # Stripe checkout (stub for now)
├── pipeline/
│   ├── engine.py        # PipelineEngine — orchestrates all stages
│   ├── research.py      # Web research via DuckDuckGo/Brave
│   ├── script.py        # DeepSeek API → video_script.json
│   ├── images.py        # Pexels/Pixabay/Unsplash image gathering
│   ├── tts.py           # Piper TTS generation per scene
│   ├── render.py        # Remotion subprocess render
│   └── upload.py        # Upload to Supabase Storage
├── middleware/
│   └── tier_limit.py    # Rate limiting by user tier
├── requirements.txt
└── Dockerfile
```

### Database Tables (to be created in Supabase SQL Editor later)

```sql
CREATE TABLE montage_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  params JSONB NOT NULL,
  script TEXT,
  progress INT DEFAULT 0,
  result_path TEXT,
  thumbnail_path TEXT,
  duration_s INT,
  error TEXT,
  cost_estimate REAL DEFAULT 0.02,
  cost_actual REAL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE montage_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES montage_jobs(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  thumbnail_path TEXT,
  duration_s INT,
  platform_profile TEXT DEFAULT 'tiktok_9_16',
  style_playbook TEXT DEFAULT 'clean_professional',
  size_bytes INT,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ
);

CREATE TABLE montage_user_tiers (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier TEXT NOT NULL DEFAULT 'free',
  videos_this_month INT DEFAULT 0,
  reset_at TIMESTAMPTZ DEFAULT now(),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS Policies
ALTER TABLE montage_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE montage_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE montage_user_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access own jobs" ON montage_jobs FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users can access own videos" ON montage_videos FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users can access own tier" ON montage_user_tiers FOR ALL USING (user_id = auth.uid());

-- Function to create user tier on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO montage_user_tiers (user_id, tier, reset_at)
  VALUES (NEW.id, 'free', now() + INTERVAL '30 days');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('montage-videos', 'montage-videos', false);

CREATE POLICY "Users can access own videos" ON storage.objects
  FOR ALL USING (auth.uid()::text = (storage.foldername(name))[1]);
```

### Implementation Details

#### Backend API

All routes return JSON. Auth via Supabase JWT in `Authorization: Bearer <token>` header. Middleware validates JWT using Supabase JWKS endpoint.

**GET /api/health** → `{"status": "ok", "version": "0.1.0"}`
**GET /api/me** → `{"id": "...", "email": "...", "tier": "free", "videos_this_month": 2, "videos_limit": 3}`
**POST /api/jobs** → body: `{title, topic, duration, platform, style}`, returns `{id, status: "pending"}`
**GET /api/jobs** → `[{id, status, progress, title, created_at}]`
**GET /api/jobs/{id}** → full job with script, progress, result
**DELETE /api/jobs/{id}** → cancel pending job
**GET /api/videos** → `[{id, title, thumbnail_url, duration_s, created_at, download_url}]`
**GET /api/videos/{id}** → full metadata
**GET /api/videos/{id}/download** → redirect to signed Supabase Storage URL
**DELETE /api/videos/{id}** → delete video + storage file

#### Pipeline Engine Flow

When a job is created, `PipelineEngine.run(job_id)` starts as a FastAPI BackgroundTask. Stages:

1. **RESEARCH** (progress 0→20): Search DuckDuckGo for topic, extract key points
2. **SCRIPT** (progress 20→40): Call DeepSeek API to generate video_script.json with scenes
3. **IMAGES** (progress 40→60): For each scene, search Pexels/Pixabay, download best match
4. **TTS** (progress 60→75): For each scene, generate Piper TTS audio .wav
5. **RENDER** (progress 75→95): Call Remotion via subprocess to render MP4
6. **UPLOAD** (progress 95→100): Upload MP4 + thumbnail to Supabase Storage, create video row

Each stage updates `montage_jobs.status` and `montage_jobs.progress`. Errors caught, status set to `failed`, error message stored.

#### DeepSeek Script Generation

```python
# System prompt for scriptwriter
SYSTEM = """You are a professional video scriptwriter. Generate a video script as valid JSON.
Video duration: 30-90 seconds. Platform: TikTok/Instagram Reels/YouTube Shorts (vertical 9:16).
RETURN ONLY JSON, no markdown, no explanation.

FORMAT:
{
  "script_id": "scr_YYYYMMDD_XXXXX",
  "title": "catchy title, max 60 chars",
  "seo_keywords": ["kw1", "kw2", "kw3"],
  "scenes": [
    {
      "scene_id": 1,
      "dialogue": "hook — grab attention in first 3 seconds",
      "visual_prompt": "description for image search in English",
      "duration_s": 4
    },
    ...
  ],
  "audio": {"background_music_tag": "upbeat_light"},
  "editing": {"cta_text": "Follow for more!", "cta_overlay_at_s": 55}
}
"""
```

#### Pexels Image Search

```python
# Use Pexels API (free, 200 req/hour)
# GET https://api.pexels.com/v1/search?query={visual_prompt}&per_page=1&orientation=portrait
# Header: Authorization: {PEXELS_API_KEY}
# Fallback: Pixabay, then Unsplash
```

#### Piper TTS

```python
# For each scene: generate WAV file
# subprocess.run(["piper", "--model", "en_US-lessac-medium", "--output_file", f"tmp/{job_id}/scene_{i}.wav"], input=text)
# Alternative: use Python piper-tts package
```

#### Remotion Render

```python
# subprocess.run([
#     "npx", "remotion", "render",
#     "AnimatedExplainer",
#     f"tmp/{job_id}/output.mp4",
#     "--props", json.dumps(render_props)
# ], cwd="/root/montage/remotion")
```

### Env Vars (.env — create .env.example, not real .env)
```
SUPABASE_URL=https://qzljsendvthfetrntwab.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key
DEEPSEEK_API_KEY=your-deepseek-key
PEXELS_API_KEY=your-pexels-key
PIXABAY_API_KEY=optional
UNSPLASH_ACCESS_KEY=optional
API_HOST=0.0.0.0
API_PORT=8000
```

### Auth Middleware

```python
# Validate Supabase JWT
# Decode JWT, verify with Supabase JWKS (https://qzljsendvthfetrntwab.supabase.co/auth/v1/jwks)
# Extract user_id from sub claim
# Inject into request state
```

## Implementation Notes

- Use `uvicorn` as ASGI server
- Use `pydantic-settings` for config (reads from .env)
- Use `httpx` for async HTTP calls
- No SQLAlchemy — use Supabase Python client (`supabase-py`)
- Background tasks via `fastapi.BackgroundTasks`
- All file paths relative to `/root/montage/backend`
- Temp files in `backend/tmp/<job_id>/`, cleaned up after upload
- Test the pipeline with: `python -c "from pipeline.engine import PipelineEngine; ..."`
- Print clear status messages during pipeline execution so the orchestrator can verify

## What to Actually Build

Create ALL files listed in the project structure above. Make them PRODUCTION-READY — proper error handling, logging, type hints, docstrings.

Start by creating `requirements.txt`, then `config.py`, then `main.py`, then build outward.
