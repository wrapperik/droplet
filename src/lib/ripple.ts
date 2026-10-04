// The ripple shown while Droplet works: the workspace's windows go soft and come back into focus, one after another, starting from
// the centre and moving out. This is only the timing, kept apart from the page so it can be tested.

export type Point = { x: number; y: number }

// How long the wave takes to reach the farthest window, in milliseconds.
export const RIPPLE_SPREAD_MS = 700
// One ripple and the stillness after it, in milliseconds.
export const RIPPLE_LOOP_MS = 2600
// The blur at the height of a ripple, in pixels.
export const RIPPLE_BLUR_PX = 5

// Each window's delay: how far its centre is from the middle, as a share of how far the farthest one is, times the spread. The
// window at the middle starts at once and the one farthest out starts last, so the blur travels outward. Windows at the same
// distance start together.
export function rippleDelays(centres: Point[], middle: Point, spreadMs: number = RIPPLE_SPREAD_MS): number[] {
  const distances = centres.map((centre) => Math.hypot(centre.x - middle.x, centre.y - middle.y))
  const farthest = Math.max(...distances, 0)
  if (farthest === 0) return distances.map(() => 0)
  return distances.map((distance) => Math.round((distance / farthest) * spreadMs))
}

// One ripple on one window: into a soft focus and back, then still until the next. The blur is a filter, so nothing about where the
// window is changes.
export const rippleKeyframes = (): Keyframe[] => [
  { filter: 'blur(0px)', offset: 0, easing: 'ease-in-out' },
  { filter: `blur(${RIPPLE_BLUR_PX}px)`, offset: 0.17, easing: 'ease-in-out' },
  { filter: 'blur(0px)', offset: 0.38 },
  { filter: 'blur(0px)', offset: 1 },
]
