// Layout engine for the arrangeable workspace. Pure functions, no DOM.
//
// The grid has 12 columns. Rows are small fixed units (ROW_PX), so an item's height is its measured
// content height in rows. Items never overlap and always rise as far as they can (vertical compaction),
// so moving something beside or beneath another item just works and gaps close up.
export const COLS = 12
export const ROW_PX = 8
export const GAP_PX = 16
export const GAP_ROWS = GAP_PX / ROW_PX

// The visible grid has rows too: each cell row is this many layout rows tall (48px), with a gap between.
export const ROWS_PER_CELL = 6
export const CELL_PX = ROWS_PER_CELL * ROW_PX
export const CELL_GAP_PX = GAP_PX

export type Placement = { id: string; col: number; row: number; w: number }
export type Heights = Record<string, number> // rows, including the gap below the item

export const DEFAULT_HEIGHT_ROWS = 24

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

// Height in rows for a measured pixel height, including the gap below the item.
export function rowsForHeight(heightPx: number): number {
  return Math.ceil(heightPx / ROW_PX) + GAP_ROWS
}

const heightOf = (heights: Heights, id: string) => heights[id] ?? DEFAULT_HEIGHT_ROWS

const overlapsColumns = (a: Placement, b: Placement) => a.col < b.col + b.w && b.col < a.col + a.w

// Places items without overlap, each as high as it can go. `priorityId` wins ties on the same row,
// which is how a dropped item pushes the item it lands on downwards instead of the other way round.
export function compact(placements: Placement[], heights: Heights, priorityId?: string): Placement[] {
  const fitted = placements.map((p) => ({ ...p, col: clamp(p.col, 0, COLS - p.w) }))
  const order = [...fitted].sort(
    (a, b) =>
      a.row - b.row ||
      Number(b.id === priorityId) - Number(a.id === priorityId) ||
      a.col - b.col ||
      a.id.localeCompare(b.id),
  )

  const placed: Placement[] = []
  for (const item of order) {
    let row = 0
    for (const other of placed) {
      if (overlapsColumns(item, other)) row = Math.max(row, other.row + heightOf(heights, other.id))
    }
    placed.push({ ...item, row })
  }

  // Return in the original order so callers can rely on a stable list.
  return fitted.map((p) => placed.find((q) => q.id === p.id)!)
}

export function bottomRow(placements: Placement[], heights: Heights): number {
  return placements.reduce((max, p) => Math.max(max, p.row + heightOf(heights, p.id)), 0)
}

// Which grid cell is under a point, given the grid's box. The item's footprint is centred on the
// pointer horizontally and starts at the top of the cell row under the pointer.
export function cellFromPoint(
  point: { x: number; y: number },
  box: { left: number; top: number; width: number },
  width: number,
): { col: number; row: number } {
  const colWidth = (box.width - GAP_PX * (COLS - 1)) / COLS
  const pointerCol = Math.floor((point.x - box.left) / (colWidth + GAP_PX))
  const col = clamp(Math.round(pointerCol - (width - 1) / 2), 0, COLS - width)
  const row = Math.max(0, Math.floor((point.y - box.top) / CELL_PX)) * ROWS_PER_CELL
  return { col, row }
}

export function moveTo(placements: Placement[], id: string, cell: { col: number; row: number }): Placement[] {
  return placements.map((p) => (p.id === id ? { ...p, col: cell.col, row: cell.row } : p))
}

export type KeyMove = 'left' | 'right' | 'up' | 'down'

// Keyboard moves: sideways one column, or past the nearest neighbour above or below.
export function moveByKey(placements: Placement[], heights: Heights, id: string, move: KeyMove): Placement[] {
  const resolved = compact(placements, heights)
  const me = resolved.find((p) => p.id === id)
  if (!me) return placements

  if (move === 'left' || move === 'right') {
    const col = clamp(me.col + (move === 'left' ? -1 : 1), 0, COLS - me.w)
    return moveTo(resolved, id, { col, row: me.row })
  }

  const neighbours = resolved.filter((p) => p.id !== id && overlapsColumns(p, me))
  if (move === 'up') {
    const above = neighbours.filter((p) => p.row < me.row).sort((a, b) => b.row - a.row)[0]
    return above ? moveTo(resolved, id, { col: me.col, row: above.row }) : resolved
  }
  const below = neighbours.filter((p) => p.row > me.row).sort((a, b) => a.row - b.row)[0]
  return below ? moveTo(resolved, id, { col: me.col, row: below.row + 1 }) : resolved
}

export function samePlacements(a: Placement[], b: Placement[]): boolean {
  if (a.length !== b.length) return false
  return a.every((p) => {
    const q = b.find((other) => other.id === p.id)
    return q && q.col === p.col && q.row === p.row && q.w === p.w
  })
}
