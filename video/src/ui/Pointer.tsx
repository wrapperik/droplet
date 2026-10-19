import { useRef, useState } from "react";
import { useCurrentFrame } from "remotion";
import { pointerFrame, type PointerStop } from "./motion.ts";
import { useAfterSettling } from "./useAfterSettling.ts";

// A click of the pointer, on an element of the page found by a selector (its centre, moved by dx and dy), so the pointer
// finds the real button wherever the layout and the camera put it.
export type TargetStop = { at: number; selector: string; dx?: number; dy?: number; click?: boolean };

// The centre of the element the selector finds that is really on screen: laid out, with a size, and the thing the
// page shows at its own centre (not covered, not one of several copies kept out of view). If none passes that test,
// the first one with a size.
const centreOf = (stop: TargetStop): { x: number; y: number } | null => {
  let fallback: { x: number; y: number } | null = null;
  for (const element of Array.from(document.querySelectorAll(stop.selector))) {
    const box = element.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) continue;
    const spot = { x: box.left + box.width / 2 + (stop.dx ?? 0), y: box.top + box.height / 2 + (stop.dy ?? 0) };
    const shown = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    if (shown && (shown === element || element.contains(shown))) return spot;
    fallback ??= spot;
  }
  return fallback;
};

// `hideFrom` takes the pointer off the screen at once from that frame, where the screen it was on is replaced.
export default function Pointer({ stops, hideFrom }: { stops: TargetStop[]; hideFrom?: number }) {
  const frame = useCurrentFrame();
  const [placed, setPlaced] = useState<PointerStop[]>([]);
  // Where each click was last seen, up to its moment. After that the pointer stays where it pressed, even if the button
  // moves or goes, as a hand on a mouse would.
  const seen = useRef(new Map<number, { x: number; y: number }>());

  // Measured after every render, and again as the page settles, since the layout and the camera move. It only sets
  // state when a position has changed.
  useAfterSettling(() => {
    const next: PointerStop[] = [];
    stops.forEach((stop, index) => {
      const known = seen.current.get(index);
      const spot = frame <= stop.at || !known ? (centreOf(stop) ?? known) : known;
      if (!spot) return;
      if (frame <= stop.at) seen.current.set(index, spot);
      next.push({ at: stop.at, x: Math.round(spot.x), y: Math.round(spot.y), click: stop.click });
    });
    setPlaced((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
  });

  if (hideFrom !== undefined && frame >= hideFrom) return null;
  const at = pointerFrame(frame, placed);
  if (!at) return null;
  const { x, y, press, opacity } = at;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 20000, opacity }}>
      {press >= 0 && (
        <span
          style={{
            position: "absolute",
            left: x - 28,
            top: y - 28,
            width: 56,
            height: 56,
            borderRadius: "50%",
            border: "3px solid var(--focus)",
            opacity: 1 - press,
            scale: String(0.4 + press * 0.9),
          }}
        />
      )}
      <svg
        width="34"
        height="40"
        viewBox="0 0 34 40"
        style={{ position: "absolute", left: x - 4, top: y - 3, scale: press >= 0 && press < 0.5 ? "0.88" : "1" }}
        aria-hidden="true"
      >
        <path d="M4 3 L4 30 L11 24 L16 36 L21 34 L16 23 L26 23 Z" style={{ fill: "var(--text)", stroke: "var(--bg)" }} strokeWidth="2.5" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
