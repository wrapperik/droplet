import { BOARD, GRID, boundsOf, freeAreaNear, freeSpotNear, intersects, snap, type Point, type Rect, type Size } from './boardGeometry.ts'
import { isNode, isRectItem, rectOf, type BoardItem, type FrameItem, type RectItem } from './boardTypes.ts'

// Where the things the AI adds go. The model never chooses a position: it says what to add and where it belongs (in a frame, near a note, or
// just on the board), and this code finds the place, so the board stays tidy, nothing lands on top of the founder's work, and the same answer
// comes out on the server (which checks a reply) as in the browser (which applies it).

// The size of a note by Droplet. A little taller than the usual note, so a sentence fits.
export const AI_NOTE: Size = { w: 240, h: 200 }
// The room kept between things Droplet puts down.
const GAP = GRID * 2
// How far inside a frame the things in it are kept from its edge.
const FRAME_PAD = GRID * 2

const rectsOf = (items: BoardItem[], except: string[] = []) => items.filter(isRectItem).filter((item) => !except.includes(item.id)).map(rectOf)

// A place inside a frame for a thing of this size: the first clear place reading left to right and top to bottom, so the notes fill the frame
// in rows. Null when the frame has no room left. (Notes inside a frame, and anything else lying over it, are in the way.)
export function slotInFrame(items: BoardItem[], frame: FrameItem, size: Size = AI_NOTE): Rect | null {
  const inner = { x: frame.x + FRAME_PAD, y: frame.y + FRAME_PAD, w: frame.w - FRAME_PAD * 2, h: frame.h - FRAME_PAD * 2 }
  if (size.w > inner.w || size.h > inner.h) return null
  const taken = items.filter(isNode).map(rectOf).filter((rect) => intersects(rect, inner)).map((rect) => ({ x: rect.x - GRID, y: rect.y - GRID, w: rect.w + GRID * 2, h: rect.h + GRID * 2 }))
  for (let y = inner.y; y + size.h <= inner.y + inner.h; y += GRID) {
    for (let x = inner.x; x + size.w <= inner.x + inner.w; x += GRID) {
      const rect = { x, y, ...size }
      if (!taken.some((other) => intersects(rect, other))) return rect
    }
  }
  return null
}

// How many more of this size would fit in a frame, for saying so when it is full.
export function roomInFrame(items: BoardItem[], frame: FrameItem, size: Size = AI_NOTE): number {
  let count = 0
  let scratch = items
  for (let i = 0; i < 200; i++) {
    const rect = slotInFrame(scratch, frame, size)
    if (!rect) break
    count += 1
    scratch = [...scratch, { id: `room-${i}`, kind: 'note', ...rect, text: '', colour: 'yellow', author: 'ai' }]
  }
  return count
}

// A place beside a thing: the nearest clear place to it, clear of everything on the board. Null if the board has no clear place near it.
export function spotNear(items: BoardItem[], target: RectItem, size: Size = AI_NOTE): Rect | null {
  const middle = { x: target.x + target.w / 2, y: target.y + target.h / 2 }
  const others = rectsOf(items)
  const rect = freeSpotNear(middle, size, others)
  return others.some((other) => intersects(rect, other)) ? null : rect
}

// A place for a thing with no frame and no neighbour: the nearest clear place to a point (the middle of what the founder is looking at).
export function spotLoose(items: BoardItem[], near: Point, size: Size = AI_NOTE): Rect | null {
  const others = rectsOf(items)
  const rect = freeSpotNear(near, size, others)
  return others.some((other) => intersects(rect, other)) ? null : rect
}

// ---- Clusters ----

export type ClusterLayout = {
  // The frame that holds them, from (0, 0), and where each thing goes inside it, in the order given.
  frame: Size
  rects: Rect[]
}

// A grid for these things in a new frame: up to three to a row, each in a column wide enough for the widest of them, with room round them.
export function layoutCluster(sizes: Size[]): ClusterLayout {
  const columns = sizes.length <= 1 ? 1 : sizes.length <= 4 ? 2 : 3
  const rows = Math.ceil(sizes.length / columns)
  const widths = Array.from({ length: columns }, (_, column) => Math.max(0, ...sizes.filter((_, i) => i % columns === column).map((size) => size.w)))
  const heights = Array.from({ length: rows }, (_, row) => Math.max(0, ...sizes.filter((_, i) => Math.floor(i / columns) === row).map((size) => size.h)))
  const xs = widths.map((_, column) => FRAME_PAD + widths.slice(0, column).reduce((total, width) => total + width + GAP, 0))
  const ys = heights.map((_, row) => FRAME_PAD + heights.slice(0, row).reduce((total, height) => total + height + GAP, 0))
  const rects = sizes.map((size, i) => ({ x: xs[i % columns], y: ys[Math.floor(i / columns)], ...size }))
  const box = boundsOf(rects)!
  return { frame: { w: snap(box.x + box.w + FRAME_PAD), h: snap(box.y + box.h + FRAME_PAD) }, rects }
}

// Where a cluster's frame goes: the nearest clear place to a point, with room round it for the title above. The things being moved into it are
// not in the way, since they are leaving. If there is no clear place it is null.
export function placeCluster(items: BoardItem[], layout: ClusterLayout, near: Point, moving: string[]): Point | null {
  const { rect, clear } = freeAreaNear(layout.frame, rectsOf(items, moving), near, GAP * 2)
  return clear ? { x: rect.x, y: rect.y } : null
}

// The middle of some things, for putting what is made from them next to them.
export function middleOf(items: BoardItem[]): Point | null {
  const box = boundsOf(items.filter(isRectItem).map(rectOf))
  return box ? { x: box.x + box.w / 2, y: box.y + box.h / 2 } : null
}

export const boardMiddle: Point = { x: BOARD.w / 2, y: BOARD.h / 2 }
