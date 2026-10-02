import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import type { Icon } from '@solar-icons/react/lib/types'
import { GripHorizontalIcon } from '@solar-icons/react/linear'
import {
  CELL_GAP_PX,
  CELL_PX,
  boxForPlacement,
  COLS,
  ROWS_PER_CELL,
  ROW_PX,
  bottomRow,
  cellFromPoint,
  columnsForWidth,
  compact,
  moveByKey,
  reflow,
  rowsForHeight,
  settle,
  type Heights,
  type KeyMove,
  type Placement,
} from '../lib/gridLayout.ts'
import Emerge from './Emerge.tsx'
import './GridWorkspace.css'

export type WorkspaceItem = {
  id: string
  title: string
  icon: Icon
  // Width in grid columns (out of 12).
  w: number
  node: ReactNode
  // How the item first appears (see Emerge).
  delay?: number
  distance?: number
  // Fills its columns without being measured for them, as a canvas does. Other items are given just
  // enough whole columns for their contents.
  fill?: boolean
  // Corner radius, so the drop outline matches the item it stands in for.
  radius?: string
}

type Props = {
  // Items in the order they stack on a narrow screen.
  items: WorkspaceItem[]
  layout: Placement[]
  onLayoutChange: (next: Placement[]) => void
}

// Below this width the items would be too narrow for the components, so items stack and cannot be moved.
const MIN_GRID_WIDTH = 940
// Empty rows kept beneath the last item, so there is always room to drop something below.
const SPARE_ROWS = 26
// A press that moves less than this is a click, not a drag.
const DRAG_THRESHOLD_PX = 6
const GHOST_SIZE = 56
// How long a component takes to glide to its new place, in milliseconds.
const MOVE_DURATION_MS = 650
const MOVE_EASING = 'cubic-bezier(0.16, 1, 0.3, 1)'

type DragState = {
  id: string
  pointerId: number
  cell: { col: number; row: number }
  start: { x: number; y: number }
  moved: boolean
}

const KEY_MOVES: Record<string, KeyMove> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
}

// A 24-column grid whose items can be dragged anywhere. While dragging, a grey box with the item's icon
// follows the pointer and a dashed outline shows where it will land. The real component then animates to
// its new position when dropped.
export default function GridWorkspace({ items, layout, onLayoutChange }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const ghostRef = useRef<HTMLDivElement | null>(null)
  const pointerRef = useRef({ x: 0, y: 0 })
  // Where each item was last drawn, so a move can be animated from the old spot to the new one.
  const lastDrawn = useRef<Record<string, { col: number; row: number; x: number; y: number }>>({})
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const [width, setWidth] = useState<number | null>(null)
  const [heights, setHeights] = useState<Heights>({})
  const [sizesPx, setSizesPx] = useState<Record<string, { w: number; h: number }>>({})
  const [ready, setReady] = useState(false)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [announcement, setAnnouncement] = useState('')

  const wide = width !== null && width >= MIN_GRID_WIDTH
  const itemIds = items.map((item) => item.id).join(',')

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    setWidth(root.getBoundingClientRect().width)
    // Column counts depend on the width and are recalculated a frame after it changes. In that frame a pill can
    // be a little too narrow for its tools; the toolbar's min-width keeps its contents inside it until the
    // new column count arrives.
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(root)
    return () => observer.disconnect()
  }, [])

  // Measure every item: its height, and how wide its contents want to be. The grid turns those into rows
  // and columns. The width is the natural width of the tools (marked data-intrinsic), not the item's own
  // width, because an item always fills the columns it is given.
  useEffect(() => {
    if (!wide) return
    const naturalWidth = (item: HTMLElement) => {
      const parts = Array.from(item.querySelectorAll<HTMLElement>('[data-intrinsic]'))
      const frameOwner = parts[0]?.parentElement
      if (!frameOwner) return item.offsetWidth
      const px = (value: string) => parseFloat(value) || 0
      const frame = getComputedStyle(frameOwner)
      let total = px(frame.paddingLeft) + px(frame.paddingRight) + px(frame.borderLeftWidth) + px(frame.borderRightWidth)
      for (const part of parts) {
        const style = getComputedStyle(part)
        total += part.offsetWidth + px(style.marginLeft) + px(style.marginRight)
      }
      return total
    }

    const observer = new ResizeObserver((entries) => {
      const touched = new Set<HTMLElement>()
      for (const entry of entries) {
        const item = (entry.target as HTMLElement).closest<HTMLElement>('.gw__item')
        if (item?.dataset.id) touched.add(item)
      }
      setSizesPx((current) => {
        const next = { ...current }
        let changed = false
        for (const item of touched) {
          const id = item.dataset.id!
          const size = { w: naturalWidth(item), h: item.offsetHeight }
          if (next[id]?.w !== size.w || next[id]?.h !== size.h) {
            next[id] = size
            changed = true
          }
        }
        return changed ? next : current
      })
      setHeights((current) => {
        const next = { ...current }
        let changed = false
        for (const item of touched) {
          const id = item.dataset.id!
          const rows = rowsForHeight(item.offsetHeight)
          if (next[id] !== rows) {
            next[id] = rows
            changed = true
          }
        }
        return changed ? next : current
      })
    })

    for (const id of Object.keys(itemRefs.current)) {
      const element = itemRefs.current[id]
      if (!element) continue
      observer.observe(element)
      for (const part of element.querySelectorAll('[data-intrinsic]')) observer.observe(part)
    }
    return () => observer.disconnect()
  }, [wide, itemIds])

  // Animate moves only after the first measurement, so items do not slide into place on load.
  useEffect(() => {
    if (!wide || ready || Object.keys(heights).length < items.length) return
    const frame = requestAnimationFrame(() => setReady(true))
    return () => cancelAnimationFrame(frame)
  }, [wide, ready, heights, items.length])

  // Items that hug their content take as many columns as that content needs. Items that fill (a canvas) keep theirs.
  const layoutW = useMemo(
    () =>
      layout.map((p) => {
        const item = items.find((candidate) => candidate.id === p.id)
        const px = sizesPx[p.id]?.w
        if (!item || item.fill || !px || !width) return p
        return { ...p, w: columnsForWidth(px, width) }
      }),
    [layout, items, sizesPx, width],
  )

  const resolved = useMemo(() => reflow(layoutW, heights), [layoutW, heights])

  // Animate any item whose place changed (a drop, a push from another item, Reset layout) from where it
  // was to where it is now. Runs after the DOM has updated and before the browser paints.
  useLayoutEffect(() => {
    if (!wide) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    for (const placement of resolved) {
      const element = itemRefs.current[placement.id]
      if (!element) continue
      const now = { col: placement.col, row: placement.row, x: element.offsetLeft, y: element.offsetTop }
      const before = lastDrawn.current[placement.id]
      const moved = before && (before.col !== now.col || before.row !== now.row)
      if (ready && moved && !reduceMotion) {
        const dx = before.x - now.x
        const dy = before.y - now.y
        if (dx !== 0 || dy !== 0) {
          element.getAnimations().forEach((animation) => animation.cancel())
          element.animate(
            [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
            { duration: MOVE_DURATION_MS, easing: MOVE_EASING },
          )
        }
      }
      lastDrawn.current[placement.id] = now
    }
  })

  const itemById = (id: string) => items.find((item) => item.id === id)!

  const candidate = useMemo(() => {
    if (!drag) return null
    return settle(resolved, heights, drag.id, drag.cell)
  }, [drag, resolved, heights])
  const preview = drag && candidate ? candidate.find((p) => p.id === drag.id)! : null

  // The ghost follows the pointer by writing its transform directly, so moving it never re-renders the grid.
  const positionGhost = (x: number, y: number) => {
    pointerRef.current = { x, y }
    const ghost = ghostRef.current
    if (ghost) ghost.style.transform = `translate(${x - GHOST_SIZE / 2}px, ${y - GHOST_SIZE / 2}px)`
  }

  const cellAt = (point: { x: number; y: number }, id: string) => {
    const box = gridRef.current!.getBoundingClientRect()
    return cellFromPoint(point, box, layoutRef.current.find((p) => p.id === id)?.w ?? itemById(id).w)
  }

  const beginDrag = (event: PointerEvent<HTMLButtonElement>, id: string) => {
    if (event.button !== 0 || dragRef.current) return
    event.preventDefault()
    const point = { x: event.clientX, y: event.clientY }
    pointerRef.current = point
    const next: DragState = { id, pointerId: event.pointerId, cell: cellAt(point, id), start: point, moved: false }
    dragRef.current = next
    setDrag(next)
  }

  // The latest state, readable from window listeners without going stale.
  const dragRef = useRef<DragState | null>(null)
  const layoutRef = useRef(resolved)
  const latest = useRef({ layout: resolved, heights, onLayoutChange })
  useLayoutEffect(() => {
    layoutRef.current = resolved
    latest.current = { layout: resolved, heights, onLayoutChange }
  })

  const dragId = drag?.id ?? null

  // A drag is tracked on the window, not on the grip, so it always ends: on release anywhere (even outside
  // the page), if the button is already up when the pointer next moves, on cancel, right-click, blur or Escape.
  useEffect(() => {
    if (!dragId) return

    const finish = (commit: boolean) => {
      const current = dragRef.current
      const { layout: currentLayout, heights: currentHeights, onLayoutChange: apply } = latest.current
      if (current && commit && current.moved) {
        apply(settle(currentLayout, currentHeights, current.id, current.cell))
        setAnnouncement(`${itemById(current.id).title} moved.`)
      }
      dragRef.current = null
      setDrag(null)
    }

    const onMove = (event: globalThis.PointerEvent) => {
      const current = dragRef.current
      if (!current || event.pointerId !== current.pointerId) return
      if (event.pointerType === 'mouse' && event.buttons === 0) {
        finish(true)
        return
      }
      const point = { x: event.clientX, y: event.clientY }
      positionGhost(point.x, point.y)
      const cell = cellAt(point, current.id)
      const moved = current.moved || Math.hypot(point.x - current.start.x, point.y - current.start.y) > DRAG_THRESHOLD_PX
      if (moved === current.moved && cell.col === current.cell.col && cell.row === current.cell.row) return
      const next = { ...current, cell, moved }
      dragRef.current = next
      setDrag(next)
    }
    const onUp = (event: globalThis.PointerEvent) => {
      if (event.pointerId === dragRef.current?.pointerId) finish(true)
    }
    const onCancel = (event: globalThis.PointerEvent) => {
      if (event.pointerId === dragRef.current?.pointerId) finish(false)
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') finish(false)
    }
    const onAbort = () => finish(false)

    document.body.classList.add('gw-dragging')
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
    // positionGhost, cellAt and itemById only read refs and props that do not change during a drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragId])

  const onHandleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, id: string) => {
    const move = KEY_MOVES[event.key]
    if (!move) return
    event.preventDefault()
    onLayoutChange(compact(moveByKey(resolved, heights, id, move), heights, id))
    setAnnouncement(`${itemById(id).title} moved ${move}.`)
  }

  if (width === null) return <div ref={rootRef} className="gw" />

  if (!wide) {
    return (
      <div ref={rootRef} className="gw gw--stacked">
        {items.map((item) => (
          <Emerge key={item.id} delay={item.delay} distance={item.distance}>
            {item.node}
          </Emerge>
        ))}
      </div>
    )
  }

  const totalRows = bottomRow(resolved, heights) + SPARE_ROWS
  const guideRows = Math.ceil(totalRows / ROWS_PER_CELL)
  const GhostIcon = drag ? itemById(drag.id).icon : null

  return (
    <div ref={rootRef} className="gw">
      <div
        ref={gridRef}
        className="gw__grid"
        data-dragging={drag?.moved ? 'true' : undefined}
        style={{
          gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${totalRows}, ${ROW_PX}px)`,
        }}
      >
        {/* The grid, columns and rows, only while something is being dragged. */}
        {drag?.moved && (
          <div
            className="gw__guides"
            aria-hidden="true"
            style={{
              gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${guideRows}, ${CELL_PX - CELL_GAP_PX}px)`,
            }}
          >
            {Array.from({ length: COLS * guideRows }, (_, index) => (
              <span key={index} className="gw__guide" />
            ))}
          </div>
        )}

        {items.map((item) => {
          const placement = resolved.find((p) => p.id === item.id)!
          const dragging = drag?.id === item.id && drag.moved
          return (
            <div
              key={item.id}
              ref={(element) => {
                itemRefs.current[item.id] = element
              }}
              data-id={item.id}
              data-dragging={dragging}
              className="gw__item"
              style={{
                gridColumn: `${placement.col + 1} / span ${placement.w}`,
                gridRow: `${placement.row + 1} / span ${heights[item.id] ?? 24}`,
              }}
            >
              <div className="gw__content">
                <Emerge delay={item.delay} distance={item.distance}>
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
              </div>
            </div>
          )
        })}

        {preview && drag?.moved && width !== null && (
          <div
            className="gw__drop"
            aria-hidden="true"
            style={(() => {
              const dragged = itemById(drag.id)
              const measured = sizesPx[drag.id]
              // Every item fills its columns, so the outline is as wide as its columns and as tall as its content.
              const box = boxForPlacement(preview, width, measured ? { w: Infinity, h: measured.h } : undefined)
              return {
                left: box.left,
                top: box.top,
                width: box.width,
                height: box.height ?? undefined,
                borderRadius: dragged.radius,
              }
            })()}
          />
        )}
      </div>

      {drag?.moved &&
        GhostIcon &&
        createPortal(
          <div
            ref={(element) => {
              ghostRef.current = element
              if (element) positionGhost(pointerRef.current.x, pointerRef.current.y)
            }}
            className="gw__ghost"
            aria-hidden="true"
          >
            <GhostIcon size={24} />
          </div>,
          document.body,
        )}

      <div className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </div>
    </div>
  )
}
