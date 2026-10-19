import { interpolate, useCurrentFrame } from "remotion";
import Wordmark from "../../../src/components/Wordmark.tsx";
import { beat } from "../timing.ts";
import TitleLines from "../ui/TitleLines.tsx";
import { SMOOTH, arrive } from "../ui/motion.ts";
import { useSettled } from "../ui/useSettled.ts";

const endLines = [
  { at: beat(1.5), text: "Decide once." },
  { at: beat(4), text: "Droplet does the rest." },
];

// The end card: the wordmark with the closing line under it, together in the middle of the frame, over the same blue
// glow as the rest of the video.
export default function EndScene() {
  const frame = useCurrentFrame();
  useSettled(200);
  const logo = SMOOTH(arrive(frame, 4, 18));

  return (
    <div className="vid-root" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 72, translate: "0 -30px" }}>
        <div
          style={{
            height: 150,
            display: "grid",
            placeItems: "center",
            opacity: logo,
            translate: `0 ${(1 - logo) * 24}px`,
            filter: logo < 1 ? `blur(${(1 - logo) * 10}px)` : "none",
          }}
        >
          <div style={{ scale: String(interpolate(logo, [0, 1], [2.7, 2.9])) }}>
            <Wordmark link={false} />
          </div>
        </div>
        <TitleLines lines={endLines} />
      </div>
    </div>
  );
}
