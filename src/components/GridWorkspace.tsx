import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { GripHorizontalIcon, GripVerticalIcon } from '@solar-icons/react/linear'
import {
  COLS,
  ROW_PX,
  boxForPlacement,
  bottomRow,
  cellFromCorner,
  clamp,
  compact,
  moveByKey,
  reflow,
  rowsForHeight,
  settle,
  spanFromPoint,
  widthLabel,
  type Heights,
  type KeyMove,
  type Placement,
} from '../lib/gridLayout.ts'
import { fadeLift, flyLift, makeLift, moveLift, toRect, type Rect } from '../lib/lift.ts'
import type { ShelfHandle } from './ToolShelf.tsx'
import Emerge from './Emerge.tsx'
import './GridWorkspace.css'

// A window on the grid: something to look at and work in, such as the palette or the preview. Each fills the columns it
// is given and can be dragged to any width, from `minCols` up to the full width.
export type WorkspaceItem = {
  id: string
  title: string
  // Width in grid columns (out of 24).
  w: number
  node: ReactNode
  minCols: number
  // A tool that has been dragged out of the toolbar. It can be dragged back to the toolbar.
  tool?: boolean
  // How the item first appears (see Emerge).
  delay?: number
  distance?: number
}

// A tool being carried out of the toolbar: where its copy is, and how big the window it would become is.
export type Incoming = { id: string; left: number; top: number; w: number; heightPx: number }

// What the workspace can ask of the grid.
export type GridHandle = {
  // The layout of the windows on screen with the incoming window placed where its copy is, as a person dropping it would.
  place: (incoming: Incoming) => Placement[] | null
}

type Props = {
  // Items in the order they stack on a narrow screen.
  items: WorkspaceItem[]
  layout: Placement[]
  onLayoutChange: (next: Placement[]) => void
  // Called as an item is resized: its new column count.
  onResize?: (id: string, columns: number) => void
  // Reports where each item is drawn and how tall it is, for anything that needs to place one relative to another.
  onResolved?: (resolved: Placement[], heights: Heights) => void
  // A tool carried out of the toolbar, whose landing spot is outlined.
  incoming?: Incoming | null
  controlRef?: RefObject<GridHandle | null>
  // The toolbar, which a window that was a tool can be carried back to.
  shelf?: RefObject<ShelfHandle | null>
  onReturn?: (id: string, before: string | null) => void
}

// Below this width the items would be too narrow for the components, so items stack and cannot be moved.
const MIN_GRID_WIDTH = 940
// Empty rows kept beneath the last item, so there is always room to drop something below.
const SPARE_ROWS = 26
// A press that moves less than this is a click, not a drag.
const DRAG_THRESHOLD_PX = 6
// Springs with no bounce: things arrive and stop, as they do on an Apple device.
const SPRING = { type: 'spring', stiffness: 420, damping: 40, mass: 0.9 } as const
const SPRING_SOFT = { type: 'spring', stiffness: 520, damping: 44, mass: 0.7 } as const

type ResizeDrag = {
  id: string
  pointerId: number
  startValue: number
  lastValue: number
}

type DragRun = {
  id: string
  pointerId: number
  start: { x: number; y: number }
  // Where on the window it was picked up, so the carried copy stays under the pointer the same way.
  grab: { dx: number; dy: number }
  origin: Rect
  moved: boolean
  lift: HTMLDivElement | null
  cell: { col: number; row: number }
  last: { x: number; y: number }
  // Carried over the toolbar, so it would go back to being a tool.
  overShelf: boolean
}

const KEY_MOVES: Record<string, KeyMove> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
}

// A grid of 24 columns, never drawn, whose windows can be dragged anywhere and dragged to any width. While one is
// carried, a copy of it follows the pointer and its landing spot is outlined. On release the copy settles into place and
// the others glide aside.
export default function GridWorkspace({ items, layout, onLayoutChange, onResize, onResolved, incoming, controlRef, shelf, onReturn }: Props) {
  const reduceMotion = useReducedMotion() ?? false
  const rootRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const runRef = useRef<DragRun | null>(null)
  const resizeRef = useRef<ResizeDrag | null>(null)
  const landingRef = useRef<{ id: string; lift: HTMLDivElement; from: Rect; timer: number } | null>(null)

  const [width, setWidth] = useState<number | null>(null)
  const [heights, setHeights] = useState<Heights>({})
  const [dragId, setDragId] = useState<string | null>(null)
  // True once the pointer has moved far enough that the copy is lifted.
  const [lifted, setLifted] = useState(false)
  const [cell, setCell] = useState<{ col: number; row: number } | null>(null)
  const [landingId, setLandingId] = useState<string | null>(null)
  const [overShelf, setOverShelf] = useState(false)
  const [resizingId, setResizingId] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')

  const wide = width !== null && width >= MIN_GRID_WIDTH
  const itemIds = items.map((item) => item.id).join(',')

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    setWidth(root.getBoundingClientRect().width)
    // A width of nothing means the workspace is hidden, not that it has become narrow, so it is ignored.
    const observer = new ResizeObserver(([entry]) => entry.contentRect.width > 0 && setWidth(entry.contentRect.width))
    observer.observe(root)
    return () => observer.disconnect()
  }, [])

  // Measure every item's height, which the grid turns into rows.
  useEffect(() => {
    if (!wide) return
    const observer = new ResizeObserver((entries) => {
      setHeights((current) => {
        const next = { ...current }
        let changed = false
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.id
          if (!id) continue
          const rows = rowsForHeight((entry.target as HTMLElement).offsetHeight)
          if (next[id] !== rows) {
            next[id] = rows
            changed = true
          }
        }
        return changed ? next : current
      })
    })
    for (const element of Object.values(itemRefs.current)) if (element) observer.observe(element)
    return () => observer.disconnect()
  }, [wide, itemIds])

  const resolved = useMemo(() => reflow(layout, heights), [layout, heights])
  // Items glide to a new place only when a place changes, not while the window is resized.
  const placeKey = useMemo(() => resolved.map((p) => `${p.id}:${p.col}:${p.row}`).join('|'), [resolved])

  const itemById = (id: string) => items.find((item) => item.id === id)!

  const candidate = useMemo(() => {
    if (!dragId || !cell) return null
    return settle(resolved, heights, dragId, cell)
  }, [dragId, cell, resolved, heights])
  const preview = dragId && candidate ? candidate.find((p) => p.id === dragId)! : null

  // Where a tool carried out of the toolbar would land, worked out as for any window: it takes the cell its copy is over, and
  // pushes down whatever it lands on.
  const landingFor = (carried: Incoming, base: Placement[], baseHeights: Heights): Placement[] | null => {
    const box = gridRef.current?.getBoundingClientRect()
    if (!box) return null
    const cols = clamp(carried.w, 1, COLS)
    const cellNow = cellFromCorner({ left: carried.left, top: carried.top }, box, cols)
    const placed = [...base.filter((p) => p.id !== carried.id), { id: carried.id, col: cellNow.col, row: cellNow.row, w: cols }]
    return settle(placed, { ...baseHeights, [carried.id]: rowsForHeight(carried.heightPx) }, carried.id, cellNow)
  }
  const incomingLanding = incoming && wide ? landingFor(incoming, resolved, heights) : null
  const incomingPlacement = incoming ? incomingLanding?.find((p) => p.id === incoming.id) ?? null : null

  // The latest state, readable from window listeners without going stale.
  const layoutRef = useRef(resolved)
  const latest = useRef({ layout: resolved, heights, onLayoutChange, onResize })
  useLayoutEffect(() => {
    layoutRef.current = resolved
    latest.current = { layout: resolved, heights, onLayoutChange, onResize }
    onResolved?.(resolved, heights)
  })
  useLayoutEffect(() => {
    if (!controlRef) return
    controlRef.current = { place: (carried) => (wide ? landingFor(carried, layoutRef.current, latest.current.heights) : null) }
    return () => {
      controlRef.current = null
    }
    // landingFor only reads refs and the latest state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlRef, wide])

  const rectOf = (id: string): Rect | null => {
    const element = itemRefs.current[id]?.querySelector<HTMLElement>('.gw__emerge')
    return element ? toRect(element.getBoundingClientRect()) : null
  }

  // The cell under the carried copy: its top-left corner, worked out from where the pointer is and where it was grabbed.
  const cellAt = (run: DragRun, x: number, y: number) => {
    const box = gridRef.current!.getBoundingClientRect()
    const cols = layoutRef.current.find((p) => p.id === run.id)?.w ?? itemById(run.id).w
    return cellFromCorner({ left: x - run.grab.dx, top: y - run.grab.dy }, box, cols)
  }

  const beginDrag = (event: PointerEvent<HTMLButtonElement>, id: string) => {
    if (event.button !== 0 || runRef.current || landingRef.current) return
    const origin = rectOf(id)
    if (!origin) return
    event.preventDefault()
    const run: DragRun = {
      id,
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      grab: { dx: event.clientX - origin.left, dy: event.clientY - origin.top },
      origin,
      moved: false,
      lift: null,
      cell: { col: 0, row: 0 },
      last: { x: event.clientX, y: event.clientY },
      overShelf: false,
    }
    run.cell = cellAt(run, event.clientX, event.clientY)
    runRef.current = run
    setCell(run.cell)
    setDragId(id)
  }

  // A drag is tracked on the window, not on the grip, so it always ends: on release anywhere (even outside the
  // page), if the button is already up when the pointer next moves, on cancel, right-click, blur or Escape.
  useEffect(() => {
    if (!dragId) return

    const finish = (commit: boolean) => {
      const run = runRef.current
      runRef.current = null
      setDragId(null)
      setLifted(false)
      setCell(null)
      setOverShelf(false)
      shelf?.current?.setTarget(false)
      if (!run) return
      // Let go over the toolbar: the window goes back to being a tool, in the place its copy is over.
      if (run.moved && commit && run.overShelf && run.lift && shelf?.current) {
        onReturn?.(run.id, shelf.current.beforeAt(run.last.x, run.last.y))
        setAnnouncement(`${itemById(run.id).title} is back in the toolbar.`)
        fadeLift(run.lift, reduceMotion)
        return
      }
      if (run.moved && commit && run.lift) {
        const { layout: currentLayout, heights: currentHeights, onLayoutChange: apply } = latest.current
        const next = settle(currentLayout, currentHeights, run.id, run.cell)
        // The window is drawn in its new place and kept out of sight until the copy arrives.
        setLandingId(run.id)
        landingRef.current = {
          id: run.id,
          lift: run.lift,
          from: run.origin,
          // If nothing changes (so there is nowhere to land) the copy still has to go.
          timer: window.setTimeout(() => settleLanding(), 700),
        }
        apply(next)
        setAnnouncement(`${itemById(run.id).title} moved.`)
        return
      }
      // Cancelled, or not moved far enough to count: the copy settles back where it came from.
      if (run.lift) flyLift(run.lift, run.origin, () => run.lift?.remove(), reduceMotion)
    }

    const onMove = (event: globalThis.PointerEvent) => {
      const run = runRef.current
      if (!run || event.pointerId !== run.pointerId) return
      if (event.pointerType === 'mouse' && event.buttons === 0) {
        finish(true)
        return
      }
      const x = event.clientX
      const y = event.clientY
      if (!run.moved) {
        if (Math.hypot(x - run.start.x, y - run.start.y) <= DRAG_THRESHOLD_PX) return
        run.moved = true
        const source = itemRefs.current[run.id]?.querySelector<HTMLElement>('.gw__emerge')
        run.lift = source ? makeLift(source, run.origin) : null
        document.body.classList.add('gw-dragging')
        setLifted(true)
      }
      if (run.lift) moveLift(run.lift, x - run.grab.dx, y - run.grab.dy)
      run.last = { x, y }
      // A window that was a tool can be carried back over the toolbar, which lights up as a place it can go.
      const bar = itemById(run.id).tool ? shelf?.current?.rect() : null
      const over = !!bar && x > bar.left - 16 && x < bar.right + 16 && y > bar.top - 16 && y < bar.bottom + 16
      if (over !== run.overShelf) {
        run.overShelf = over
        setOverShelf(over)
        shelf?.current?.setTarget(over)
      }
      const next = cellAt(run, x, y)
      if (next.col === run.cell.col && next.row === run.cell.row) return
      run.cell = next
      setCell(next)
    }
    const onUp = (event: globalThis.PointerEvent) => {
      if (event.pointerId === runRef.current?.pointerId) finish(true)
    }
    const onCancel = (event: globalThis.PointerEvent) => {
      if (event.pointerId === runRef.current?.pointerId) finish(false)
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') finish(false)
    }
    const onAbort = () => finish(false)

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('blur', onAbort)
    window.addEventListener('contextmenu', onAbort)
    return () => {
      document.body.classList.remove('gw-dragging')
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('blur', onAbort)
      window.removeEventListener('contextmenu', onAbort)
    }
    // cellAt only reads refs and props that do not change during a drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragId])

  // The copy has been let go over a spot: it flies to the window's new place, then the real one is shown.
  function settleLanding() {
    const landing = landingRef.current
    if (!landing) return
    landingRef.current = null
    window.clearTimeout(landing.timer)
    const to = rectOf(landing.id) ?? landing.from
    flyLift(
      landing.lift,
      to,
      () => {
        landing.lift.remove()
        setLandingId(null)
      },
      reduceMotion,
    )
  }

  // Runs when the arrangement changes, which is when the dropped window has its new place.
  useLayoutEffect(() => {
    if (landingRef.current) settleLanding()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeKey])

  useEffect(
    () => () => {
      const landing = landingRef.current
      if (landing) {
        window.clearTimeout(landing.timer)
        landing.lift.remove()
      }
      runRef.current?.lift?.remove()
    },
    [],
  )

  const beginResize = (event: PointerEvent<HTMLElement>, item: WorkspaceItem) => {
    if (event.button !== 0 || runRef.current || resizeRef.current) return
    event.preventDefault()
    const placement = layoutRef.current.find((p) => p.id === item.id)!
    resizeRef.current = { id: item.id, pointerId: event.pointerId, startValue: placement.w, lastValue: placement.w }
    setResizingId(item.id)
  }

  // Like a move, a resize is tracked on the window so it always ends: on release anywhere, and it is undone on
  // Escape, window blur, right-click or pointer cancel. The width changes live as the pointer crosses a column.
  useEffect(() => {
    if (!resizingId) return

    const finish = (keep: boolean) => {
      const current = resizeRef.current
      if (current) {
        const item = itemById(current.id)
        if (!keep && current.lastValue !== current.startValue) latest.current.onResize?.(current.id, current.startValue)
        else if (keep && current.lastValue !== current.startValue) setAnnouncement(`${item.title} is now ${widthLabel(current.lastValue)}.`)
      }
      resizeRef.current = null
      setResizingId(null)
    }

    const onMove = (event: globalThis.PointerEvent) => {
      const current = resizeRef.current
      if (!current || event.pointerId !== current.pointerId) return
      if (event.pointerType === 'mouse' && event.buttons === 0) {
        finish(true)
        return
      }
      const item = itemById(current.id)
      const placement = layoutRef.current.find((p) => p.id === current.id)!
      const box = gridRef.current!.getBoundingClientRect()
      const value = Math.max(item.minCols, spanFromPoint(event.clientX, box, placement.col))
      if (value === current.lastValue) return
      current.lastValue = value
      latest.current.onResize?.(current.id, value)
    }
    const onUp = (event: globalThis.PointerEvent) => {
      if (event.pointerId === resizeRef.current?.pointerId) finish(true)
    }
    const onCancel = (event: globalThis.PointerEvent) => {
      if (event.pointerId === resizeRef.current?.pointerId) finish(false)
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') finish(false)
    }
    const onAbort = () => finish(false)

    document.body.classList.add('gw-resizing')
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('blur', onAbort)
    window.addEventListener('contextmenu', onAbort)
    return () => {
      document.body.classList.remove('gw-resizing')
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('blur', onAbort)
      window.removeEventListener('contextmenu', onAbort)
    }
    // itemById only reads props that do not change during a resize.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizingId])

  // Left and right change a window by a column; Home and End go to the narrowest and the full width.
  const onResizeKeyDown = (event: KeyboardEvent<HTMLElement>, item: WorkspaceItem, now: number) => {
    const target =
      event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? now - 1
      : event.key === 'ArrowRight' || event.key === 'ArrowUp' ? now + 1
      : event.key === 'Home' ? item.minCols
      : event.key === 'End' ? COLS
      : null
    if (target === null) return
    event.preventDefault()
    const next = clamp(target, item.minCols, COLS)
    if (next === now) return
    onResize?.(item.id, next)
    setAnnouncement(`${item.title} is now ${widthLabel(next)}.`)
  }

  const onHandleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, id: string) => {
    const move = KEY_MOVES[event.key]
    if (!move) return
    event.preventDefault()
    onLayoutChange(compact(moveByKey(resolved, heights, id, move), heights, id))
    setAnnouncement(`${itemById(id).title} moved ${move}.`)
  }

  const totalRows = bottomRow(resolved, heights) + SPARE_ROWS
  const stacked = width !== null && !wide

  // One root element throughout, so the width keeps being watched as the workspace changes between stacked and arranged.
  return (
    <div ref={rootRef} className={stacked ? 'gw gw--stacked' : 'gw'}>
      {/* Too narrow to share a row: everything stacks in reading order and cannot be moved. */}
      {stacked &&
        items.map((item) => (
          <div key={item.id} className="gw__stack-item">
            <Emerge className="gw__emerge" delay={item.delay} distance={item.distance}>
              {item.node}
            </Emerge>
          </div>
        ))}

      {wide && (
        <div
          ref={gridRef}
          className="gw__grid"
          style={{
            gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${totalRows}, ${ROW_PX}px)`,
          }}
        >
          {items.map((item) => {
            const placement = resolved.find((p) => p.id === item.id)
            if (!placement) return null
            const landing = landingId === item.id
            // The landing window is drawn in its final place and kept out of sight until the lifted copy arrives, so it
            // never flies from where it came from while the copy flies to where it is going.
            const glide = !reduceMotion && !landing
            return (
              <motion.div
                key={item.id}
                ref={(element) => {
                  itemRefs.current[item.id] = element
                }}
                layout={glide ? 'position' : false}
                layoutDependency={placeKey}
                transition={SPRING}
                data-id={item.id}
                data-dragging={(lifted && dragId === item.id) || undefined}
                data-landing={landing || undefined}
                data-resizing={resizingId === item.id || undefined}
                className="gw__item"
                style={{
                  gridColumn: `${placement.col + 1} / span ${placement.w}`,
                  gridRow: `${placement.row + 1} / span ${heights[item.id] ?? 24}`,
                }}
              >
                <div className="gw__content">
                  <Emerge className="gw__emerge" delay={item.delay} distance={item.distance}>
                    {item.node}
                  </Emerge>
                  <button
                    type="button"
                    className="gw__handle"
                    aria-label={`Move ${item.title}. Drag, or use the arrow keys.`}
                    onPointerDown={(event) => beginDrag(event, item.id)}
                    onKeyDown={(event) => onHandleKeyDown(event, item.id)}
                  >
                    <GripHorizontalIcon size={16} aria-hidden="true" />
                  </button>
                  <div
                    className="gw__resize"
                    role="slider"
                    tabIndex={0}
                    aria-label={`Resize ${item.title}`}
                    aria-orientation="horizontal"
                    aria-valuemin={item.minCols}
                    aria-valuemax={COLS}
                    aria-valuenow={placement.w}
                    aria-valuetext={widthLabel(placement.w)}
                    onPointerDown={(event) => beginResize(event, item)}
                    onKeyDown={(event) => onResizeKeyDown(event, item, placement.w)}
                  >
                    <GripVerticalIcon size={14} aria-hidden="true" />
                  </div>
                </div>
              </motion.div>
            )
          })}

          {/* Where the carried window will land: outlined in the grid, moving between spots on a spring. */}
          {preview && lifted && !overShelf && width !== null && (
            <DropOutline placement={preview} width={width} height={runRef.current?.origin.height} reduceMotion={reduceMotion} />
          )}
          {/* Where a tool carried out of the toolbar will land. */}
          {incomingPlacement && incoming && width !== null && (
            <DropOutline placement={incomingPlacement} width={width} height={incoming.heightPx} reduceMotion={reduceMotion} />
          )}
        </div>
      )}

      <div className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </div>
    </div>
  )
}

function DropOutline({ placement, width, height, reduceMotion }: { placement: Placement; width: number; height?: number; reduceMotion: boolean }) {
  // The outline is as wide as the window's columns and as tall as the window.
  const box = boxForPlacement(placement, width, height ? { w: Infinity, h: height } : undefined)
  const target = { left: box.left, top: box.top, width: box.width, height: box.height ?? undefined }
  return (
    <motion.div
      className="gw__drop"
      aria-hidden="true"
      initial={{ ...target, opacity: 0 }}
      animate={{ ...target, opacity: 1 }}
      transition={reduceMotion ? { duration: 0 } : SPRING_SOFT}
    />
  )
}
