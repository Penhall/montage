# Montage

**AI Video Production SaaS — powered by OpenMontage.**

No terminal. No config. Just describe your video.

---

## What is Montage?

Montage turns text descriptions into finished social media videos. It wraps [OpenMontage](https://github.com/calesthio/OpenMontage)'s production pipelines behind a clean web interface.

- **Describe** your video in plain language
- **AI generates** a script with scenes, narration, and visuals
- **Download** a finished MP4 ready for TikTok, Instagram, or YouTube

Zero setup. Zero editing skills. Zero GPU required (for MVP).

## Architecture

```
User (Browser) → Next.js SPA (Vercel)
                   ↓
              Supabase (Auth + DB + Storage)
                   ↓
              FastAPI Backend (VPS)
                   ↓
         ┌────────┼────────┐
    Research   Script   Pipeline
    (Web)      (LLM)    (TTS + Remotion)
```

## Quick Start

### Prerequisites
- Python 3.12+, Node.js 18+, FFmpeg
- Supabase project
- DeepSeek API key
- Pexels API key (free)

### Backend
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # fill in API keys
uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
cp .env.example .env.local  # fill Supabase keys
npm run dev
```

### Remotion
```bash
cd remotion
npm install
npx remotion render AnimatedExplainer --props='{"title":"test",...}' --output=test.mp4
```

## Database

Run `backend/migrations/001_initial.sql` in Supabase SQL Editor.

## Pipelines

| Pipeline | Description | Best For |
|---|---|---|
| **Animated Explainer** | AI-generated explainer with research, narration, visuals | Educational content, tutorials |
| **Social Clip** | Fast-paced vertical clip with karaoke captions | TikTok, Reels, Shorts |

## Tech Stack

- **Frontend:** Next.js 14, TypeScript, Tailwind CSS, shadcn/ui
- **Backend:** Python FastAPI, Supabase, DeepSeek API
- **Video:** Remotion (React), Piper TTS, FFmpeg
- **Infra:** Vercel (FE), VPS (BE), Supabase Cloud

## License

AGPL-3.0 — inherits from OpenMontage.
