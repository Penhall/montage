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
  spring,
} from "remotion";

// ── Schema (shared with AnimatedExplainer) ─────────────────────────────

export const NerdologiaExplainerSchema = z.object({
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
  outputWidth: z.number(),
  outputHeight: z.number(),
  watermark: z.boolean(),
});

type Props = z.infer<typeof NerdologiaExplainerSchema>;

// ── Nerdologia Scene ──────────────────────────────────────────────────

const NerdologiaScene: React.FC<{
  imagePath: string;
  audioPath: string;
  dialogue: string;
  durationFrames: number;
  index: number;
  totalScenes: number;
}> = ({ imagePath, audioPath, dialogue, durationFrames, index, totalScenes }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // ── Entrance animation ─────────────────────────────────
  const entranceProgress = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 80 },
    durationInFrames: 15,
  });

  // Ken Burns slow zoom (1.0 → 1.05 for darker aesthetic)
  const scale = interpolate(frame, [0, durationFrames], [1, 1.05], {
    extrapolateRight: "clamp",
  });

  // Image brightness fade in
  const imageOpacity = interpolate(frame, [0, 8], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Slide-up for the text bar from bottom
  const textBarY = interpolate(frame, [3, 12], [height, height - 180], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Text reveal (character-by-character feel via width clip)
  const textRevealPct = interpolate(frame, [5, 30], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0a0e" }}>
      {/* Image with dark gradient overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: imageOpacity,
        }}
      >
        {imagePath ? (
          <Img
            src={staticFile(imagePath)}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transform: `scale(${scale})`,
              filter: "brightness(0.55) saturate(0.8)",
            }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              background: "linear-gradient(160deg, #1a1a2e 0%, #0f3460 50%, #0a0a0e 100%)",
            }}
          />
        )}
      </div>

      {/* Subtle vignette */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.6) 100%)",
        }}
      />

      {/* Audio */}
      {audioPath ? <Audio src={staticFile(audioPath)} /> : null}

      {/* Scene counter (top right) */}
      <div
        style={{
          position: "absolute",
          top: 30,
          right: 40,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: "#ff4500",
          }}
        />
        <span
          style={{
            color: "rgba(255,255,255,0.5)",
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          {String(index + 1).padStart(2, "0")}/{String(totalScenes).padStart(2, "0")}
        </span>
      </div>

      {/* Dialogue text bar — dark panel at bottom */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 180,
          transform: `translateY(${textBarY - height}px)`,
          background: "linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.7) 70%, transparent 100%)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: "0 40px 40px 40px",
        }}
      >
        {/* Accent line */}
        <div
          style={{
            width: 40,
            height: 3,
            backgroundColor: "#ff4500",
            marginBottom: 16,
            opacity: entranceProgress,
          }}
        />

        {/* Dialogue text with reveal effect */}
        <div
          style={{
            overflow: "hidden",
            width: `${textRevealPct}%`,
          }}
        >
          <span
            style={{
              color: "#ffffff",
              fontFamily: "Space Grotesk, sans-serif",
              fontSize: 32,
              fontWeight: 600,
              lineHeight: 1.25,
              letterSpacing: "-0.02em",
              whiteSpace: "nowrap",
            }}
          >
            {dialogue}
          </span>
        </div>
      </div>

      {/* Strong word emphasis — appear mid-scene */}
      {index > 1 && index < totalScenes - 1 && (
        <div
          style={{
            position: "absolute",
            top: "40%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            opacity: interpolate(frame, [10, 20], [0, 0.9], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <span
            style={{
              color: "#ff4500",
              fontFamily: "Space Grotesk, sans-serif",
              fontSize: 48,
              fontWeight: 700,
              letterSpacing: "0.05em",
              textShadow: "0 2px 20px rgba(255,69,0,0.4)",
            }}
          >
            {dialogue.split(" ").slice(0, 2).join(" ")}
          </span>
        </div>
      )}
    </AbsoluteFill>
  );
};

// ── CTA overlay scene ────────────────────────────────────────────────

const CTAOverlay: React.FC<{
  ctaText: string;
  durationFrames: number;
}> = ({ ctaText, durationFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const ctaOpacity = spring({
    frame,
    fps,
    config: { damping: 20, stiffness: 120 },
    durationInFrames: 20,
  });
  const ctaScale = spring({
    frame,
    fps,
    config: { damping: 15, stiffness: 100 },
    durationInFrames: 20,
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "rgba(0,0,0,0.85)",
        justifyContent: "center",
        alignItems: "center",
        opacity: ctaOpacity,
      }}
    >
      <div
        style={{
          transform: `scale(${ctaScale})`,
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 60,
            height: 3,
            backgroundColor: "#ff4500",
            margin: "0 auto 20px auto",
          }}
        />
        <span
          style={{
            color: "#ffffff",
            fontFamily: "Space Grotesk, sans-serif",
            fontSize: 40,
            fontWeight: 700,
            letterSpacing: "0.05em",
          }}
        >
          {ctaText}
        </span>
      </div>
    </AbsoluteFill>
  );
};

// ── Main Composition ──────────────────────────────────────────────────

const NerdologiaExplainer: React.FC<Props> = ({
  scenes,
  ctaText,
  ctaOverlayAtS,
  outputWidth,
  outputHeight,
}) => {
  const { fps } = useVideoConfig();

  // Build absolute timings per scene
  let cursor = 0;
  const sceneTimings = scenes.map((scene) => {
    const startAt = cursor;
    const durationFrames = Math.round(scene.duration_s * fps);
    cursor += durationFrames;
    return { ...scene, startAt, durationFrames };
  });

  const totalFrames = sceneTimings.reduce(
    (acc, s) => acc + s.durationFrames,
    0,
  );
  const ctaFrame = Math.round(ctaOverlayAtS * fps);

  return (
    <AbsoluteFill
      style={{
        width: outputWidth,
        height: outputHeight,
        backgroundColor: "#0a0a0e",
      }}
    >
      {sceneTimings.map((scene, i) => (
        <Sequence
          key={scene.scene_id}
          from={scene.startAt}
          durationInFrames={scene.durationFrames}
        >
          <NerdologiaScene
            imagePath={scene.imagePath}
            audioPath={scene.audioPath}
            dialogue={scene.dialogue}
            durationFrames={scene.durationFrames}
            index={i}
            totalScenes={scenes.length}
          />
        </Sequence>
      ))}

      {/* CTA overlay near the end */}
      <Sequence from={ctaFrame} durationInFrames={totalFrames - ctaFrame}>
        <CTAOverlay ctaText={ctaText} durationFrames={totalFrames - ctaFrame} />
      </Sequence>
    </AbsoluteFill>
  );
};

export default NerdologiaExplainer;
