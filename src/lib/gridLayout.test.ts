import {
  COLS,
  CELL_PX,
  GAP_ROWS,
  ROWS_PER_CELL,
  cellFromPoint,
  compact,
  moveByKey,
  moveTo,
  rowsForHeight,
  samePlacements,
  type Heights,
  type Placement,
} from './gridLayout.ts'

const heights: Heights = { picker: 30, canvas: 50, contrast: 20 }
const defaults: Placement[] = [
  { id: 'picker', col: 0, row: 0, w: 3 },
  { id: 'canvas', col: 3, row: 0, w: 6 },
  { id: 'contrast', col: 9, row: 0, w: 3 },
]

const at = (list: Placement[], id: string) => list.find((p) => p.id === id)!

describe('compact', () => {
  it('leaves side-by-side items on the top row', () => {
    const result = compact(defaults, heights)
    expect(result.map((p) => p.row)).toEqual([0, 0, 0])
  })

  it('pulls an item up to sit directly beneath the one above it', () => {
    const result = compact(moveTo(defaults, 'contrast', { col: 0, row: 90 }), heights)
    expect(at(result, 'contrast')).toMatchObject({ col: 0, row: heights.picker })
  })

  it('never overlaps items', () => {
    const result = compact(moveTo(defaults, 'canvas', { col: 0, row: 0 }), heights, 'canvas')
    for (const a of result) {
      for (const b of result) {
        if (a.id === b.id) continue
        const columnsOverlap = a.col < b.col + b.w && b.col < a.col + a.w
        const rowsOverlap = a.row < b.row + heights[b.id] && b.row < a.row + heights[a.id]
        expect(columnsOverlap && rowsOverlap).toBe(false)
      }
    }
  })

  it('lets a dropped item push the item it lands on downwards', () => {
    const result = compact(moveTo(defaults, 'canvas', { col: 0, row: 0 }), heights, 'canvas')
    expect(at(result, 'canvas').row).toBe(0)
    expect(at(result, 'picker').row).toBe(heights.canvas)
  })

  it('keeps items inside the grid', () => {
    const result = compact(moveTo(defaults, 'canvas', { col: 11, row: 0 }), heights, 'canvas')
    expect(at(result, 'canvas').col).toBe(COLS - 6)
  })

  it('closes gaps when an item above shrinks', () => {
    const stacked = compact(moveTo(defaults, 'contrast', { col: 0, row: 90 }), heights)
    const shorter = compact(stacked, { ...heights, picker: 10 })
    expect(at(shorter, 'contrast').row).toBe(10)
  })

  it('moves an item down when the one above it grows', () => {
    const stacked = compact(moveTo(defaults, 'contrast', { col: 0, row: 90 }), heights)
    const taller = compact(stacked, { ...heights, picker: 44 })
    expect(at(taller, 'contrast').row).toBe(44)
  })
})

describe('cellFromPoint', () => {
  const box = { left: 100, top: 50, width: 1196 } // 12 columns of 83px with 16px gaps (1196 - 176) / 12 = 85
  it('centres the footprint on the pointer and clamps to the grid', () => {
    expect(cellFromPoint({ x: 100, y: 50 }, box, 3)).toEqual({ col: 0, row: 0 })
    expect(cellFromPoint({ x: 100 + 1196, y: 50 + 80 }, box, 3)).toEqual({ col: COLS - 3, row: ROWS_PER_CELL })
  })

  it('snaps the row to the top of the cell row under the pointer', () => {
    expect(cellFromPoint({ x: 100, y: 50 + CELL_PX - 1 }, box, 3).row).toBe(0)
    expect(cellFromPoint({ x: 100, y: 50 + CELL_PX }, box, 3).row).toBe(ROWS_PER_CELL)
    expect(cellFromPoint({ x: 100, y: 50 + CELL_PX * 3 + 5 }, box, 3).row).toBe(ROWS_PER_CELL * 3)
  })

  it('picks the column under the pointer', () => {
    const colWidth = (1196 - 16 * 11) / 12
    const x = 100 + 5 * (colWidth + 16) + colWidth / 2 // middle of column 5
    expect(cellFromPoint({ x, y: 50 }, box, 1).col).toBe(5)
  })
})

describe('moveByKey', () => {
  it('moves sideways by one column and stops at the edge', () => {
    const right = moveByKey(defaults, heights, 'picker', 'right')
    expect(at(right, 'picker').col).toBe(1)
    const left = moveByKey(defaults, heights, 'picker', 'left')
    expect(at(left, 'picker').col).toBe(0)
  })

  it('moves down past the neighbour beneath, and back up past the neighbour above', () => {
    const stacked = compact(moveTo(defaults, 'contrast', { col: 0, row: 90 }), heights)
    const up = compact(moveByKey(stacked, heights, 'contrast', 'up'), heights, 'contrast')
    expect(at(up, 'contrast').row).toBe(0)
    expect(at(up, 'picker').row).toBe(heights.contrast)
    const down = compact(moveByKey(up, heights, 'contrast', 'down'), heights, 'contrast')
    expect(at(down, 'picker').row).toBe(0)
    expect(at(down, 'contrast').row).toBe(heights.picker)
  })

  it('does nothing when there is no neighbour in that direction', () => {
    const result = moveByKey(defaults, heights, 'picker', 'up')
    expect(samePlacements(result, compact(defaults, heights))).toBe(true)
  })
})

describe('rowsForHeight and samePlacements', () => {
  it('rounds up to whole rows and adds the gap', () => {
    expect(rowsForHeight(80)).toBe(10 + GAP_ROWS)
    expect(rowsForHeight(81)).toBe(11 + GAP_ROWS)
  })

  it('compares placements regardless of order', () => {
    expect(samePlacements(defaults, [...defaults].reverse())).toBe(true)
    expect(samePlacements(defaults, moveTo(defaults, 'picker', { col: 1, row: 0 }))).toBe(false)
  })
})
