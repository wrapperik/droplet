import { describe, expect, it } from 'vitest'
import {
  BOARD_H,
  BOARD_W,
  GRID,
  MAX_ZOOM,
  MIN_ZOOM,
  NOTE_DEFAULT,
  NOTE_MAX,
  NOTE_MIN,
  between,
  boundsOf,
  centredOn,
  clampZoom,
  contains,
  fitZoom,
  freeSpotNear,
  groupDelta,
  intersects,
  keepInside,
  resizeRect,
  scrollAfterZoom,
  screenToBoard,
  snap,
  stepZoom,
} from './boardGeometry.ts'

const rect = (x: number, y: number, w = 200, h = 180) => ({ x, y, w, h })

describe('snap', () => {
  it('goes to the nearest grid line', () => {
    expect(snap(9)).toBe(0)
    expect(snap(11)).toBe(GRID)
    expect(snap(-9)).toBe(-0)
    expect(snap(130)).toBe(140)
  })
})

describe('keepInside', () => {
  it('leaves a rectangle that is inside where it is', () => {
    expect(keepInside(rect(100, 100))).toEqual(rect(100, 100))
  })

  it('brings one back from each edge, without resizing it', () => {
    expect(keepInside(rect(-50, -20))).toEqual(rect(0, 0))
    expect(keepInside(rect(BOARD_W, BOARD_H))).toEqual(rect(BOARD_W - 200, BOARD_H - 180))
  })

  it('puts one that is larger than the bounds at the start', () => {
    expect(keepInside(rect(40, 40, 100, 100), { x: 0, y: 0, w: 50, h: 50 })).toEqual({ x: 0, y: 0, w: 100, h: 100 })
  })
})

describe('boundsOf, intersects, contains, between', () => {
  it('holds all the rectangles, and nothing for none', () => {
    expect(boundsOf([rect(0, 0, 100, 100), rect(300, 200, 100, 100)])).toEqual({ x: 0, y: 0, w: 400, h: 300 })
    expect(boundsOf([])).toBeNull()
  })

  it('says whether two overlap, and not when they only touch', () => {
    expect(intersects(rect(0, 0, 100, 100), rect(50, 50, 100, 100))).toBe(true)
    expect(intersects(rect(0, 0, 100, 100), rect(100, 0, 100, 100))).toBe(false)
    expect(intersects(rect(0, 0, 100, 100), rect(0, 200, 100, 100))).toBe(false)
  })

  it('says whether a point is in a rectangle, edges included', () => {
    expect(contains(rect(10, 10, 100, 100), { x: 10, y: 110 })).toBe(true)
    expect(contains(rect(10, 10, 100, 100), { x: 9, y: 50 })).toBe(false)
  })

  it('makes the rectangle between two corners whichever way they were dragged', () => {
    expect(between({ x: 300, y: 50 }, { x: 100, y: 250 })).toEqual({ x: 100, y: 50, w: 200, h: 200 })
  })
})

describe('groupDelta', () => {
  it('snaps the first rectangle onto the grid', () => {
    expect(groupDelta([rect(100, 100)], 13, 27)).toEqual({ x: 20, y: 20 })
  })

  it('moves the group as one, keeping them where they are among themselves', () => {
    const group = [rect(100, 100), rect(333, 217)]
    const delta = groupDelta(group, 40, 40)
    expect(delta).toEqual({ x: 40, y: 40 })
  })

  it('holds the group back at the board edge, by the one that is farthest out', () => {
    const group = [rect(0, 0, 100, 100), rect(BOARD_W - 100, 500, 100, 100)]
    expect(groupDelta(group, 400, 0)).toEqual({ x: 0, y: 0 })
    expect(groupDelta(group, -400, 0)).toEqual({ x: 0, y: 0 })
    const down = groupDelta([rect(100, BOARD_H - 300, 200, 180)], 0, 900)
    expect(down.y).toBe(BOARD_H - 180 - (BOARD_H - 300))
  })

  it('does not move an empty group', () => {
    expect(groupDelta([], 50, 50)).toEqual({ x: 0, y: 0 })
  })
})

describe('resizeRect', () => {
  it('snaps the size', () => {
    expect(resizeRect(rect(100, 100), 251, 229)).toMatchObject({ w: 260, h: 220 })
  })

  it('keeps it between the least and the most', () => {
    expect(resizeRect(rect(100, 100), 10, 10)).toMatchObject(NOTE_MIN)
    expect(resizeRect(rect(100, 100), 5000, 5000)).toMatchObject(NOTE_MAX)
  })

  it('does not let it grow past the board edge', () => {
    const next = resizeRect(rect(BOARD_W - 300, BOARD_H - 250), 600, 600)
    expect(next.w).toBe(300)
    expect(next.h).toBe(250)
  })

  it('keeps where it starts', () => {
    expect(resizeRect(rect(140, 160), 300, 300)).toMatchObject({ x: 140, y: 160 })
  })
})

describe('centredOn', () => {
  it('centres a note on a point, snapped', () => {
    expect(centredOn({ x: 500, y: 500 })).toEqual({ x: 400, y: 420, ...NOTE_DEFAULT })
  })

  it('keeps it inside the board when the point is at a corner', () => {
    expect(centredOn({ x: 0, y: 0 })).toMatchObject({ x: 0, y: 0 })
    expect(centredOn({ x: BOARD_W, y: BOARD_H })).toMatchObject({ x: BOARD_W - NOTE_DEFAULT.w, y: BOARD_H - NOTE_DEFAULT.h })
  })
})

describe('freeSpotNear', () => {
  it('uses the point itself when it is clear', () => {
    expect(freeSpotNear({ x: 500, y: 500 }, NOTE_DEFAULT, [])).toEqual(centredOn({ x: 500, y: 500 }))
  })

  it('moves along to a place that is clear when the point is taken, and stays near', () => {
    const taken = centredOn({ x: 500, y: 500 })
    const spot = freeSpotNear({ x: 500, y: 500 }, NOTE_DEFAULT, [taken])
    expect(intersects(spot, taken)).toBe(false)
    expect(Math.abs(spot.x - taken.x)).toBeLessThanOrEqual(NOTE_DEFAULT.w * 2)
    expect(Math.abs(spot.y - taken.y)).toBeLessThanOrEqual(NOTE_DEFAULT.h * 2)
  })

  it('finds a clear place when several are taken', () => {
    const others = [centredOn({ x: 500, y: 500 })]
    for (let i = 0; i < 6; i++) others.push(freeSpotNear({ x: 500, y: 500 }, NOTE_DEFAULT, others))
    for (let i = 0; i < others.length; i++) for (let j = i + 1; j < others.length; j++) expect(intersects(others[i], others[j])).toBe(false)
  })

  it('stays on the board', () => {
    const spot = freeSpotNear({ x: 0, y: 0 }, NOTE_DEFAULT, [centredOn({ x: 0, y: 0 })])
    expect(spot.x).toBeGreaterThanOrEqual(0)
    expect(spot.y).toBeGreaterThanOrEqual(0)
  })
})

describe('zoom', () => {
  it('steps through the fixed steps, and stops at the ends', () => {
    expect(stepZoom(1, 1)).toBe(1.25)
    expect(stepZoom(1, -1)).toBe(0.8)
    expect(stepZoom(MAX_ZOOM, 1)).toBe(MAX_ZOOM)
    expect(stepZoom(MIN_ZOOM, -1)).toBe(MIN_ZOOM)
  })

  it('goes to the next step from a zoom that is between steps', () => {
    expect(stepZoom(0.9, 1)).toBe(1)
    expect(stepZoom(0.9, -1)).toBe(0.8)
  })

  it('keeps a zoom within its limits', () => {
    expect(clampZoom(5)).toBe(MAX_ZOOM)
    expect(clampZoom(0.01)).toBe(MIN_ZOOM)
  })

  it('fits the board to a viewport, but never past 100 percent', () => {
    expect(fitZoom({ w: 2400, h: 1600 })).toBe(0.5)
    expect(fitZoom({ w: 9000, h: 9000 })).toBe(1)
    expect(fitZoom({ w: 100, h: 100 })).toBe(MIN_ZOOM)
  })

  it('keeps the same board point under the cursor when the zoom changes', () => {
    const anchor = { x: 300, y: 200 }
    const scroll = { x: 600, y: 400 }
    const next = scrollAfterZoom(scroll, anchor, 1, 2)
    // the point under the cursor was at 900, 600 on the board, and is again
    expect((next.x + anchor.x) / 2).toBe(900)
    expect((next.y + anchor.y) / 2).toBe(600)
  })
})

describe('screenToBoard', () => {
  it('reads a point on the screen as a point on the board', () => {
    expect(screenToBoard({ x: 350, y: 250 }, { x: 50, y: 50 }, 2)).toEqual({ x: 150, y: 100 })
  })
})
