# Montage Remotion Compositions — Implementation Prompt

## What to Build

Remotion video compositions for Montage — the rendering engine that turns scripts + images + audio into final MP4 videos.

### Stack
- Remotion 4.x (React-based video rendering)
- TypeScript
- Node.js 18+

### Project Location
The remotion project lives at `/root/montage/remotion/`. Initialize with:
```bash
npx create-video@latest remotion --package-manager npm
```

This creates a Remotion starter with proper config.

### Composition 1: AnimatedExplainer

A 60-90 second educational video compositing images with narration, captions, and background music.

**Props (passed from Python backend via JSON):**
```typescript
interface AnimatedExplainerProps {
  title: string;
  scenes: Array<{
    scene_id: number;
    imagePath: string;      // absolute path to scene image
    audioPath: string;      // absolute path to scene audio (WAV)
    dialogue: string;       // subtitle text
    duration_s: number;     // scene duration in seconds
  }>;
  ctaText: string;          // e.g. "Follow for more!"
  ctaOverlayAtS: number;   // when to show CTA (seconds from start)
  outputWidth: number;      // 1080 (9:16) or 1920 (16:9)
  outputHeight: number;     // 1920 (9:16) or 1080 (16:9)
  watermark: boolean;       // whether to add watermark overlay
}
```

**Scene rendering:**
- Each scene: full-screen image with Ken Burns effect (slow zoom: scale 1.0 → 1.08 over duration)
- Smooth crossfade transition between scenes (0.3s)
- Audio plays for the scene duration
- Subtitles burned in: white text with semi-transparent black background, centered bottom, word-by-word timing optional
- Background music: find a royalty-free instrumental from Pixabay, mix at 15% volume

**CTA Overlay:**
- Appears at `ctaOverlayAtS` seconds
- Semi-transparent black bar at bottom with white text
- Smooth fade-in animation (0.5s)
- Stays until end

**Watermark:**
- If `watermark: true`: "Made with Montage" text, bottom-right, 10% opacity, appears in last 5 seconds

**Post-render:**
- Video resolution matches `outputWidth x outputHeight`
- 30fps
- H.264 codec

### Composition 2: SocialClip

A 30-60 second social media clip optimized for TikTok/Reels/Shorts (vertical 9:16).

**Props:**
```typescript
interface SocialClipProps {
  title: string;
  scenes: Array<{
    scene_id: number;
    imagePath: string;
    audioPath: string;
    dialogue: string;
    duration_s: number;
  }>;
  ctaText: string;
  ctaOverlayAtS: number;
  watermark: boolean;
}
```

Same as AnimatedExplainer but:
- Faster pacing (shorter scene durations, 2-4s each)
- TikTok-style word-level captions (words appear one at a time, centered, bold, large)
- More aggressive Ken Burns (scale 1.0 → 1.12)
- Quick cuts (0.15s crossfade)
- Music at 20% volume

### Implementation Details

**Scene sequencing:**
```tsx
<Sequence from={startFrame} durationInFrames={sceneFrames}>
  <SceneRenderer scene={scene} />
</Sequence>
```

**Ken Burns effect:**
```tsx
const scale = interpolate(frame, [0, sceneFrames], [1, 1.08], { extrapolateRight: 'clamp' });
```

**Subtitles:**
Use Remotion's `<AbsoluteFill>` with positioned text. Word-by-word for SocialClip:
```tsx
{words.map((word, i) => (
  <span key={i} style={{ opacity: currentWordIndex >= i ? 1 : 0.3 }}>
    {word}{' '}
  </span>
))}
```

**Audio:**
```tsx
<Audio src={staticFile(scene.audioPath)} />
```

**Music:**
Download a free instrumental track, mix at low volume:
```tsx
<Audio src={staticFile("music/background.mp3")} volume={0.15} />
```

**CTA:**
```tsx
{frame >= ctaFrame && (
  <div style={{ ...ctaStyle, opacity: interpolate(frame, [ctaFrame, ctaFrame + 15], [0, 1]) }}>
    {ctaText}
  </div>
)}
```

### How the Backend Calls Remotion

```bash
npx remotion render AnimatedExplainer \
  --props='{"title":"...","scenes":[...]}' \
  --output=/root/montage/backend/tmp/<job_id>/output.mp4 \
  --width=1080 --height=1920
```

The Python backend writes the props JSON to a temp file and passes it via `--props`.

### Directory Structure
```
remotion/
├── src/
│   ├── Root.tsx              # Register both compositions
│   ├── AnimatedExplainer.tsx # Composition 1
│   ├── SocialClip.tsx        # Composition 2
│   ├── components/
│   │   ├── SceneRenderer.tsx # Single scene with Ken Burns + audio + subtitles
│   │   ├── CTAOverlay.tsx    # Call-to-action overlay
│   │   ├── Watermark.tsx     # "Made with Montage" watermark
│   │   └── SubtitleRenderer.tsx # Word-level subtitle rendering
│   └── index.ts             # registerRoot()
├── package.json
└── tsconfig.json
```

## What to Actually Build

1. Initialize Remotion project
2. Create Root.tsx registering both compositions
3. Create AnimatedExplainer.tsx
4. Create SocialClip.tsx
5. Create all 4 shared components (SceneRenderer, CTAOverlay, Watermark, SubtitleRenderer)
6. Add royalty-free background music (download a track from Pixabay)
7. Test render command works: `npx remotion render AnimatedExplainer --props='{"title":"test","scenes":[...]}'`
8. Verify output is valid MP4

### Important
- Use Remotion's `staticFile()` for all asset paths
- Compositions must be self-contained — no external API calls
- All styling inline (Remotion requirement for server-side rendering)
- FPS: 30
- Codec: h264
- Output: MP4 container
