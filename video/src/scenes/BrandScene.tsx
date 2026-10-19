import { interpolate, useCurrentFrame } from "remotion";
import BoardWorkspace from "../../../src/components/board/BoardWorkspace.tsx";
import PaletteWorkspace from "../../../src/components/PaletteWorkspace.tsx";
import type { ThreadMessage } from "../../../src/components/ChatThread.tsx";
import { BOARD_THREAD, boardAt } from "./boardData.ts";
import type { BrandProgress } from "../../../src/lib/brandGuide.ts";
import { hexToRgb, rgbToHex } from "../../../src/lib/colour.ts";
import type { PaletteBlock } from "../../../src/lib/palette.ts";
import { openWorkspace, reduce } from "../../../src/lib/workspaceState.ts";
import { beat, beatsIn } from "../timing.ts";
import { BRAND_STEPS, FINAL_BLOCKS, PROJECT_ID, PROJECT_NAME } from "../seed.ts";
import DockChat from "../ui/DockChat.tsx";
import HomeFrame from "../ui/HomeFrame.tsx";
import { GLIDE } from "../ui/motion.ts";
import Pointer from "../ui/Pointer.tsx";
import ScrollTo from "../ui/ScrollTo.tsx";
import Stage from "../ui/Stage.tsx";
import ZoomInOnce from "../ui/ZoomInOnce.tsx";

const noop = () => {};

// The brand part runs in two halves: the brainstorm board, then the palette worked out from it.
const BOARD_BEATS = 8;


// ---- The palette ----

const PALETTE_THREAD: ThreadMessage[] = [
  { id: 1, from: "you", text: "Make colours from the board. Calm blues, as you said." },
  {
    id: 2,
    from: "droplet",
    text: "Here is a palette to start from. Each colour has a role, and the contrast check shows where text will not read. Nothing is saved until you press Save.",
  },
];

// Which palette is showing, by beat of the palette half: the app's starter palette first, then a few trials, then the one the
// business keeps. The one before the last has a primary colour that light text cannot be read on, and the contrast circle for
// it fails until the colour is fixed. Each change blends over a few frames, so the colours move instead of jumping.
const CHANGES = [1.6, 3.2, 4.8, 7.5];
const BLEND_BEATS = 0.6;
const SAVED_AT = 17.4;

const mixHex = (from: string, to: string, t: number) => {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  return rgbToHex({ r: Math.round(a.r + (b.r - a.r) * t), g: Math.round(a.g + (b.g - a.g) * t), b: Math.round(a.b + (b.b - a.b) * t) }).toUpperCase();
};

const paletteAt = (p: number): PaletteBlock[] => {
  let step = 0;
  while (step < CHANGES.length && p >= CHANGES[step]) step++;
  const t = step > 0 ? Math.min(1, (p - CHANGES[step - 1]) / BLEND_BEATS) : 1;
  const blocks =
    step > 0 && t < 1
      ? BRAND_STEPS[step].map((block, index) => ({ ...block, hex: mixHex(BRAND_STEPS[step - 1][index].hex, block.hex, GLIDE(t)) }))
      : BRAND_STEPS[step];
  if (step < BRAND_STEPS.length - 1 || t < 1) return blocks;
  // Until it is saved, the palette on screen differs a little from the saved one (a note on the first colour, which is not
  // drawn), so the toolbar offers Save and then shows it kept.
  return p < SAVED_AT ? FINAL_BLOCKS.map((block, index) => (index === 0 ? { ...block, note: "Deep and calm" } : block)) : FINAL_BLOCKS;
};

const progressAt = (p: number): BrandProgress => (p < 11.5 ? { step: "colours", reached: 3 } : p < 15.5 ? { step: "typography", reached: 3 } : { step: "plan", reached: 3 });

// Beats of the palette half, as frames of the whole part.
const at = (p: number) => beat(BOARD_BEATS + p);

export default function BrandScene() {
  const frame = useCurrentFrame();
  const b = beatsIn(frame);
  // From the board to the palette, the app dips briefly into the background, so the change of screen reads as one.
  const dip = Math.min(1, Math.abs(frame - beat(BOARD_BEATS)) / 7);

  if (b < BOARD_BEATS) {
    return (
      <div style={{ position: "absolute", inset: 0, opacity: dip }}>
      <Stage
        overlay={<ZoomInOnce />}
        camera={[
          { at: 0, scale: 1.05, fx: 0.42, fy: 0.5 },
          { at: beat(0.5), scale: 1.25, fx: 0.42, fy: 0.5, frames: beat(6.5) },
        ]}
      >
        <HomeFrame
          key="board"
          layout="workspace"
          board
          collapsed
          dock={<DockChat messages={BOARD_THREAD} />}
          workspace={(slots) => <BoardWorkspace projectId={PROJECT_ID} projectName={PROJECT_NAME} state={boardAt(b)} dispatch={noop} headerSlots={slots} topInset={110} />}
        />
      </Stage>
      </div>
    );
  }

  const p = b - BOARD_BEATS;
  const state = reduce(openWorkspace(BRAND_STEPS[0]), { type: "set_palette", blocks: paletteAt(p) });
  // The colour screen is taller than the window: it moves down to the contrast check as the colour is fixed, and is back at the
  // top for the next part.
  const scroll = p < 11.5 ? interpolate(frame, [at(4.4), at(5.6)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: GLIDE }) : 0;

  return (
    <div style={{ position: "absolute", inset: 0, opacity: dip }}>
      <Stage
        camera={[
          { at: at(0), scale: 1.1, fx: 0.55, fy: 0.5, frames: 1 },
          { at: at(4.2), scale: 1.25, fx: 0.62, fy: 0.68, frames: 40 },
          { at: at(8.4), scale: 1, frames: 30 },
          { at: at(17.8), scale: 1.3, fx: 0.62, fy: 0.3, frames: 30 },
        ]}
        overlay={
          <Pointer
            stops={[
              { at: at(11.2), selector: '.taskbar__item[data-id="typography"] .taskbar__button', click: true },
              { at: at(15.2), selector: '.taskbar__item[data-id="plan"] .taskbar__button', click: true },
              { at: at(17.2), selector: ".btool__cluster:last-child .btool__pill:last-child", click: true },
            ]}
          />
        }
      >
        <HomeFrame
          key="palette"
          layout="workspace"
          collapsed
          dock={<DockChat messages={PALETTE_THREAD} />}
          workspace={(slots) => (
            <PaletteWorkspace
              mode="guide"
              projectId={PROJECT_ID}
              projectName={PROJECT_NAME}
              state={state}
              dispatch={noop}
              progress={progressAt(p)}
              onProgress={noop}
              onFinished={noop}
              headerSlots={slots}
            />
          )}
        />
      </Stage>
      <ScrollTo selector=".wsframe__pane--thing" share={scroll} />
    </div>
  );
}
