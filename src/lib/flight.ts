// A message the founder just sent comes out of the top of the message bar and settles into its place in the conversation, as one shape that
// changes size, place and roundness on the way, a little like liquid. This is the working out of each frame, kept apart from the screen so it can
// be tested: where the shape is, how big, how round, how much of it is still behind the bar, and how much of the words show.

export type Rect = { left: number; top: number; width: number; height: number }

export const FLIGHT_MS = 680

const OVERSHOOT = 1.1

// Eases out and goes a little past the end before settling back, which is what makes it feel soft and not mechanical.
export function easeOutBack(t: number): number {
  const x = Math.min(1, Math.max(0, t)) - 1
  return 1 + (OVERSHOOT + 1) * x * x * x + OVERSHOOT * x * x
}

const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount

export type Frame = Rect & {
  // How round the corners are, in pixels.
  radius: number
  // How much of the bottom of the shape is still behind the bar, in pixels, and so not drawn.
  clipBottom: number
  // How much of the words show, from 0 to 1.
  textOpacity: number
}

// `bar` is where the bar is now (it may be moving), `target` where the message is now (it may be moving too: the thread scrolls to it), and
// `radius` the corner radius of the message in its place.
export function flightFrame(t: number, bar: Rect, target: Rect, radius: number): Frame {
  const clamped = Math.min(1, Math.max(0, t))
  const e = easeOutBack(clamped)
  // It starts as a thin sliver across the top of the bar, a little narrower than it, and grows into the message as it rises.
  const start: Rect = { left: bar.left + bar.width * 0.04, top: bar.top + 2, width: bar.width * 0.92, height: 18 }
  const left = lerp(start.left, target.left, e)
  const top = lerp(start.top, target.top, e)
  const width = Math.max(0, lerp(start.width, target.width, e))
  const height = Math.max(0, lerp(start.height, target.height, e))
  // The corners start as a pill and end as the message's own (a browser draws no corner rounder than half the height, so a larger one is only a pill).
  const corner = lerp(height / 2, radius, Math.min(1, clamped * 1.6))
  // Only what is above the bar's top edge is drawn, so the shape comes out of the bar; the part below is cut off until it has cleared it.
  const clipBottom = Math.max(0, top + height - bar.top)
  return { left, top, width, height, radius: corner, clipBottom: clamped >= 1 ? 0 : clipBottom, textOpacity: Math.min(1, Math.max(0, (clamped - 0.2) / 0.4)) }
}
