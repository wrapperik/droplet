import type { ReactNode } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { GLIDE } from "./motion.ts";

const IN = 12;
const OUT = 8;

// One part of the video. It comes up out of the background and settles, and fades back into it at its end, so a
// line of words hands over to the app (and back) without a hard cut. The background itself never fades.
export default function Section({ frames, children }: { frames: number; children: ReactNode }) {
  const frame = useCurrentFrame();
  const shown = Math.min(
    interpolate(frame, [0, IN], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: GLIDE }),
    interpolate(frame, [frames - OUT, frames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: GLIDE }),
  );
  const settle = interpolate(frame, [0, IN * 2], [0.985, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: GLIDE });
  return <AbsoluteFill style={{ opacity: shown, scale: String(settle) }}>{children}</AbsoluteFill>;
}
