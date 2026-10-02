import {
  AUTO_COL,
  COLS,
  CELL_PX,
  GAP_ROWS,
  ROWS_PER_CELL,
  boxForPlacement,
  cellFromPoint,
  columnsForWidth,
  compact,
  moveByKey,
  moveTo,
  reflow,
  reconcile,
  rowsForHeight,
  settle,
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
    const result = compact(moveTo(defaults, 'canvas', { col: COLS - 1, row: 0 }), heights, 'canvas')
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
  const box = { left: 100, top: 50, width: 1196 }
  it('centres the footprint on the pointer and clamps to the grid', () => {
    expect(cellFromPoint({ x: 100, y: 50 }, box, 3)).toEqual({ col: 0, row: 0 })
    expect(cellFromPoint({ x: 100 + 1196, y: 50 + CELL_PX }, box, 3)).toEqual({ col: COLS - 3, row: ROWS_PER_CELL })
  })

  it('snaps the row to the top of the cell row under the pointer', () => {
    expect(cellFromPoint({ x: 100, y: 50 + CELL_PX - 1 }, box, 3).row).toBe(0)
    expect(cellFromPoint({ x: 100, y: 50 + CELL_PX }, box, 3).row).toBe(ROWS_PER_CELL)
    expect(cellFromPoint({ x: 100, y: 50 + CELL_PX * 3 + 5 }, box, 3).row).toBe(ROWS_PER_CELL * 3)
  })

  it('picks the column under the pointer', () => {
    const colWidth = (1196 - 16 * (COLS - 1)) / COLS
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

describe('reconcile', () => {
  it('keeps saved positions but takes widths from the defaults', () => {
    const saved: Placement[] = [{ id: 'picker', col: 7, row: 12, w: 3 }]
    const result = reconcile(saved, [{ id: 'picker', col: 0, row: 0, w: 4 }])
    expect(result).toEqual([{ id: 'picker', col: 7, row: 12, w: 4 }])
  })

  it('keeps items inside the grid when a width grew', () => {
    const result = reconcile([{ id: 'canvas', col: 9, row: 0, w: 3 }], [{ id: 'canvas', col: 0, row: 0, w: COLS }])
    expect(result[0].col).toBe(0)
  })

  it('adds new items and drops removed ones', () => {
    const saved: Placement[] = [{ id: 'gone', col: 1, row: 1, w: 3 }]
    const defaults: Placement[] = [{ id: 'new', col: 2, row: 0, w: 4 }]
    expect(reconcile(saved, defaults)).toEqual(defaults)
  })
})

describe('automatic columns', () => {
  const flow: Placement[] = [
    { id: 'a', col: 0, row: 0, w: 4 },
    { id: 'b', col: AUTO_COL, row: 0, w: 6 },
    { id: 'c', col: 0, row: 10, w: 12 },
  ]

  it('starts an automatic item where the previous one on its row ends', () => {
    const result = compact(flow, { a: 10, b: 10, c: 10 })
    expect(at(result, 'b')).toMatchObject({ col: 4, row: 0 })
  })

  it('keeps the order the items were listed in', () => {
    const three: Placement[] = [
      { id: 'z', col: AUTO_COL, row: 0, w: 3 },
      { id: 'y', col: AUTO_COL, row: 0, w: 3 },
    ]
    const result = compact(three, { z: 10, y: 10 })
    expect(at(result, 'z').col).toBe(0)
    expect(at(result, 'y').col).toBe(3)
  })

  it('wraps to the next row when there is no room left', () => {
    const wide: Placement[] = [
      { id: 'a', col: 0, row: 0, w: COLS - 4 },
      { id: 'b', col: AUTO_COL, row: 0, w: 6 },
    ]
    const result = compact(wide, { a: 10, b: 10 })
    expect(at(result, 'b')).toMatchObject({ col: 0, row: 10 })
  })

  it('survives reconcile', () => {
    expect(reconcile([{ id: 'b', col: AUTO_COL, row: 0, w: 1 }], [{ id: 'b', col: 0, row: 0, w: 6 }])[0].col).toBe(AUTO_COL)
  })
})

describe('columnsForWidth', () => {
  it('rounds up to whole columns including the gaps between them', () => {
    const grid = 1242
    const pitch = (grid - 16 * (COLS - 1)) / COLS + 16
    const exact = 5 * pitch - 16 // exactly five columns wide
    expect(columnsForWidth(exact, grid)).toBe(5)
    expect(columnsForWidth(exact + 1, grid)).toBe(6)
    expect(columnsForWidth(5000, grid)).toBe(COLS)
    expect(columnsForWidth(1, grid)).toBe(1)
  })
})

describe('boxForPlacement', () => {
  const grid = 1242
  const column = (grid - 16 * (COLS - 1)) / COLS

  it('places the box at its column and row', () => {
    const box = boxForPlacement({ id: 'a', col: 4, row: 10, w: 3 }, grid)
    expect(box.left).toBeCloseTo(4 * (column + 16), 5)
    expect(box.top).toBe(80)
    expect(box.width).toBeCloseTo(3 * column + 2 * 16, 5)
  })

  it('uses the content size when it is smaller than the columns', () => {
    const box = boxForPlacement({ id: 'a', col: 0, row: 0, w: 12 }, grid, { w: 403, h: 51 })
    expect(box.width).toBe(403)
    expect(box.height).toBe(51)
  })

  it('never exceeds the columns it covers', () => {
    const box = boxForPlacement({ id: 'a', col: 0, row: 0, w: 2 }, grid, { w: 900, h: 40 })
    expect(box.width).toBeCloseTo(2 * column + 16, 5)
  })
})

describe('settle', () => {
  const h: Heights = { picker: 10, contrast: 10, canvas: 40 }
  // picker covers columns 0 to 7 and contrast covers 8 to 19, side by side on the top row; canvas is beneath.
  const sideBySide: Placement[] = [
    { id: 'picker', col: 0, row: 0, w: 8 },
    { id: 'contrast', col: 8, row: 0, w: 12 },
    { id: 'canvas', col: 0, row: 10, w: COLS },
  ]

  it('slides a drop that lands a column inside a neighbour to sit flush beside it', () => {
    // contrast dropped one column too far left, overlapping the picker
    const result = settle(sideBySide, h, 'contrast', { col: 7, row: 0 })
    expect(at(result, 'contrast')).toMatchObject({ col: 8, row: 0 })
    expect(at(result, 'picker')).toMatchObject({ col: 0, row: 0 })
  })

  it('works from the other side too', () => {
    const result = settle(sideBySide, h, 'picker', { col: 1, row: 0 })
    expect(at(result, 'picker')).toMatchObject({ col: 0, row: 0 })
    expect(at(result, 'contrast')).toMatchObject({ row: 0 })
  })

  it('does not slide when no nearby spot is better, so landing on a wide item still pushes it down', () => {
    const result = settle(sideBySide, h, 'picker', { col: 4, row: 10 })
    expect(at(result, 'picker').col).toBe(4)
    expect(at(result, 'picker').row).toBeLessThan(at(result, 'canvas').row + 1)
  })

  it('leaves a clean drop alone', () => {
    const result = settle(sideBySide, h, 'contrast', { col: 8, row: 0 })
    expect(at(result, 'contrast')).toMatchObject({ col: 8, row: 0 })
  })

  it('stays inside the grid', () => {
    const result = settle(sideBySide, h, 'contrast', { col: COLS - 12, row: 0 })
    expect(at(result, 'contrast').col + at(result, 'contrast').w).toBeLessThanOrEqual(COLS)
  })
})

describe('reflow', () => {
  const h: Heights = { a: 10, b: 10, c: 40 }

  it('keeps items that shared a row on that row when a neighbour grows into them', () => {
    // a was saved 8 columns wide with b beside it at column 8; a now needs 11 columns
    const grown: Placement[] = [
      { id: 'a', col: 0, row: 0, w: 11 },
      { id: 'b', col: 8, row: 0, w: 13 },
      { id: 'c', col: 0, row: 10, w: COLS },
    ]
    const result = reflow(grown, h)
    expect(at(result, 'b')).toMatchObject({ col: 11, row: 0 })
    expect(at(result, 'c').row).toBe(10)
  })

  it('drops the item beneath its neighbour, lined up with it, when it can no longer fit beside it', () => {
    const tooWide: Placement[] = [
      { id: 'a', col: 0, row: 0, w: 11 },
      { id: 'b', col: 8, row: 0, w: 14 },
      { id: 'c', col: 0, row: 10, w: COLS },
    ]
    const result = reflow(tooWide, h)
    expect(at(result, 'b')).toMatchObject({ col: 0, row: h.a })
  })

  it('works when the item that grew is the one on the left', () => {
    const rightGrew: Placement[] = [
      { id: 'a', col: 0, row: 0, w: 6 },
      { id: 'b', col: 6, row: 0, w: 8 },
      { id: 'c', col: 0, row: 10, w: COLS },
    ]
    // a grows to 9 columns, so b must move from column 6 to column 9
    const result = reflow(rightGrew.map((p) => (p.id === 'a' ? { ...p, w: 9 } : p)), h)
    expect(at(result, 'b')).toMatchObject({ col: 9, row: 0 })
  })

  it('does not move items that were on different rows, or already clear of each other', () => {
    const apart: Placement[] = [
      { id: 'a', col: 0, row: 0, w: 8 },
      { id: 'b', col: 8, row: 0, w: 8 },
      { id: 'c', col: 0, row: 10, w: COLS },
    ]
    expect(samePlacements(reflow(apart, h), compact(apart, h))).toBe(true)
    const stacked: Placement[] = [
      { id: 'a', col: 0, row: 0, w: 8 },
      { id: 'b', col: 4, row: 10, w: 8 },
      { id: 'c', col: 0, row: 20, w: COLS },
    ]
    expect(samePlacements(reflow(stacked, h), compact(stacked, h))).toBe(true)
  })

  it('leaves automatic columns to compaction', () => {
    const flow: Placement[] = [
      { id: 'a', col: 0, row: 0, w: 11 },
      { id: 'b', col: AUTO_COL, row: 0, w: 13 },
      { id: 'c', col: 0, row: 10, w: COLS },
    ]
    expect(samePlacements(reflow(flow, h), compact(flow, h))).toBe(true)
  })
})
