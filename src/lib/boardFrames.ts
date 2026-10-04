import type { Point, Rect } from './boardGeometry.ts'
import { isFrame, isNode, rectOf, type BoardItem, type FrameItem, type NodeItem, type RectItem } from './boardTypes.ts'

// What a frame holds. It is not stored on the things: a note, a shape or a text label is in a frame if its middle is inside it, and if
// frames overlap, in the one on top (the last). So moving a frame takes what is inside it, dropping a note on a frame puts it in, and
// dragging it out takes it out, with nothing to keep in step.

export const centreOf = (item: RectItem): Point => ({ x: item.x + item.w / 2, y: item.y + item.h / 2 })

// Whether a point is in a rectangle, counting its left and top edges and not its right and bottom, so that a thing whose middle is exactly on
// the line between two frames side by side is in one of them and not both.
const within = (rect: Rect, point: Point) => point.x >= rect.x && point.x < rect.x + rect.w && point.y >= rect.y && point.y < rect.y + rect.h

// The frame a thing is in, if any.
export function frameOf(items: BoardItem[], item: NodeItem): FrameItem | null {
  const middle = centreOf(item)
  const frames = items.filter(isFrame).filter((frame) => within(rectOf(frame), middle))
  return frames.length > 0 ? frames[frames.length - 1] : null
}

// The things a frame holds.
export const membersOf = (items: BoardItem[], frame: FrameItem): NodeItem[] => items.filter(isNode).filter((item) => frameOf(items, item)?.id === frame.id)

// The ids to move when these are moved: what was asked, and everything inside any frame that was asked for. Arrows are not moved, since they
// follow what they are attached to.
export function expandWithMembers(items: BoardItem[], ids: string[]): string[] {
  const asked = items.filter((item) => ids.includes(item.id) && item.kind !== 'connector')
  const all = new Set(asked.map((item) => item.id))
  for (const item of asked) if (isFrame(item)) for (const member of membersOf(items, item)) all.add(member.id)
  return items.filter((item) => all.has(item.id)).map((item) => item.id)
}
