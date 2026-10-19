import { useCurrentFrame } from "remotion";
import { wordsAt, type HeadlineLine } from "./headlineLines.ts";
import { GLIDE, SMOOTH, arrive } from "./motion.ts";

// The line being read is large. Once the next one starts, it steps back: smaller, and in the muted text colour.
const ACTIVE = 72;
const BEHIND = 36;

export default function TitleLines({ lines }: { lines: HeadlineLine[] }) {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
      {lines.map((line, index) => {
        if (frame < line.at) return null;
        const next = lines[index + 1];
        const back = next ? GLIDE(arrive(frame, next.at, 14, (t) => t)) : 0;
        return (
          <h1
            key={line.at}
            aria-label={line.text}
            style={{
              margin: 0,
              display: "flex",
              gap: "0.26em",
              color: back === 0 ? "var(--text)" : `color-mix(in srgb, var(--text-muted) ${back * 100}%, var(--text))`,
              fontSize: ACTIVE + (BEHIND - ACTIVE) * back,
              fontWeight: 500,
              letterSpacing: "-0.02em",
              lineHeight: 1.15,
              whiteSpace: "nowrap",
            }}
          >
            {wordsAt(frame, line).map(({ word, progress }, at) => {
              const eased = SMOOTH(progress);
              return (
                <span key={at} aria-hidden="true" style={{ display: "inline-block", opacity: eased, translate: `0 ${(1 - eased) * 0.4}em`, filter: eased < 1 ? `blur(${(1 - eased) * 6}px)` : "none" }}>
                  {word}
                </span>
              );
            })}
          </h1>
        );
      })}
    </div>
  );
}
