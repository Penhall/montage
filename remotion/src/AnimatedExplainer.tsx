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

export const AnimatedExplainerSchema = z.object({
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

type Props = z.infer<typeof AnimatedExplainerSchema>;

// ── Scene renderer ────────────────────────────────────────────────────

const SceneRenderer: React.FC<{
  imagePath: string;
  audioPath: string;
  dialogue: string;
  durationFrames: number;
}> = ({ imagePath, audioPath, dialogue, durationFrames }) => {
  const frame = useCurrentFrame();

  // Ken Burns: slow zoom
  const scale = interpolate(frame, [0, durationFrames], [1, 1.08], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <div
        style={{
          width: "100%",
          height: "100%",
          overflow: "hidden",
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
            }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              background: "linear-gradient(135deg, #1a1a2e, #16213e)",
            }}
          />
        )}
      </div>
      {audioPath ? <Audio src={staticFile(audioPath)} /> : null}
      {/* Subtitle */}
      <div
        style={{
          position: "absolute",
          bottom: 120,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          padding: "0 40px",
        }}
      >
        <span
          style={{
            backgroundColor: "rgba(0,0,0,0.7)",
            color: "#fff",
            fontFamily: "Space Grotesk, sans-serif",
            fontSize: 36,
            fontWeight: 600,
            padding: "12px 24px",
            textAlign: "center",
            borderRadius: 0,
            lineHeight: 1.3,
          }}
        >
          {dialogue}
        </span>
      </div>
    </AbsoluteFill>
  );
};

// ── CTA overlay ───────────────────────────────────────────────────────

const CTAOverlay: React.FC<{ text: string; appearFrame: number }> = ({
  text,
  appearFrame,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(
    frame,
    [appearFrame, appearFrame + 15],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <div
      style={{
        position: "absolute",
        bottom: 60,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        opacity,
      }}
    >
      <span
        style={{
          backgroundColor: "rgba(0,0,0,0.85)",
          color: "#ff4500",
          fontFamily: "Space Grotesk, sans-serif",
          fontSize: 32,
          fontWeight: 700,
          padding: "14px 32px",
          border: "1px solid #ff4500",
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
    <div
      style={{
        position: "absolute",
        bottom: 20,
        right: 20,
        opacity,
      }}
    >
      <span
        style={{
          color: "#fff",
          fontFamily: "Space Grotesk, sans-serif",
          fontSize: 18,
          fontWeight: 400,
        }}
      >
        Made with Montage
      </span>
    </div>
  );
};

// ── Main composition ──────────────────────────────────────────────────

export const AnimatedExplainer: React.FC<Props> = ({
  title: _title,
  scenes,
  ctaText,
  ctaOverlayAtS,
  outputWidth,
  outputHeight,
  watermark,
}) => {
  const { fps } = useVideoConfig();

  // Calculate frame offsets for each scene
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
        width: outputWidth,
        height: outputHeight,
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
            <SceneRenderer
              imagePath={scene.imagePath}
              audioPath={scene.audioPath}
              dialogue={scene.dialogue}
              durationFrames={duration}
            />
          </Sequence>
        );
      })}

      {/* CTA — only show if there's room */}
      {ctaFrame < totalFrames ? (
        <Sequence from={ctaFrame} durationInFrames={Math.max(1, totalFrames - ctaFrame)}>
          <CTAOverlay text={ctaText} appearFrame={0} />
        </Sequence>
      ) : null}

      {/* Watermark */}
      <Watermark visible={watermark} totalFrames={totalFrames} />
    </AbsoluteFill>
  );
};
