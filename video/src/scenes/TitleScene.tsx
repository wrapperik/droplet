import { AbsoluteFill } from "remotion";
import type { HeadlineLine } from "../ui/headlineLines.ts";
import TitleLines from "../ui/TitleLines.tsx";

// A line of words alone in the middle of the screen, over the blue glow, before the app shows it.
export default function TitleScene({ lines }: { lines: HeadlineLine[] }) {
  return (
    <AbsoluteFill className="vid-root" style={{ display: "grid", placeItems: "center" }}>
      <TitleLines lines={lines} />
    </AbsoluteFill>
  );
}
