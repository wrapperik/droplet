// Layout engine for the arrangeable workspace. Pure functions, no DOM.
//
// The grid has 24 columns, fine enough that items of any width can sit close together. Rows are small fixed units (ROW_PX), so an item's height is its measured
// content height in rows. Items never overlap and always rise as far as they can (vertical compaction),
// so moving something beside or beneath another item just works and gaps close up.
export const COLS = 24
export const ROW_PX = 8
export const GAP_PX = 16
export const GAP_ROWS = GAP_PX / ROW_PX

// The visible grid has rows too: each cell row is this many layout rows tall (40px), with a gap between.
export const ROWS_PER_CELL = 5
export const CELL_PX = ROWS_PER_CELL * ROW_PX
export const CELL_GAP_PX = GAP_PX

// A column of AUTO means "start where the previous item on this row ends". Used for default layouts so
// toolbars of different widths sit side by side without reserved gaps.
export const AUTO_COL = -1

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
  const indexOf = new Map(placements.map((p, index) => [p.id, index]))
  // Automatic columns come after explicit ones on the same row, in the order they were listed.
  const columnKey = (p: Placement) => (p.col === AUTO_COL ? COLS + 1 : p.col)
  const order = [...placements].sort(
    (a, b) =>
      a.row - b.row ||
      Number(b.id === priorityId) - Number(a.id === priorityId) ||
      columnKey(a) - columnKey(b) ||
      indexOf.get(a.id)! - indexOf.get(b.id)!,
  )

  const placed: Placement[] = []
  const preferredRow = new Map<string, number>()
  for (const item of order) {
    // An automatic column starts after whatever already sits on the same preferred row.
    let col = item.col
    if (col === AUTO_COL) {
      col = placed.reduce((end, other) => (preferredRow.get(other.id) === item.row ? Math.max(end, other.col + other.w) : end), 0)
      if (col + item.w > COLS) col = 0
    }
    col = clamp(col, 0, COLS - item.w)

    const fitted = { ...item, col }
    let row = 0
    for (const other of placed) {
      if (overlapsColumns(fitted, other)) row = Math.max(row, other.row + heightOf(heights, other.id))
    }
    placed.push({ ...fitted, row })
    preferredRow.set(item.id, item.row)
  }

  // Return in the original order so callers can rely on a stable list.
  return placements.map((p) => placed.find((q) => q.id === p.id)!)
}

// The layout to draw. Column counts depend on the grid's width, so a saved layout can come back with items
// that were side by side now overlapping (the grid is narrower, or a toolbar needs more columns than when it
// was saved). Plain compaction would push one of them below the other. Items that shared a row keep sharing
// it instead: the later one slides right to sit flush against the one it now overlaps, as long as it still
// fits inside the grid. If it does not fit, it drops beneath that neighbour, lined up with its left edge.
export function reflow(placements: Placement[], heights: Heights): Placement[] {
  const indexOf = new Map(placements.map((p, index) => [p.id, index]))
  const order = [...placements]
    .filter((p) => p.col !== AUTO_COL)
    .sort((a, b) => a.row - b.row || a.col - b.col || indexOf.get(a.id)! - indexOf.get(b.id)!)

  let working = placements
  for (const { id } of order) {
    const item = working.find((p) => p.id === id)!
    const blockers = working.filter(
      (other) => other.id !== id && other.col !== AUTO_COL && other.row === item.row && other.col <= item.col && overlapsColumns(item, other),
    )
    if (blockers.length === 0) continue
    const beside = Math.max(...blockers.map((other) => other.col + other.w))
    // Too wide to sit beside it: line up under its left edge, so the two stack neatly instead of staggering.
    const col = beside + item.w <= COLS ? beside : clamp(Math.min(...blockers.map((other) => other.col)), 0, COLS - item.w)
    working = working.map((p) => (p.id === id ? { ...p, col } : p))
  }
  return compact(working, heights)
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

// Brings a saved layout up to date with the current items: keeps where each item was put, but takes
// widths from the defaults, ignores items that no longer exist and adds any that are new.
export function reconcile(saved: Placement[], defaults: Placement[]): Placement[] {
  return defaults.map((fallback) => {
    const found = saved.find((p) => p.id === fallback.id)
    if (!found) return fallback
    const col = found.col === AUTO_COL ? AUTO_COL : clamp(found.col, 0, COLS - fallback.w)
    return { id: fallback.id, w: fallback.w, col, row: found.row }
  })
}

// How many columns an item of the given pixel width needs, given the grid's pixel width.
export function columnsForWidth(itemPx: number, gridPx: number): number {
  const column = (gridPx - GAP_PX * (COLS - 1)) / COLS
  return clamp(Math.ceil((itemPx + GAP_PX) / (column + GAP_PX)), 1, COLS)
}

// The pixel box of a placement inside the grid: where its columns start and its rows begin.
export function boxForPlacement(
  placement: Placement,
  gridPx: number,
  size?: { w: number; h: number },
): { left: number; top: number; width: number; height: number | null } {
  const column = (gridPx - GAP_PX * (COLS - 1)) / COLS
  const span = placement.w * column + (placement.w - 1) * GAP_PX
  return {
    left: placement.col * (column + GAP_PX),
    top: placement.row * ROW_PX,
    // An item that hugs its content is only as wide as that content, never wider than the columns it covers.
    width: size ? Math.min(size.w, span) : span,
    height: size ? size.h : null,
  }
}

// How far, in columns, a drop may slide sideways to avoid being pushed down.
export const MAX_NUDGE_COLS = 3

// Lower is better: how far down everything has been pushed in total.
const displacement = (placements: Placement[]) => placements.reduce((total, p) => total + p.row, 0)

// Where a dropped item settles. A drop that lands a column or two inside a neighbour would normally push one of
// the two below the other, leaving them staggered. Instead the item slides the shortest distance sideways to a
// spot where nothing needs pushing down, which puts it flush beside the neighbour. If no nearby spot is better,
// it stays put and the usual rules apply (the item it landed on is pushed down).
export function settle(
  placements: Placement[],
  heights: Heights,
  id: string,
  cell: { col: number; row: number },
): Placement[] {
  const width = placements.find((p) => p.id === id)!.w
  const attempt = (col: number) => compact(moveTo(placements, id, { col, row: cell.row }), heights, id)

  let best = attempt(cell.col)
  let bestScore = displacement(best)
  for (let shift = 1; shift <= MAX_NUDGE_COLS; shift += 1) {
    for (const direction of [-1, 1]) {
      const col = cell.col + direction * shift
      if (col < 0 || col + width > COLS) continue
      const result = attempt(col)
      const score = displacement(result)
      if (score < bestScore) {
        best = result
        bestScore = score
      }
    }
  }
  return best
}
