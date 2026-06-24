import { Composition } from "remotion";
import { AnimatedExplainer, AnimatedExplainerSchema } from "./AnimatedExplainer";
import { SocialClip, SocialClipSchema } from "./SocialClip";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="AnimatedExplainer"
        component={AnimatedExplainer}
        durationInFrames={1800}
        fps={30}
        width={1080}
        height={1920}
        schema={AnimatedExplainerSchema}
        defaultProps={{
          title: "Default Title",
          scenes: [
            {
              scene_id: 1,
              imagePath: "",
              audioPath: "",
              dialogue: "",
              duration_s: 5,
            },
          ],
          ctaText: "Follow for more!",
          ctaOverlayAtS: 50,
          outputWidth: 1080,
          outputHeight: 1920,
          watermark: false,
        }}
      />
      <Composition
        id="SocialClip"
        component={SocialClip}
        durationInFrames={1800}
        fps={30}
        width={1080}
        height={1920}
        schema={SocialClipSchema}
        defaultProps={{
          title: "Default Social Clip",
          scenes: [
            {
              scene_id: 1,
              imagePath: "",
              audioPath: "",
              dialogue: "",
              duration_s: 3,
            },
          ],
          ctaText: "Follow for more!",
          ctaOverlayAtS: 25,
          watermark: false,
        }}
      />
    </>
  );
};
