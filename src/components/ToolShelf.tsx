import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import type { Icon } from '@solar-icons/react/lib/types'
import { fadeLift, flyLift, makeLift, moveLift, toRect, type Rect } from '../lib/lift.ts'
import './ToolShelf.css'

export type ShelfTool = {
  id: string
  title: string
  // One line on why the tool is on screen (manifesto principle 3). Shown from the tool's icon.
  reason: string
  icon: Icon
  node: ReactNode
}

// What the workspace can ask of the toolbar while a window is carried towards it.
export type ShelfHandle = {
  rect: () => DOMRect | null
  // The tool a carried window would go before if let go at this point, or null for the end.
  beforeAt: (x: number, y: number) => string | null
  // Lights the bar up as a place the window can be dropped.
  setTarget: (active: boolean) => void
}

// Where a tool dragged out of the toolbar is: the top-left of its carried copy, in the page.
export type Outside = { id: string; left: number; top: number }

type Props = {
  // The tools that are in the toolbar, left to right.
  tools: ShelfTool[]
  // A tool goes before another, or at the end when `before` is null.
  onMove: (id: string, before: string | null) => void
  // A tool is being carried below the bar (and so will become a window if let go there), or is back in it (null).
  onOutside: (outside: Outside | null) => void
  // A tool was let go below the bar: it becomes a window where its copy is.
  onExpand: (outside: Outside) => void
  // The workspace's handle on the bar, for a window carried back towards it.
  controlRef: RefObject<ShelfHandle | null>
  // The button that adds and removes tools.
  add: ReactNode
}

const DRAG_THRESHOLD_PX = 6
// How far below the bar a tool must be carried before it is on its way to becoming a window.
const PULL_OUT_PX = 24
// Springs with no bounce: things arrive and stop, as they do on an Apple device.
const SPRING = { type: 'spring', stiffness: 420, damping: 40, mass: 0.9 } as const

type Run = {
  id: string
  pointerId: number
  start: { x: number; y: number }
  grab: { dx: number; dy: number }
  origin: Rect
  moved: boolean
  lift: HTMLDivElement | null
  // The order as it would be if the tool were dropped now.
  draft: string[]
  // Carried below the bar, so it would become a window.
  outside: boolean
}

// The toolbar under the header: one bar, always in the same place, with one segment per tool and a divider between
// segments. The founder chooses which tools are in it and in what order. Drag a tool by its icon to move it: a lifted
// copy follows the pointer and the others make room as it passes. The arrow keys move a focused icon one place.
export default function ToolShelf({ tools, onMove, onOutside, onExpand, controlRef, add }: Props) {
  const reduceMotion = useReducedMotion() ?? false
  const tipId = useId()
  const shelfRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef(new Map<string, HTMLDivElement>())
  const runRef = useRef<Run | null>(null)
  const landingRef = useRef<{ lift: HTMLDivElement; id: string; from: Rect } | null>(null)
  const committed = tools.map((tool) => tool.id)
  const latest = useRef({ committed, onMove, onOutside, onExpand })
  useLayoutEffect(() => {
    latest.current = { committed, onMove, onOutside, onExpand }
  })
  const [target, setTarget] = useState(false)

  // Where a carried tool or window would go among the tools: before every tool that is below or to the right of the point.
  const placeBefore = (ids: string[], x: number, y: number) =>
    ids.find((id) => {
      const r = itemRefs.current.get(id)?.getBoundingClientRect()
      return r ? !(y > r.bottom || (y >= r.top && x > r.left + r.width / 2)) : false
    }) ?? null

  useLayoutEffect(() => {
    controlRef.current = {
      rect: () => shelfRef.current?.getBoundingClientRect() ?? null,
      beforeAt: (x, y) => placeBefore(latest.current.committed, x, y),
      setTarget,
    }
    return () => {
      controlRef.current = null
    }
    // placeBefore only reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlRef])

  const [dragId, setDragId] = useState<string | null>(null)
  const [lifted, setLifted] = useState(false)
  const [draft, setDraft] = useState<string[] | null>(null)
  const [landingId, setLandingId] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')

  const byId = new Map(tools.map((tool) => [tool.id, tool]))
  const order = (draft ?? committed).filter((id) => byId.has(id))
  const titleOf = (id: string) => byId.get(id)?.title ?? 'Tool'

  const bodyRect = (id: string): Rect | null => {
    const body = itemRefs.current.get(id)?.querySelector<HTMLElement>('.shelf__body')
    return body ? toRect(body.getBoundingClientRect()) : null
  }

  const beginDrag = (event: PointerEvent<HTMLElement>, id: string) => {
    if (event.button !== 0 || runRef.current || landingRef.current) return
    const origin = bodyRect(id)
    if (!origin) return
    event.preventDefault()
    runRef.current = {
      id,
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      grab: { dx: event.clientX - origin.left, dy: event.clientY - origin.top },
      origin,
      moved: false,
      lift: null,
      draft: [...latest.current.committed],
      outside: false,
    }
    setDragId(id)
  }

  // Where the tool would go if let go at this point: after every tool that is above the pointer, or on the pointer's row
  // and to its left.
  const draftAt = (run: Run, x: number, y: number) => {
    const others = run.draft.filter((id) => id !== run.id)
    const before = others.filter((id) => {
      const r = itemRefs.current.get(id)?.getBoundingClientRect()
      if (!r) return false
      return y > r.bottom || (y >= r.top && x > r.left + r.width / 2)
    })
    const index = before.length
    return [...others.slice(0, index), run.id, ...others.slice(index)]
  }

  // A drag is tracked on the window, not on the icon, so it always ends: on release anywhere, if the button is already up
  // when the pointer next moves, on cancel, right-click, blur or Escape.
  useEffect(() => {
    if (!dragId) return

    const finish = (commit: boolean) => {
      const run = runRef.current
      runRef.current = null
      setDragId(null)
      setLifted(false)
      if (!run) return
      const { onOutside: outsideChanged, onExpand: expand, onMove: move } = latest.current
      // Let go below the bar: the tool becomes a window where its copy is. The copy grows and fades as the window arrives.
      if (run.moved && commit && run.outside && run.lift) {
        const box = run.lift.getBoundingClientRect()
        expand({ id: run.id, left: box.left, top: box.top })
        setAnnouncement(`${titleOf(run.id)} is now a window.`)
        setDraft(null)
        fadeLift(run.lift, reduceMotion)
        return
      }
      outsideChanged(null)
      const changed = run.draft.join() !== latest.current.committed.join()
      if (run.moved && commit && run.lift && changed) {
        const at = run.draft.indexOf(run.id)
        move(run.id, run.draft[at + 1] ?? null)
        setLandingId(run.id)
        landingRef.current = { lift: run.lift, id: run.id, from: run.origin }
        setAnnouncement(`${titleOf(run.id)} moved.`)
        // The tool is already in its new place, since the others made room as it went. The copy settles onto it.
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const landing = landingRef.current
            if (!landing) return
            landingRef.current = null
            flyLift(
              landing.lift,
              bodyRect(landing.id) ?? landing.from,
              () => {
                landing.lift.remove()
                setLandingId(null)
              },
              reduceMotion,
            )
          }),
        )
        setDraft(null)
        return
      }
      // Cancelled, or not moved, or dropped where it was: the copy settles back.
      setDraft(null)
      if (run.lift) flyLift(run.lift, run.origin, () => run.lift?.remove(), reduceMotion)
    }

    const onMove = (event: globalThis.PointerEvent) => {
      const run = runRef.current
      if (!run || event.pointerId !== run.pointerId) return
      if (event.pointerType === 'mouse' && event.buttons === 0) {
        finish(true)
        return
      }
      const { clientX: x, clientY: y } = event
      if (!run.moved) {
        if (Math.hypot(x - run.start.x, y - run.start.y) <= DRAG_THRESHOLD_PX) return
        run.moved = true
        const source = itemRefs.current.get(run.id)?.querySelector<HTMLElement>('.shelf__body')
        run.lift = source ? makeLift(source, run.origin, 'var(--radius-pill)', 'shelf__lift') : null
        document.body.classList.add('shelf-dragging')
        setLifted(true)
      }
      if (run.lift) moveLift(run.lift, x - run.grab.dx, y - run.grab.dy)
      // Carried below the bar, the tool leaves it (the others close the gap) and the workspace is told where the window
      // would land. Carried back up, it goes back in.
      const bar = shelfRef.current?.getBoundingClientRect()
      const outside = !!bar && y > bar.bottom + PULL_OUT_PX
      if (outside !== run.outside) {
        run.outside = outside
        if (!outside) latest.current.onOutside(null)
      }
      if (outside) {
        const without = latest.current.committed.filter((other) => other !== run.id)
        if (run.draft.join() !== without.join()) {
          run.draft = without
          setDraft(without)
        }
        latest.current.onOutside({ id: run.id, left: x - run.grab.dx, top: y - run.grab.dy })
        return
      }
      const next = draftAt(run, x, y)
      if (next.join() !== run.draft.join()) {
        run.draft = next
        setDraft(next)
      }
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
      document.body.classList.remove('shelf-dragging')
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('blur', onAbort)
      window.removeEventListener('contextmenu', onAbort)
    }
    // draftAt and titleOf only read refs and props that do not change during a drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragId])

  useEffect(
    () => () => {
      landingRef.current?.lift.remove()
      runRef.current?.lift?.remove()
    },
    [],
  )

  // Left and right move a tool one place.
  const onGripKeyDown = (event: KeyboardEvent<HTMLElement>, id: string) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const at = committed.indexOf(id)
    const target = event.key === 'ArrowLeft' ? at - 1 : at + 1
    if (target < 0 || target >= committed.length) {
      setAnnouncement(`${titleOf(id)} cannot move further ${event.key === 'ArrowLeft' ? 'left' : 'right'}.`)
      return
    }
    onMove(id, event.key === 'ArrowLeft' ? committed[at - 1] : (committed[at + 2] ?? null))
    setAnnouncement(`${titleOf(id)} moved ${event.key === 'ArrowLeft' ? 'left' : 'right'}.`)
  }

  return (
    <div ref={shelfRef} className="shelf" data-target={target || undefined} role="toolbar" aria-label="Tools">
      {order.map((id) => {
        const tool = byId.get(id)!
        const Icon = tool.icon
        const landing = landingId === id
        const glide = !reduceMotion
        return (
          <motion.div
            key={id}
            ref={(element) => {
              if (element) itemRefs.current.set(id, element)
              else itemRefs.current.delete(id)
            }}
            layout={glide ? 'position' : false}
            layoutDependency={order.join()}
            transition={SPRING}
            className="shelf__tool"
            data-id={id}
            data-dragging={(lifted && dragId === id) || undefined}
            data-landing={landing || undefined}
          >
            <div className="shelf__body">
              <span className="reason shelf__lead">
                <button
                  type="button"
                  className="toolbar__button reason__button shelf__grip"
                  aria-label={`${tool.title}. Drag to move it, or use the left and right arrow keys.`}
                  aria-describedby={`${tipId}-${id}`}
                  onPointerDown={(event) => beginDrag(event, id)}
                  onKeyDown={(event) => onGripKeyDown(event, id)}
                >
                  <Icon size={18} aria-hidden="true" />
                </button>
                <span role="tooltip" id={`${tipId}-${id}`} className="reason__tip shelf__tip glass glass--strong">
                  <strong>{tool.title}</strong>
                  {tool.reason}
                </span>
              </span>
              {tool.node}
            </div>
          </motion.div>
        )
      })}
      <div className="shelf__add">{add}</div>
      <div className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </div>
    </div>
  )
}
