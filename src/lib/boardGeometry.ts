// The geometry of the board: a fixed, bounded area that scrolls and zooms, with things placed on it in board units (pixels at 100 percent).
// Everything here is pure, so how things snap, stay inside the edge and are picked can be tested without a screen.

export const BOARD_W = 4800
export const BOARD_H = 3200
// Things snap to this grid when they are placed, moved or resized.
export const GRID = 20

export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 2
export const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.8, 1, 1.25, 1.5, 2] as const

export type Point = { x: number; y: number }
export type Size = { w: number; h: number }
export type Rect = Point & Size

export const BOARD: Rect = { x: 0, y: 0, w: BOARD_W, h: BOARD_H }

// A sticky note's size: where it starts, and the least and most it can be.
export const NOTE_DEFAULT: Size = { w: 200, h: 180 }
export const NOTE_MIN: Size = { w: 120, h: 100 }
export const NOTE_MAX: Size = { w: 600, h: 600 }

export const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)
export const snap = (value: number, grid: number = GRID) => Math.round(value / grid) * grid

// The rectangle moved to the nearest place inside the bounds, if it is outside them. It is never resized.
export function keepInside(rect: Rect, bounds: Rect = BOARD): Rect {
  return {
    ...rect,
    x: clamp(rect.x, bounds.x, Math.max(bounds.x, bounds.x + bounds.w - rect.w)),
    y: clamp(rect.y, bounds.y, Math.max(bounds.y, bounds.y + bounds.h - rect.h)),
  }
}

export const snapRect = (rect: Rect): Rect => ({ ...rect, x: snap(rect.x), y: snap(rect.y) })

// The smallest rectangle holding all of them, or null if there are none.
export function boundsOf(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null
  const left = Math.min(...rects.map((rect) => rect.x))
  const top = Math.min(...rects.map((rect) => rect.y))
  const right = Math.max(...rects.map((rect) => rect.x + rect.w))
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.h))
  return { x: left, y: top, w: right - left, h: bottom - top }
}

export const intersects = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

export const contains = (rect: Rect, point: Point) => point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h

// The rectangle between two corners, whichever way they were dragged.
export function between(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }
}

// How far a group of things moves when dragged by (dx, dy): snapped so the first of them lands on the grid, and held back so that none
// of them leaves the board. The group moves as one, so they keep their places among themselves.
export function groupDelta(rects: Rect[], dx: number, dy: number, bounds: Rect = BOARD): Point {
  const box = boundsOf(rects)
  if (!box) return { x: 0, y: 0 }
  const first = rects[0]
  let x = snap(first.x + dx) - first.x
  let y = snap(first.y + dy) - first.y
  x = clamp(x, bounds.x - box.x, bounds.x + bounds.w - (box.x + box.w))
  y = clamp(y, bounds.y - box.y, bounds.y + bounds.h - (box.y + box.h))
  // Held back at an edge, the group can end off the grid, by the part of a cell its far side needed. That is better than leaving.
  return { x, y }
}

// A rectangle resized to (w, h): within the size limits, snapped, and no larger than leaves it inside the board.
export function resizeRect(rect: Rect, w: number, h: number, min: Size = NOTE_MIN, max: Size = NOTE_MAX, bounds: Rect = BOARD): Rect {
  const room = { w: bounds.x + bounds.w - rect.x, h: bounds.y + bounds.h - rect.y }
  return {
    ...rect,
    w: clamp(snap(w), min.w, Math.min(max.w, room.w)),
    h: clamp(snap(h), min.h, Math.min(max.h, room.h)),
  }
}

// A rectangle of the given size centred on a point, snapped, and kept inside the board.
export function centredOn(point: Point, size: Size = NOTE_DEFAULT, bounds: Rect = BOARD): Rect {
  return keepInside(snapRect({ x: point.x - size.w / 2, y: point.y - size.h / 2, ...size }), bounds)
}

// A place for a new rectangle near a point where it does not sit on top of the others: the point itself if that is clear, otherwise
// the nearest clear step along a spiral. If the board is too crowded around it, the point is used and the others are overlapped.
export function freeSpotNear(point: Point, size: Size, others: Rect[], bounds: Rect = BOARD): Rect {
  const step = GRID * 2
  const clear = (rect: Rect) => !others.some((other) => intersects(rect, other))
  const first = centredOn(point, size, bounds)
  if (clear(first)) return first
  for (let ring = 1; ring <= 12; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue
        const rect = centredOn({ x: point.x + dx * (size.w + step), y: point.y + dy * (size.h + step) }, size, bounds)
        if (clear(rect)) return rect
      }
    }
  }
  return first
}

// A place for a bigger thing (such as a whole template) near a point: the nearest place on the board, in steps of `step`, where it is clear of the
// others by at least `gap`. If there is none, the point is used (kept inside the board) and `clear` says it is not clear. The nearest is to the
// point from the middle of the thing.
export function freeAreaNear(size: Size, others: Rect[], near: Point, gap = GRID * 2, step = GRID * 4, bounds: Rect = BOARD): { rect: Rect; clear: boolean } {
  const padded = others.map((other) => ({ x: other.x - gap, y: other.y - gap, w: other.w + gap * 2, h: other.h + gap * 2 }))
  const fallback = keepInside(snapRect({ x: near.x - size.w / 2, y: near.y - size.h / 2, ...size }), bounds)
  let best: Rect | null = null
  let bestDistance = Infinity
  const lastX = bounds.x + bounds.w - size.w
  const lastY = bounds.y + bounds.h - size.h
  const xs: number[] = []
  const ys: number[] = []
  for (let x = bounds.x; x <= lastX; x += step) xs.push(x)
  for (let y = bounds.y; y <= lastY; y += step) ys.push(y)
  // The edges too, so a thing that only just fits is not missed by the step.
  if (xs[xs.length - 1] !== lastX && lastX >= bounds.x) xs.push(lastX)
  if (ys[ys.length - 1] !== lastY && lastY >= bounds.y) ys.push(lastY)
  for (const y of ys) {
    for (const x of xs) {
      const distance = Math.hypot(x + size.w / 2 - near.x, y + size.h / 2 - near.y)
      if (distance >= bestDistance) continue
      const rect = { x, y, ...size }
      if (padded.some((other) => intersects(rect, other))) continue
      best = rect
      bestDistance = distance
    }
  }
  return best ? { rect: best, clear: true } : { rect: fallback, clear: false }
}

// Zoom one step in or out of the fixed steps, from wherever it is now.
export function stepZoom(zoom: number, direction: 1 | -1): number {
  if (direction > 0) return ZOOM_STEPS.find((step) => step > zoom + 0.001) ?? MAX_ZOOM
  return [...ZOOM_STEPS].reverse().find((step) => step < zoom - 0.001) ?? MIN_ZOOM
}

export const clampZoom = (zoom: number) => clamp(zoom, MIN_ZOOM, MAX_ZOOM)

// The zoom at which the whole board fits a viewport (never past 100 percent, so a big screen does not blow it up).
export function fitZoom(viewport: Size, board: Size = { w: BOARD_W, h: BOARD_H }): number {
  return clampZoom(Math.min(viewport.w / board.w, viewport.h / board.h, 1))
}

// Where on the board a point on the screen is, given where the board's top-left corner is on the screen and the zoom.
export const screenToBoard = (client: Point, origin: Point, zoom: number): Point => ({ x: (client.x - origin.x) / zoom, y: (client.y - origin.y) / zoom })

// The scroll position that keeps a board point under the same spot of the viewport when the zoom changes.
export function scrollAfterZoom(scroll: Point, anchor: Point, from: number, to: number): Point {
  const board = { x: (scroll.x + anchor.x) / from, y: (scroll.y + anchor.y) / from }
  return { x: board.x * to - anchor.x, y: board.y * to - anchor.y }
}

export const percentLabel = (zoom: number) => `${Math.round(zoom * 100)}%`
