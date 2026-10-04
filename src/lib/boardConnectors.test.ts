import { describe, expect, it } from 'vitest'
import { boundaryPoint, connectTargetAt, connectorPath, endPoints, pointAlong, resolveEnd } from './boardConnectors.ts'
import { expandWithMembers, frameOf, membersOf } from './boardFrames.ts'
import { describeItem, type BoardItem, type ConnectorItem, type FrameItem, type NoteItem, type ShapeItem, type TextItem } from './boardTypes.ts'

const note = (id: string, x: number, y: number, w = 200, h = 180): NoteItem => ({ id, kind: 'note', x, y, w, h, text: id, colour: 'yellow', author: 'you' })
const shape = (id: string, x: number, y: number, kind: ShapeItem['shape'], w = 200, h = 100): ShapeItem => ({ id, kind: 'shape', shape: kind, x, y, w, h, text: '', colour: 'white' })
const frame = (id: string, x: number, y: number, w = 600, h = 400, title = 'Frame'): FrameItem => ({ id, kind: 'frame', x, y, w, h, title, colour: 'white' })
const text = (id: string, x: number, y: number): TextItem => ({ id, kind: 'text', x, y, w: 240, h: 60, text: id, size: 'body' })
const arrow = (id: string, from: ConnectorItem['from'], to: ConnectorItem['to'], style: ConnectorItem['style'] = 'straight'): ConnectorItem => ({ id, kind: 'connector', from, to, style, head: 'end', text: '' })

describe('boundaryPoint', () => {
  const rect = { x: 0, y: 0, w: 200, h: 100 }

  it('leaves a rectangle through the side that faces the target', () => {
    expect(boundaryPoint(rect, 'box', { x: 1000, y: 50 })).toEqual({ x: 200, y: 50 })
    expect(boundaryPoint(rect, 'box', { x: -1000, y: 50 })).toEqual({ x: 0, y: 50 })
    expect(boundaryPoint(rect, 'box', { x: 100, y: 1000 })).toEqual({ x: 100, y: 100 })
    expect(boundaryPoint(rect, 'box', { x: 100, y: -1000 })).toEqual({ x: 100, y: 0 })
  })

  it('leaves a rectangle through a corner when the target is on the diagonal', () => {
    expect(boundaryPoint({ x: 0, y: 0, w: 100, h: 100 }, 'box', { x: 500, y: 500 })).toEqual({ x: 100, y: 100 })
  })

  it('leaves an ellipse on its curve', () => {
    const right = boundaryPoint(rect, 'ellipse', { x: 1000, y: 50 })
    expect(right.x).toBeCloseTo(200)
    const diagonal = boundaryPoint(rect, 'ellipse', { x: 1000, y: 1000 })
    // on the ellipse: (dx/100)^2 + (dy/50)^2 = 1
    expect(((diagonal.x - 100) / 100) ** 2 + ((diagonal.y - 50) / 50) ** 2).toBeCloseTo(1)
  })

  it('leaves a diamond at its points and along its slanted sides', () => {
    expect(boundaryPoint(rect, 'diamond', { x: 1000, y: 50 })).toEqual({ x: 200, y: 50 })
    const diagonal = boundaryPoint(rect, 'diamond', { x: 1000, y: 1000 })
    // on the diamond: |dx|/100 + |dy|/50 = 1
    expect(Math.abs(diagonal.x - 100) / 100 + Math.abs(diagonal.y - 50) / 50).toBeCloseTo(1)
  })

  it('stays at the middle when the target is the middle', () => {
    expect(boundaryPoint(rect, 'box', { x: 100, y: 50 })).toEqual({ x: 100, y: 50 })
  })
})

describe('connectorPath, straight', () => {
  it('runs from the edge of one note to the edge of the other', () => {
    const items = [note('a', 0, 0), note('b', 600, 0)]
    const path = connectorPath(arrow('c', { item: 'a' }, { item: 'b' }), items)!
    expect(path.points).toEqual([{ x: 200, y: 90 }, { x: 600, y: 90 }])
  })

  it('has its label in the middle', () => {
    const items = [note('a', 0, 0), note('b', 600, 0)]
    expect(connectorPath(arrow('c', { item: 'a' }, { item: 'b' }), items)!.label).toEqual({ x: 400, y: 90 })
  })

  it('follows a thing when it moves', () => {
    const before = connectorPath(arrow('c', { item: 'a' }, { item: 'b' }), [note('a', 0, 0), note('b', 600, 0)])!
    const after = connectorPath(arrow('c', { item: 'a' }, { item: 'b' }), [note('a', 0, 0), note('b', 600, 400)])!
    expect(after.points[1]).not.toEqual(before.points[1])
    expect(after.points[1].y).toBeGreaterThan(before.points[1].y)
  })

  it('ends at a point of its own when that end is not on anything', () => {
    const path = connectorPath(arrow('c', { item: 'a' }, { x: 900, y: 90 }), [note('a', 0, 0)])!
    expect(path.points).toEqual([{ x: 200, y: 90 }, { x: 900, y: 90 }])
  })

  it('meets an ellipse on its curve, not at the corner of its box', () => {
    const items = [shape('a', 0, 0, 'ellipse', 200, 100), note('b', 600, 500)]
    const start = connectorPath(arrow('c', { item: 'a' }, { item: 'b' }), items)!.points[0]
    expect(((start.x - 100) / 100) ** 2 + ((start.y - 50) / 50) ** 2).toBeCloseTo(1)
  })

  it('has no line when an end is on something that is gone', () => {
    expect(connectorPath(arrow('c', { item: 'a' }, { item: 'gone' }), [note('a', 0, 0)])).toBeNull()
  })

  it('does not attach to another arrow', () => {
    const items: BoardItem[] = [note('a', 0, 0), arrow('x', { x: 0, y: 0 }, { x: 5, y: 5 })]
    expect(connectorPath(arrow('c', { item: 'a' }, { item: 'x' }), items)).toBeNull()
  })
})

describe('connectorPath, elbow', () => {
  it('goes out of the facing side, across in the middle, and into the facing side', () => {
    const items = [note('a', 0, 0), note('b', 600, 400)]
    const path = connectorPath(arrow('c', { item: 'a' }, { item: 'b' }, 'elbow'), items)!
    expect(path.points).toEqual([{ x: 200, y: 90 }, { x: 400, y: 90 }, { x: 400, y: 490 }, { x: 600, y: 490 }])
  })

  it('goes down and across when the other is more below than beside', () => {
    const items = [note('a', 0, 0), note('b', 100, 800)]
    const path = connectorPath(arrow('c', { item: 'a' }, { item: 'b' }, 'elbow'), items)!
    expect(path.points[0]).toEqual({ x: 100, y: 180 })
    expect(path.points[path.points.length - 1]).toEqual({ x: 200, y: 800 })
    // every segment is level or upright
    for (let i = 1; i < path.points.length; i++) expect(path.points[i].x === path.points[i - 1].x || path.points[i].y === path.points[i - 1].y).toBe(true)
  })

  it('is one straight segment when the two are in line', () => {
    const items = [note('a', 0, 0), note('b', 600, 0)]
    expect(connectorPath(arrow('c', { item: 'a' }, { item: 'b' }, 'elbow'), items)!.points).toEqual([{ x: 200, y: 90 }, { x: 600, y: 90 }])
  })

  it('comes out of the left side when the other is to the left', () => {
    const items = [note('a', 600, 0), note('b', 0, 400)]
    const path = connectorPath(arrow('c', { item: 'a' }, { item: 'b' }, 'elbow'), items)!
    expect(path.points[0].x).toBe(600)
    expect(path.points[path.points.length - 1].x).toBe(200)
  })

  it('is straight when the two overlap, since there is no room for an elbow', () => {
    const items = [note('a', 0, 0), note('b', 100, 20)]
    expect(connectorPath(arrow('c', { item: 'a' }, { item: 'b' }, 'elbow'), items)!.points).toHaveLength(2)
  })

  it('works with an end of its own', () => {
    const path = connectorPath(arrow('c', { item: 'a' }, { x: 800, y: 400 }, 'elbow'), [note('a', 0, 0)])!
    expect(path.points[0]).toEqual({ x: 200, y: 90 })
    expect(path.points[path.points.length - 1]).toEqual({ x: 800, y: 400 })
  })
})

describe('pointAlong', () => {
  it('finds the point a fraction of the way along a line with turns', () => {
    const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]
    expect(pointAlong(points, 0.5)).toEqual({ x: 100, y: 0 })
    expect(pointAlong(points, 0.25)).toEqual({ x: 50, y: 0 })
    expect(pointAlong(points, 1)).toEqual({ x: 100, y: 100 })
  })

  it('is the start when the line has no length', () => {
    expect(pointAlong([{ x: 5, y: 5 }, { x: 5, y: 5 }], 0.5)).toEqual({ x: 5, y: 5 })
  })
})

describe('resolveEnd and endPoints', () => {
  it('finds the thing an end is on, and the middle of it', () => {
    expect(resolveEnd({ item: 'a' }, [note('a', 0, 0)])).toMatchObject({ point: { x: 100, y: 90 } })
    expect(resolveEnd({ x: 5, y: 6 }, [])).toEqual({ point: { x: 5, y: 6 }, item: null })
    expect(resolveEnd({ item: 'ghost' }, [])).toBeNull()
  })

  it('gives the points of both ends', () => {
    expect(endPoints(arrow('c', { item: 'a' }, { x: 9, y: 9 }), [note('a', 0, 0)])).toEqual([{ x: 100, y: 90 }, { x: 9, y: 9 }])
  })
})

describe('connectTargetAt', () => {
  const items: BoardItem[] = [frame('f', 0, 0, 1000, 800), note('a', 100, 100), note('b', 150, 150)]

  it('is the thing on top at the point', () => {
    expect(connectTargetAt(items, { x: 200, y: 200 })?.id).toBe('b')
    expect(connectTargetAt(items, { x: 120, y: 120 })?.id).toBe('a')
  })

  it('is not the thing the arrow starts from', () => {
    expect(connectTargetAt(items, { x: 200, y: 200 }, 'b')?.id).toBe('a')
  })

  it('is a frame only when the point is on its border, and nothing inside it', () => {
    expect(connectTargetAt(items, { x: 5, y: 400 })?.id).toBe('f')
    expect(connectTargetAt(items, { x: 600, y: 600 })).toBeNull()
  })

  it('is nothing on the empty board', () => {
    expect(connectTargetAt(items, { x: 3000, y: 3000 })).toBeNull()
  })
})

describe('frames hold what is inside them', () => {
  const items: BoardItem[] = [frame('f', 0, 0, 600, 400), note('in', 100, 100), note('half', 500, 100), note('out', 900, 100), text('label', 50, 300)]

  it('holds the things whose middle is inside', () => {
    expect(membersOf(items, items[0] as FrameItem).map((item) => item.id)).toEqual(['in', 'label'])
  })

  it('holds a thing that is half out when its middle is in, and not when it is not', () => {
    expect(frameOf(items, note('x', 450, 100))?.id).toBe('f')
    expect(frameOf(items, note('x', 520, 100))).toBeNull()
  })

  it('is the frame on top when frames overlap', () => {
    const both: BoardItem[] = [frame('under', 0, 0, 600, 400), frame('over', 50, 50, 300, 300), note('n', 100, 100)]
    expect(frameOf(both, both[2] as NoteItem)?.id).toBe('over')
  })

  it('moves what is inside with the frame, and does not move arrows', () => {
    const withArrow: BoardItem[] = [...items, arrow('c', { item: 'in' }, { item: 'out' })]
    expect(expandWithMembers(withArrow, ['f'])).toEqual(['f', 'in', 'label'])
    expect(expandWithMembers(withArrow, ['c'])).toEqual([])
  })

  it('does not repeat a thing that was asked for and is also inside the frame', () => {
    expect(expandWithMembers(items, ['f', 'in'])).toEqual(['f', 'in', 'label'])
  })

  it('does not nest frames: a frame inside a frame is not held by it, and what is in the inner one belongs to the inner one', () => {
    const nested: BoardItem[] = [frame('outer', 0, 0, 800, 600), frame('inner', 100, 100, 200, 200), note('n', 150, 150)]
    expect(expandWithMembers(nested, ['outer'])).toEqual(['outer'])
    expect(expandWithMembers(nested, ['inner'])).toEqual(['inner', 'n'])
  })

  it('puts a thing in one frame only when its middle is exactly on the line between two side by side', () => {
    const side: BoardItem[] = [frame('left', 0, 0, 500, 400), frame('right', 500, 0, 500, 400)]
    expect(frameOf(side, note('n', 400, 0))?.id).toBe('right')
  })
})

describe('describeItem', () => {
  const items: BoardItem[] = [note('Pricing', 0, 0), frame('f', 0, 0, 100, 100, 'Offers')]

  it('says what each kind of thing is', () => {
    expect(describeItem(note('x', 0, 0), items)).toBe('x')
    expect(describeItem({ ...note('x', 0, 0), text: '', author: 'ai' }, items)).toBe('Empty note, written by Droplet')
    expect(describeItem({ ...shape('s', 0, 0, 'diamond'), text: 'Decide' }, items)).toBe('Diamond: Decide')
    expect(describeItem(shape('s', 0, 0, 'ellipse'), items)).toBe('Ellipse, empty')
    expect(describeItem(text('t', 0, 0), items)).toBe('t')
    expect(describeItem(frame('f', 0, 0, 10, 10, 'Offers'), items)).toBe('Frame: Offers')
    expect(describeItem(frame('f', 0, 0, 10, 10, ''), items)).toBe('Frame: untitled')
  })

  it('says what an arrow joins', () => {
    expect(describeItem({ ...arrow('c', { item: 'Pricing' }, { item: 'f' }), text: 'leads to' }, items)).toBe('Arrow from Pricing to Offers, labelled leads to')
    expect(describeItem(arrow('c', { item: 'Pricing' }, { x: 5, y: 5 }), items)).toBe('Arrow from Pricing to a point')
  })
})
