import { Easing, interpolate } from "remotion";

export const SMOOTH = Easing.bezier(0.16, 1, 0.3, 1);
export const SNAP = Easing.bezier(0.5, 0, 0.1, 1);
// For the camera: it starts and stops gently, so a move never jolts.
export const GLIDE = Easing.bezier(0.45, 0, 0.2, 1);

// 0 before `from`, 1 from `from + frames`, eased between. For anything that arrives or settles on a beat.
export const arrive = (frame: number, from: number, frames = 8, easing: (t: number) => number = SMOOTH) =>
  interpolate(frame, [from, from + frames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing });

// A camera that holds a framing and moves to the next on a beat. `at` is the frame it starts moving, and it
// takes `frames` to arrive. (fx, fy) is the point of the window, as shares of its size, that the camera looks at:
// it comes to the middle of the frame as the zoom grows.
export type CameraMove = { at: number; scale: number; fx?: number; fy?: number; frames?: number };
export type CameraFrame = { scale: number; fx: number; fy: number };

const fullOf = (move: CameraMove): CameraFrame => ({ scale: move.scale, fx: move.fx ?? 0.5, fy: move.fy ?? 0.5 });

export function cameraAt(frame: number, moves: CameraMove[]): CameraFrame {
  let from = fullOf(moves[0]);
  for (const move of moves) {
    if (frame < move.at) break;
    const to = fullOf(move);
    const t = arrive(frame, move.at, move.frames ?? 24, GLIDE);
    if (t >= 1) {
      from = to;
      continue;
    }
    return { scale: from.scale + (to.scale - from.scale) * t, fx: from.fx + (to.fx - from.fx) * t, fy: from.fy + (to.fy - from.fy) * t };
  }
  return from;
}

// How far to move the window so the point looked at comes to the middle of the clip box, without the zoomed window
// ever pulling away from the edges of the box (which would show the page behind it). Sizes are in pixels:
// the window's own, where it sits in the box, and the box's.
export type Geometry = { windowW: number; windowH: number; left: number; boxW: number; boxH: number };

const within = (value: number, low: number, high: number) => (low <= high ? Math.min(high, Math.max(low, value)) : value);

export function cameraShift({ scale, fx, fy }: CameraFrame, g: Geometry): { x: number; y: number } {
  const focusX = fx * g.windowW;
  const focusY = fy * g.windowH;
  const wantX = g.boxW / 2 - g.left - focusX;
  const wantY = g.boxH / 2 - focusY;
  // The window's edges must stay at or beyond the box's. The window is narrower than the box, so it cannot cover it
  // until the zoom reaches that width: before then the sideways move eases in with the zoom instead.
  const coverScale = g.boxW / g.windowW;
  const x =
    scale >= coverScale
      ? within(wantX, g.boxW - g.left - g.windowW * scale - focusX * (1 - scale), -g.left - focusX * (1 - scale))
      : wantX * Math.min(1, Math.max(0, (scale - 1) / (coverScale - 1)));
  const y = within(wantY, g.boxH - g.windowH * scale - focusY * (1 - scale), -focusY * (1 - scale));
  return { x, y };
}

// The text typed so far, one character at a time between two frames.
export function typedAt(frame: number, text: string, from: number, to: number): string {
  const share = interpolate(frame, [from, to], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return text.slice(0, Math.round(share * text.length));
}

export type PointerStop = { at: number; x: number; y: number; click?: boolean };

// How the pointer comes and goes. It is only on screen around its clicks: it fades in a little below and to the right
// of where it will press, glides onto it, presses, waits a moment and fades away. Clicks close together are one
// visit, and the pointer travels from one to the next.
export const POINTER = { approach: 22, linger: 16, fade: 8, chain: 50, travel: 20, entry: { x: 110, y: 80 } };

export type PointerFrame = { x: number; y: number; press: number; opacity: number };

const glideBetween = (frame: number, from: number, to: number) =>
  interpolate(frame, [from, to], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.3, 0, 0.2, 1) });

export function pointerFrame(frame: number, unsorted: PointerStop[]): PointerFrame | null {
  const stops = [...unsorted].sort((a, b) => a.at - b.at);
  // The visits: runs of clicks no further apart than `chain`.
  const runs: PointerStop[][] = [];
  for (const stop of stops) {
    const run = runs[runs.length - 1];
    if (run && stop.at - run[run.length - 1].at <= POINTER.chain) run.push(stop);
    else runs.push([stop]);
  }
  for (const run of runs) {
    const first = run[0];
    const last = run[run.length - 1];
    const start = first.at - POINTER.approach;
    const end = last.at + POINTER.linger;
    if (frame < start - POINTER.fade || frame > end + POINTER.fade) continue;
    const opacity = Math.min(
      interpolate(frame, [start - POINTER.fade, start], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
      interpolate(frame, [end, end + POINTER.fade], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
    );
    let x = first.x + POINTER.entry.x;
    let y = first.y + POINTER.entry.y;
    if (frame >= start) {
      const t = glideBetween(frame, start, first.at);
      x += (first.x - x) * t;
      y += (first.y - y) * t;
    }
    for (let index = 1; index < run.length; index++) {
      const from = run[index - 1];
      const to = run[index];
      if (frame <= from.at) break;
      const t = glideBetween(frame, Math.max(from.at, to.at - POINTER.travel), to.at);
      x = from.x + (to.x - from.x) * t;
      y = from.y + (to.y - from.y) * t;
    }
    let press = -1;
    for (const stop of run) if (stop.click && frame >= stop.at && frame < stop.at + 10) press = (frame - stop.at) / 10;
    return { x, y, press, opacity };
  }
  return null;
}
