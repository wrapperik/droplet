import { describe, expect, it } from 'vitest'
import { BOARD_H, BOARD_W, GRID, intersects, type Rect } from './boardGeometry.ts'
import { AI_NOTE, boardMiddle, layoutCluster, middleOf, placeCluster, roomInFrame, slotInFrame, spotLoose, spotNear } from './boardPlacement.ts'
import { rectOf, type BoardItem, type FrameItem, type NoteItem } from './boardTypes.ts'

const note = (id: string, x: number, y: number, w = 200, h = 180): NoteItem => ({ id, kind: 'note', x, y, w, h, text: id, colour: 'yellow', author: 'you' })
const frame = (id: string, x: number, y: number, w: number, h: number): FrameItem => ({ id, kind: 'frame', x, y, w, h, title: id, colour: 'white' })
const inside = (rect: Rect, outer: Rect) => rect.x >= outer.x && rect.y >= outer.y && rect.x + rect.w <= outer.x + outer.w && rect.y + rect.h <= outer.y + outer.h

describe('slotInFrame', () => {
  const f = frame('f', 1000, 1000, 1000, 600)

  it('is the top-left of an empty frame, inside its padding and on the grid', () => {
    const slot = slotInFrame([f], f)!
    expect(slot).toEqual({ x: 1040, y: 1040, ...AI_NOTE })
    expect(slot.x % GRID).toBe(0)
  })

  it('fills the frame in rows, left to right, one after another, none on another', () => {
    let items: BoardItem[] = [f]
    const slots: Rect[] = []
    for (let i = 0; i < 6; i++) {
      const slot = slotInFrame(items, f)
      expect(slot).not.toBeNull()
      slots.push(slot!)
      items = [...items, { ...note(`n${i}`, slot!.x, slot!.y, slot!.w, slot!.h) }]
    }
    expect(slots[1].x).toBeGreaterThan(slots[0].x)
    expect(slots[1].y).toBe(slots[0].y)
    for (let i = 0; i < slots.length; i++) {
      expect(inside(slots[i], { x: f.x, y: f.y, w: f.w, h: f.h })).toBe(true)
      for (let j = i + 1; j < slots.length; j++) expect(intersects(slots[i], slots[j])).toBe(false)
    }
  })

  it('goes round the founder\'s notes, and a prompt of a template, which are in the way', () => {
    const slot = slotInFrame([f, note('mine', 1040, 1040, 300, 200)], f)!
    expect(intersects(slot, { x: 1040, y: 1040, w: 300, h: 200 })).toBe(false)
  })

  it('is null when the frame has no room left, or is too small for a note at all', () => {
    expect(slotInFrame([frame('tiny', 0, 0, 200, 200)], frame('tiny', 0, 0, 200, 200))).toBeNull()
    let items: BoardItem[] = [f]
    for (let i = 0; i < 100; i++) {
      const slot = slotInFrame(items, f)
      if (!slot) break
      items = [...items, note(`n${i}`, slot.x, slot.y, slot.w, slot.h)]
    }
    expect(slotInFrame(items, f)).toBeNull()
  })

  it('says how many more would fit', () => {
    expect(roomInFrame([f], f)).toBeGreaterThan(5)
    const small = frame('small', 0, 0, 400, 300)
    expect(roomInFrame([small], small)).toBe(1)
    const none = frame('none', 0, 0, 300, 260)
    expect(roomInFrame([none], none)).toBe(0)
  })
})

describe('spotNear', () => {
  const target = note('t', 2000, 1500)

  it('is beside the thing, clear of it and of everything else', () => {
    const others: BoardItem[] = [target, note('o', 2300, 1500)]
    const spot = spotNear(others, target)!
    for (const other of others) expect(intersects(spot, rectOf(other as NoteItem))).toBe(false)
    expect(Math.hypot(spot.x - target.x, spot.y - target.y)).toBeLessThan(900)
  })

  it('puts several beside the same thing, each clear of the last', () => {
    let items: BoardItem[] = [target]
    const spots: Rect[] = []
    for (let i = 0; i < 5; i++) {
      const spot = spotNear(items, target)!
      spots.push(spot)
      items = [...items, note(`a${i}`, spot.x, spot.y, spot.w, spot.h)]
    }
    for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) expect(intersects(spots[i], spots[j])).toBe(false)
  })

  it('stays on the board for a thing at the edge', () => {
    const edge = note('e', BOARD_W - 200, BOARD_H - 180)
    const spot = spotNear([edge], edge)!
    expect(spot.x + spot.w).toBeLessThanOrEqual(BOARD_W)
    expect(spot.y + spot.h).toBeLessThanOrEqual(BOARD_H)
  })
})

describe('spotLoose', () => {
  it('is the nearest clear place to the point', () => {
    const spot = spotLoose([], { x: 1000, y: 1000 })!
    expect(Math.abs(spot.x + spot.w / 2 - 1000)).toBeLessThanOrEqual(GRID)
  })

  it('is not on top of what is there', () => {
    const there = note('a', 880, 900)
    const spot = spotLoose([there], { x: 1000, y: 1000 })!
    expect(intersects(spot, rectOf(there))).toBe(false)
  })
})

describe('layoutCluster', () => {
  const sizes = (n: number) => Array.from({ length: n }, () => ({ w: 240, h: 200 }))

  it('puts one in a frame of its own size plus room round it', () => {
    const layout = layoutCluster(sizes(1))
    expect(layout.rects).toHaveLength(1)
    expect(layout.frame.w).toBeGreaterThanOrEqual(240 + 80)
  })

  it('uses two columns for up to four and three for more', () => {
    expect(new Set(layoutCluster(sizes(4)).rects.map((rect) => rect.x)).size).toBe(2)
    expect(new Set(layoutCluster(sizes(7)).rects.map((rect) => rect.x)).size).toBe(3)
  })

  it('has everything inside the frame, clear of each other, in the order given', () => {
    const layout = layoutCluster(sizes(7))
    for (const rect of layout.rects) expect(inside(rect, { x: 0, y: 0, ...layout.frame })).toBe(true)
    for (let i = 0; i < layout.rects.length; i++) for (let j = i + 1; j < layout.rects.length; j++) expect(intersects(layout.rects[i], layout.rects[j])).toBe(false)
    expect(layout.rects[1].x).toBeGreaterThan(layout.rects[0].x)
    expect(layout.rects[3].y).toBeGreaterThan(layout.rects[0].y)
  })

  it('makes a column as wide as the widest in it, and a row as tall as the tallest', () => {
    const layout = layoutCluster([{ w: 400, h: 200 }, { w: 240, h: 300 }, { w: 240, h: 200 }, { w: 240, h: 200 }])
    // the second column starts after the widest of the first
    expect(layout.rects[1].x).toBeGreaterThanOrEqual(layout.rects[0].x + 400)
    // the second row starts after the tallest of the first
    expect(layout.rects[2].y).toBeGreaterThanOrEqual(layout.rects[1].y + 300)
  })

  it('has a frame on the grid', () => {
    const layout = layoutCluster(sizes(5))
    expect(layout.frame.w % GRID).toBe(0)
    expect(layout.frame.h % GRID).toBe(0)
  })
})

describe('placeCluster', () => {
  const layout = layoutCluster(Array.from({ length: 4 }, () => ({ w: 240, h: 200 })))

  it('goes near the point, clear of everything but what is moving into it', () => {
    const moving = note('m', 2300, 1500)
    const others = note('o', 2100, 1400, 800, 500)
    const origin = placeCluster([moving, others], layout, { x: 2400, y: 1600 }, ['m'])!
    const rect = { ...origin, ...layout.frame }
    expect(intersects(rect, rectOf(others))).toBe(false)
  })

  it('may use the place the moving things leave, since they are leaving it', () => {
    const moving = note('m', 2300, 1500, 600, 600)
    const origin = placeCluster([moving], layout, { x: 2600, y: 1800 }, ['m'])!
    expect(Math.abs(origin.x + layout.frame.w / 2 - 2600)).toBeLessThanOrEqual(GRID * 4)
  })

  it('is null when the board has no clear place', () => {
    expect(placeCluster([frame('wall', 0, 0, BOARD_W, BOARD_H)], layout, { x: 2400, y: 1600 }, [])).toBeNull()
  })
})

describe('middleOf', () => {
  it('is the middle of the things, and nothing for none', () => {
    expect(middleOf([note('a', 0, 0, 200, 200), note('b', 800, 400, 200, 200)])).toEqual({ x: 500, y: 300 })
    expect(middleOf([])).toBeNull()
    expect(boardMiddle).toEqual({ x: BOARD_W / 2, y: BOARD_H / 2 })
  })
})
