import "./setup.ts";
import { Audio } from "@remotion/media";
import { AbsoluteFill, Composition, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import BrandScene from "./scenes/BrandScene.tsx";
import EndScene from "./scenes/EndScene.tsx";
import HomeScene from "./scenes/HomeScene.tsx";
import InvoiceScene from "./scenes/InvoiceScene.tsx";
import LogoScene from "./scenes/LogoScene.tsx";
import TitleScene from "./scenes/TitleScene.tsx";
import { TITLES } from "./scenes/titles.ts";
import UndoScene from "./scenes/UndoScene.tsx";
import { AUDIO_OFFSET_SECONDS, FPS, SCENES, SCENE_IDS, TOTAL_FRAMES, beat, sceneFrames, type SceneId } from "./timing.ts";
import Backdrop from "./ui/Backdrop.tsx";
import Section from "./ui/Section.tsx";

const title = (id: keyof typeof TITLES): React.FC => {
  const Title = () => <TitleScene lines={[...TITLES[id]]} />;
  Title.displayName = id;
  return Title;
};

const SCENE_COMPONENTS: Record<SceneId, React.ComponentType> = {
  homeTitle: title("homeTitle"),
  home: HomeScene,
  brandTitle: title("brandTitle"),
  brand: BrandScene,
  logoTitle: title("logoTitle"),
  logo: LogoScene,
  invoiceTitle: title("invoiceTitle"),
  invoice: InvoiceScene,
  undoTitle: title("undoTitle"),
  undo: UndoScene,
  end: EndScene,
};

export const Launch: React.FC = () => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: "var(--bg)", fontFamily: "var(--font-sans)" }}>
      <Backdrop />
      <Audio
        src={staticFile("track.mp3")}
        trimBefore={Math.round(AUDIO_OFFSET_SECONDS * fps)}
        volume={interpolate(frame, [TOTAL_FRAMES - fps * 1.5, TOTAL_FRAMES], [1, 0], { extrapolateLeft: "clamp" })}
      />
      {SCENE_IDS.map((id) => {
        const Scene = SCENE_COMPONENTS[id];
        return (
          <Sequence key={id} name={id} premountFor={0} from={beat(SCENES[id].from)} durationInFrames={sceneFrames(id)}>
            <Section frames={sceneFrames(id)}>
              <Scene />
            </Section>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

// One part on its own, for the Studio.
const onItsOwn = (id: SceneId): React.FC => {
  const Scene = SCENE_COMPONENTS[id];
  const Part = () => (
    <AbsoluteFill style={{ background: "var(--bg)", fontFamily: "var(--font-sans)" }}>
      <Backdrop />
      <Scene />
    </AbsoluteFill>
  );
  Part.displayName = `Part-${id}`;
  return Part;
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="DropletLaunch" component={Launch} durationInFrames={TOTAL_FRAMES} fps={30} width={1920} height={1080} />
      {SCENE_IDS.map((id) => (
        <Composition key={id} id={`Scene-${id}`} component={onItsOwn(id)} durationInFrames={sceneFrames(id)} fps={FPS} width={1920} height={1080} />
      ))}
    </>
  );
};
