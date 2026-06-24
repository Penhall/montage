import { z } from "zod";
import React, { useMemo } from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  staticFile,
} from "remotion";

// ── Schema ───────────────────────────────────────────────────────────

export const SocialClipSchema = z.object({
  title: z.string(),
  scenes: z.array(
    z.object({
      scene_id: z.number(),
      imagePath: z.string(),
      audioPath: z.string(),
      dialogue: z.string(),
      duration_s: z.number(),
    }),
  ),
  ctaText: z.string(),
  ctaOverlayAtS: z.number(),
  watermark: z.boolean(),
});

type Props = z.infer<typeof SocialClipSchema>;

// ── TikTok-style word captions ────────────────────────────────────────

const WordCaptions: React.FC<{ text: string; durationFrames: number }> = ({
  text,
  durationFrames,
}) => {
  const frame = useCurrentFrame();
  const words = text.split(" ");

  // Each word gets equal time
  const wordsPerFrame = durationFrames / words.length;
  const currentWordIndex = Math.min(
    Math.floor(frame / wordsPerFrame),
    words.length - 1,
  );

  return (
    <div
      style={{
        position: "absolute",
        bottom: 100,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        flexWrap: "wrap",
        gap: "8px 12px",
        padding: "0 30px",
      }}
    >
      {words.map((word, i) => {
        const isCurrent = i === currentWordIndex;
        const isPast = i < currentWordIndex;

        return (
          <span
            key={i}
            style={{
              fontFamily: "Space Grotesk, sans-serif",
              fontSize: 42,
              fontWeight: 800,
              color: isCurrent ? "#ff4500" : "#fff",
              opacity: isPast ? 0.5 : 1,
              textShadow: "2px 2px 8px rgba(0,0,0,0.8)",
              transition: "color 0.1s",
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
};

// ── Scene renderer (fast) ─────────────────────────────────────────────

const FastScene: React.FC<{
  imagePath: string;
  audioPath: string;
  dialogue: string;
  durationFrames: number;
}> = ({ imagePath, audioPath, dialogue, durationFrames }) => {
  const frame = useCurrentFrame();

  // Aggressive Ken Burns
  const scale = interpolate(frame, [0, durationFrames], [1, 1.12], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <div
        style={{ width: "100%", height: "100%", overflow: "hidden" }}
      >
        <Img
          src={staticFile(imagePath)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `scale(${scale})`,
          }}
        />
      </div>
      {audioPath ? <Audio src={staticFile(audioPath)} /> : null}
      <WordCaptions text={dialogue} durationFrames={durationFrames} />
    </AbsoluteFill>
  );
};

// ── CTA ───────────────────────────────────────────────────────────────

const CTAOverlay: React.FC<{ text: string; appearFrame: number }> = ({
  text,
  appearFrame,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(
    frame,
    [appearFrame, appearFrame + 10],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const scale = interpolate(
    frame,
    [appearFrame, appearFrame + 10],
    [0.8, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <div
      style={{
        position: "absolute",
        bottom: 50,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        opacity,
        transform: `scale(${scale})`,
      }}
    >
      <span
        style={{
          fontFamily: "Space Grotesk, sans-serif",
          fontSize: 38,
          fontWeight: 800,
          color: "#fff",
          backgroundColor: "#ff4500",
          padding: "14px 36px",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {text}
      </span>
    </div>
  );
};

// ── Watermark ─────────────────────────────────────────────────────────

const Watermark: React.FC<{ visible: boolean; totalFrames: number }> = ({
  visible,
  totalFrames,
}) => {
  const frame = useCurrentFrame();
  if (!visible) return null;

  const appearFrame = Math.max(0, totalFrames - 150);
  const opacity = interpolate(
    frame,
    [appearFrame, appearFrame + 15],
    [0, 0.1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <div style={{ position: "absolute", bottom: 15, right: 15, opacity }}>
      <span
        style={{
          color: "#fff",
          fontFamily: "Space Grotesk, sans-serif",
          fontSize: 14,
        }}
      >
        Made with Montage
      </span>
    </div>
  );
};

// ── Main composition ──────────────────────────────────────────────────

export const SocialClip: React.FC<Props> = ({
  title: _title,
  scenes,
  ctaText,
  ctaOverlayAtS,
  watermark,
}) => {
  const { fps } = useVideoConfig();

  const { sceneFrames, totalFrames, ctaFrame } = useMemo(() => {
    let offset = 0;
    const frames: number[] = [];
    for (const scene of scenes) {
      const f = Math.round(scene.duration_s * fps);
      frames.push(f);
      offset += f;
    }
    return {
      sceneFrames: frames,
      totalFrames: offset,
      ctaFrame: Math.round(ctaOverlayAtS * fps),
    };
  }, [scenes, ctaOverlayAtS, fps]);

  let currentFrame = 0;

  return (
    <AbsoluteFill
      style={{
        width: 1080,
        height: 1920,
        backgroundColor: "#0a0a0a",
      }}
    >
      {scenes.map((scene, index) => {
        const startFrame = currentFrame;
        const duration = sceneFrames[index];
        currentFrame += duration;

        return (
          <Sequence
            key={scene.scene_id}
            from={startFrame}
            durationInFrames={duration}
          >
            <FastScene
              imagePath={scene.imagePath}
              audioPath={scene.audioPath}
              dialogue={scene.dialogue}
              durationFrames={duration}
            />
          </Sequence>
        );
      })}

      <Sequence from={ctaFrame} durationInFrames={totalFrames - ctaFrame}>
        <CTAOverlay text={ctaText} appearFrame={0} />
      </Sequence>

      <Watermark visible={watermark} totalFrames={totalFrames} />
    </AbsoluteFill>
  );
};
