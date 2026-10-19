import { AbsoluteFill, useCurrentFrame } from "remotion";

// The video's one background, under the words and under the app alike: the dark page, with Droplet blue rising from the
// foot of the frame and fading out as it climbs, and a fine line of light along the bottom edge where it comes from. It
// swells very slowly, so the light is alive without moving with the beat.
export default function Backdrop() {
  const frame = useCurrentFrame();
  const breathe = 1 + 0.035 * Math.sin((frame / 30) * Math.PI * 0.4);
  return (
    <AbsoluteFill style={{ background: "var(--bg)", overflow: "clip" }}>
      <AbsoluteFill
        style={{
          transformOrigin: "50% 100%",
          scale: `1 ${breathe}`,
          background: [
            "radial-gradient(ellipse 46% 34% at 50% 100%, color-mix(in srgb, var(--accent) 80%, transparent) 0%, transparent 100%)",
            "radial-gradient(ellipse 80% 70% at 50% 100%, color-mix(in srgb, var(--focus) 70%, transparent) 0%, color-mix(in srgb, var(--focus) 22%, transparent) 45%, transparent 100%)",
          ].join(", "),
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "15%",
          right: "15%",
          bottom: 0,
          height: 2,
          background: "linear-gradient(to right, transparent, color-mix(in srgb, var(--accent) 90%, transparent), transparent)",
        }}
      />
    </AbsoluteFill>
  );
}
