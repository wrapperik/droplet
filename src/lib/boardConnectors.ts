import { contains, type Point, type Rect } from './boardGeometry.ts'
import { centreOf } from './boardFrames.ts'
import { isFrame, isNode, rectOf, type BoardItem, type ConnectorItem, type End, type RectItem, type ShapeKind } from './boardTypes.ts'

// The geometry of an arrow: where it starts and ends, and the line between. Pure, so how an arrow meets a note, an ellipse or a diamond, and how
// an elbow turns, can be tested without a screen.

// How far inside the edge of a frame counts as its border, for dropping the end of an arrow on it.
const BORDER_UNITS = 16

// The point where a line from the middle of a rectangle towards another point leaves the outline of the shape.
export function boundaryPoint(rect: Rect, shape: ShapeKind | 'box', towards: Point): Point {
  const cx = rect.x + rect.w / 2
  const cy = rect.y + rect.h / 2
  const dx = towards.x - cx
  const dy = towards.y - cy
  if (dx === 0 && dy === 0) return { x: cx, y: cy }
  const hw = rect.w / 2
  const hh = rect.h / 2
  let t: number
  if (shape === 'ellipse') t = 1 / Math.sqrt((dx / hw) ** 2 + (dy / hh) ** 2)
  else if (shape === 'diamond') t = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh)
  else t = Math.min(dx === 0 ? Infinity : hw / Math.abs(dx), dy === 0 ? Infinity : hh / Math.abs(dy))
  return { x: cx + dx * t, y: cy + dy * t }
}

const shapeOf = (item: RectItem): ShapeKind | 'box' => (item.kind === 'shape' ? item.shape : 'box')

// Where an end is: the thing it is on and its middle, or its own point. Null when the thing it is on is gone.
export function resolveEnd(end: End, items: BoardItem[]): { point: Point; item: RectItem | null } | null {
  if (!('item' in end)) return { point: { x: end.x, y: end.y }, item: null }
  const item = items.find((other) => other.id === end.item)
  if (!item || item.kind === 'connector') return null
  return { point: centreOf(item), item }
}

export type Path = { points: Point[]; label: Point }

const length = (points: Point[]) => points.slice(1).reduce((total, point, index) => total + Math.hypot(point.x - points[index].x, point.y - points[index].y), 0)

// The point a fraction of the way along a line made of several segments.
export function pointAlong(points: Point[], fraction: number): Point {
  const total = length(points)
  if (total === 0) return points[0]
  let left = total * fraction
  for (let i = 1; i < points.length; i++) {
    const segment = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
    if (left <= segment || i === points.length - 1) {
      const t = segment === 0 ? 0 : left / segment
      return { x: points[i - 1].x + (points[i].x - points[i - 1].x) * t, y: points[i - 1].y + (points[i].y - points[i - 1].y) * t }
    }
    left -= segment
  }
  return points[points.length - 1]
}

// A line with the points taken out that are not turns: the same point twice, or a point in the middle of a level or upright run.
function simplify(points: Point[]): Point[] {
  const distinct = points.filter((point, index) => index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y)
  return distinct.filter((point, index) => {
    if (index === 0 || index === distinct.length - 1) return true
    const before = distinct[index - 1]
    const after = distinct[index + 1]
    return !((before.x === point.x && point.x === after.x) || (before.y === point.y && point.y === after.y))
  })
}

// The line of an arrow. Straight: from the outline of one thing towards the other. Elbow: out of the side that faces the other and into the
// side that faces back, with one step across in the middle. If the two overlap there is no room for an elbow, so it is straight. Null if
// an end is on a thing that is no longer there.
export function connectorPath(connector: ConnectorItem, items: BoardItem[]): Path | null {
  const a = resolveEnd(connector.from, items)
  const b = resolveEnd(connector.to, items)
  if (!a || !b) return null

  const straight = (): Path => {
    const start = a.item ? boundaryPoint(rectOf(a.item), shapeOf(a.item), b.point) : a.point
    const end = b.item ? boundaryPoint(rectOf(b.item), shapeOf(b.item), a.point) : b.point
    return { points: [start, end], label: pointAlong([start, end], 0.5) }
  }
  if (connector.style === 'straight') return straight()

  const ra: Rect = a.item ? rectOf(a.item) : { x: a.point.x, y: a.point.y, w: 0, h: 0 }
  const rb: Rect = b.item ? rectOf(b.item) : { x: b.point.x, y: b.point.y, w: 0, h: 0 }
  const dx = b.point.x - a.point.x
  const dy = b.point.y - a.point.y
  const halfW = ra.w / 2 + rb.w / 2
  const halfH = ra.h / 2 + rb.h / 2
  const horizontal = (halfW > 0 ? Math.abs(dx) / halfW : Math.abs(dx)) >= (halfH > 0 ? Math.abs(dy) / halfH : Math.abs(dy))

  let points: Point[]
  if (horizontal) {
    const sx = dx >= 0 ? ra.x + ra.w : ra.x
    const ex = dx >= 0 ? rb.x : rb.x + rb.w
    if (dx >= 0 ? ex < sx : ex > sx) return straight()
    const mx = (sx + ex) / 2
    points = [{ x: sx, y: a.point.y }, { x: mx, y: a.point.y }, { x: mx, y: b.point.y }, { x: ex, y: b.point.y }]
  } else {
    const sy = dy >= 0 ? ra.y + ra.h : ra.y
    const ey = dy >= 0 ? rb.y : rb.y + rb.h
    if (dy >= 0 ? ey < sy : ey > sy) return straight()
    const my = (sy + ey) / 2
    points = [{ x: a.point.x, y: sy }, { x: a.point.x, y: my }, { x: b.point.x, y: my }, { x: b.point.x, y: ey }]
  }
  points = simplify(points)
  return { points, label: pointAlong(points, 0.5) }
}

// What the end of an arrow dropped at a point would be put on: the thing on top there, or a frame if the point is on its border. A frame is
// not a target anywhere else, since an arrow let go inside one is as likely to be for a note beneath, or for nothing.
export function connectTargetAt(items: BoardItem[], point: Point, excludeId?: string): RectItem | null {
  const nodes = items.filter(isNode).filter((item) => item.id !== excludeId)
  for (let i = nodes.length - 1; i >= 0; i--) if (contains(rectOf(nodes[i]), point)) return nodes[i]
  const frames = items.filter(isFrame).filter((item) => item.id !== excludeId)
  for (let i = frames.length - 1; i >= 0; i--) {
    const rect = rectOf(frames[i])
    const inner = { x: rect.x + BORDER_UNITS, y: rect.y + BORDER_UNITS, w: rect.w - BORDER_UNITS * 2, h: rect.h - BORDER_UNITS * 2 }
    if (contains(rect, point) && !contains(inner, point)) return frames[i]
  }
  return null
}

// The points an arrow's ends are at, for box selection: the middle of a thing it is on, or its own point.
export function endPoints(connector: ConnectorItem, items: BoardItem[]): Point[] {
  return [connector.from, connector.to].flatMap((end) => {
    const resolved = resolveEnd(end, items)
    return resolved ? [resolved.point] : []
  })
}
