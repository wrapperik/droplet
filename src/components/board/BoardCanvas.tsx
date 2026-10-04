import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type RefObject } from 'react'
import {
  BOARD_H,
  BOARD_W,
  GRID,
  between,
  boundsOf,
  clampZoom,
  fitZoom,
  freeSpotNear,
  intersects,
  percentLabel,
  resizeRect,
  scrollAfterZoom,
  screenToBoard,
  stepZoom,
  type Point,
  type Rect,
} from '../../lib/boardGeometry.ts'
import { connectTargetAt, connectorPath, endPoints } from '../../lib/boardConnectors.ts'
import { expandWithMembers, membersOf } from '../../lib/boardFrames.ts'
import { groupFor, instantiateTemplate, originOfGroup, placeTemplate, templateById, templateOfGroup } from '../../lib/boardTemplates.ts'
import { docOf, planMove, type BoardAction, type BoardState, type Tool } from '../../lib/boardState.ts'
import {
  SIZE_LIMITS,
  isConnector,
  isFrame,
  isNode,
  isRectItem,
  rectOf,
  type BoardItem,
  type ConnectorItem,
  type FrameItem,
  type RectItem,
} from '../../lib/boardTypes.ts'
import { newId } from '../../lib/ids.ts'
import ToolWindow from '../ToolWindow.tsx'
import { ConnectorsLayer, FrameView, NoteView, ShapeView, TextLabelView, type ViewProps } from './BoardItemViews.tsx'
import SelectionBar, { type Decide } from './SelectionBar.tsx'
import './BoardCanvas.css'

// Space left around the board inside the scrolling view, so its edge can always be seen and reached.
const PAD = 56
// How far the pointer must move before a press is a drag and not a click.
const DRAG_THRESHOLD_PX = 4
// How far an arrow must be pulled before it is an arrow and not a click.
const ARROW_THRESHOLD_PX = 8
// A rectangle drawn smaller than this on both sides was a click, and gets the usual size, centred on the click.
const DRAWN_MIN = 24
// Where the zoom starts: the board is much bigger than the view, so it opens zoomed out, in the middle.
const INITIAL_ZOOM = 0.5
// Arrow keys move by a grid step, and by a bigger one with Shift.
const BIG_STEP = GRID * 5

// What the workspace can ask of the board.
export type AddKind = 'note' | 'shape' | 'text' | 'frame'
export type BoardHandle = {
  // The middle of what is in view, on the board, for putting things near where the founder is looking.
  viewMiddle: () => Point
  // A new thing in the middle of the view, in a clear place, ready to be written in. With no pointer.
  add: (kind: AddKind) => void
  // A template, in the nearest clear place to the middle of the view, with the view moved to show it.
  addTemplate: (id: string) => void
}

type Props = {
  state: BoardState
  dispatch: (action: BoardAction) => void
  reason: string
  controlRef?: RefObject<BoardHandle | null>
  // Lets a selected note, shape or text be remembered as the business name or the offer, after a confirm in the selection bar.
  decide?: Decide
}

// What is being done with the pointer right now.
type Gesture =
  | { kind: 'pan'; pointerId: number; start: Point; scroll: Point }
  | { kind: 'drag'; pointerId: number; ids: string[]; start: Point; moved: boolean; collapseTo: string | null }
  | { kind: 'resize'; pointerId: number; id: string; start: Point; size: Rect }
  | { kind: 'marquee'; pointerId: number; start: Point; startBoard: Point; additive: boolean; base: string[]; moved: boolean }
  | { kind: 'draw'; pointerId: number; start: Point; startBoard: Point; tool: 'shape' | 'text' | 'frame'; newId: string; moved: boolean }
  | { kind: 'connect'; pointerId: number; start: Point; from: string; moved: boolean }
  | { kind: 'end'; pointerId: number; id: string; end: 'from' | 'to'; start: Point; moved: boolean }

// What is shown while a gesture is under way. It is only committed when the pointer is let go, so one gesture is one undo step.
type Live =
  | { kind: 'drag'; ids: string[]; dx: number; dy: number }
  | { kind: 'resize'; id: string; w: number; h: number }
  | { kind: 'marquee'; rect: Rect }
  | { kind: 'draw'; tool: 'shape' | 'text' | 'frame'; rect: Rect }
  | { kind: 'connect'; from: string; point: Point; target: string | null }
  | { kind: 'end'; id: string; end: 'from' | 'to'; point: Point; target: string | null }

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`
const clampPoint = (point: Point): Point => ({ x: Math.min(Math.max(point.x, 0), BOARD_W), y: Math.min(Math.max(point.y, 0), BOARD_H) })
const CREATION: Tool[] = ['sticky', 'shape', 'text', 'frame']

// The board: a fixed area with a clear edge that scrolls, pans and zooms. Notes, shapes, text and frames are placed on it, moved, resized,
// written in and deleted, and joined with arrows, with the pointer or the keyboard. It never grows past its edge, and nothing can be moved
// off it.
export default function BoardCanvas({ state, dispatch, reason, controlRef, decide }: Props) {
  const { selection, tool } = state
  const items = docOf(state).items
  const viewportRef = useRef<HTMLDivElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const gestureRef = useRef<Gesture | null>(null)
  const spaceRef = useRef(false)
  const pendingScroll = useRef<Point | null>(null)
  // What the gesture shows right now, readable when it ends.
  const liveRef = useRef<Live | null>(null)

  const [zoom, setZoom] = useState(INITIAL_ZOOM)
  const [editing, setEditing] = useState<string | null>(null)
  const [live, setLive] = useState<Live | null>(null)
  const [active, setActive] = useState(false)
  const [panReady, setPanReady] = useState(false)
  const [announcement, setAnnouncement] = useState('')

  // The latest values, readable from the listeners of a gesture without going stale.
  const latest = useRef({ state, zoom, dispatch })
  useLayoutEffect(() => {
    latest.current = { state, zoom, dispatch }
  })

  const say = (text: string) => setAnnouncement(text)

  // Where the board's top-left corner is on the screen: what a point on the screen is measured from.
  const origin = (): Point => {
    const box = surfaceRef.current?.getBoundingClientRect()
    return { x: box?.left ?? 0, y: box?.top ?? 0 }
  }
  const boardPoint = (event: { clientX: number; clientY: number }): Point => screenToBoard({ x: event.clientX, y: event.clientY }, origin(), latest.current.zoom)

  // ---- Zoom and scroll ----

  // Changes the zoom, keeping the point under the cursor (or the middle of the view) where it is.
  const changeZoom = useCallback((next: number, anchorClient?: Point) => {
    const viewport = viewportRef.current
    const from = latest.current.zoom
    const to = clampZoom(next)
    if (!viewport || to === from) return
    const box = viewport.getBoundingClientRect()
    const anchor = anchorClient ? { x: anchorClient.x - box.left, y: anchorClient.y - box.top } : { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 }
    const scroll = scrollAfterZoom({ x: viewport.scrollLeft - PAD, y: viewport.scrollTop - PAD }, anchor, from, to)
    pendingScroll.current = { x: scroll.x + PAD, y: scroll.y + PAD }
    setZoom(to)
  }, [])

  // The scroll that goes with a new zoom is applied once the board has its new size.
  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const scroll = pendingScroll.current
    if (!viewport || !scroll) return
    pendingScroll.current = null
    viewport.scrollLeft = scroll.x
    viewport.scrollTop = scroll.y
  }, [zoom])

  // Opens on the middle of the board.
  useLayoutEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    viewport.scrollLeft = PAD + (BOARD_W * INITIAL_ZOOM) / 2 - viewport.clientWidth / 2
    viewport.scrollTop = PAD + (BOARD_H * INITIAL_ZOOM) / 2 - viewport.clientHeight / 2
  }, [])

  const fit = () => {
    const viewport = viewportRef.current
    if (!viewport) return
    pendingScroll.current = { x: 0, y: 0 }
    setZoom(fitZoom({ w: viewport.clientWidth - PAD * 2, h: viewport.clientHeight - PAD * 2 }))
  }

  // Moves the view to show a rectangle of the board, zooming out if it is bigger than the view. A view with no size (not measured) is left alone.
  const reveal = (rect: Rect) => {
    const viewport = viewportRef.current
    if (!viewport || viewport.clientWidth === 0 || viewport.clientHeight === 0) return
    const from = latest.current.zoom
    const fits = Math.min((viewport.clientWidth * 0.92) / rect.w, (viewport.clientHeight * 0.92) / rect.h)
    const to = fits < from ? clampZoom(fits) : from
    pendingScroll.current = {
      x: PAD + (rect.x + rect.w / 2) * to - viewport.clientWidth / 2,
      y: PAD + (rect.y + rect.h / 2) * to - viewport.clientHeight / 2,
    }
    if (to !== from) setZoom(to)
    else {
      viewport.scrollLeft = pendingScroll.current.x
      viewport.scrollTop = pendingScroll.current.y
      pendingScroll.current = null
    }
  }

  // Ctrl or Cmd with the wheel (and a pinch on a trackpad) zooms around the cursor. A plain wheel scrolls.
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const onWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return
      event.preventDefault()
      changeZoom(latest.current.zoom * Math.exp(-event.deltaY * 0.0025), { x: event.clientX, y: event.clientY })
    }
    viewport.addEventListener('wheel', onWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', onWheel)
  }, [changeZoom])

  // ---- Adding things ----

  // Puts a new thing on the board, then puts the tool down and starts writing in it (a frame has its title written).
  const place = (kind: AddKind, where: { at: Point } | { rect: Rect }, id = newId()) => {
    const base = { id, ...where }
    if (kind === 'note') dispatch({ type: 'add_note', ...base })
    else if (kind === 'shape') dispatch({ type: 'add_shape', ...base })
    else if (kind === 'text') dispatch({ type: 'add_text', ...base })
    else dispatch({ type: 'add_frame', ...base })
    dispatch({ type: 'set_tool', tool: 'select' })
    setEditing(id)
    say(kind === 'frame' ? 'Added a frame. Type its title.' : `Added ${kind === 'note' ? 'a note' : kind === 'shape' ? 'a shape' : 'text'}. Type to write in it.`)
  }

  useLayoutEffect(() => {
    if (!controlRef) return
    controlRef.current = {
      viewMiddle: () => {
        const viewport = viewportRef.current
        const z = latest.current.zoom
        return viewport
          ? { x: Math.round(Math.min(Math.max((viewport.scrollLeft + viewport.clientWidth / 2 - PAD) / z, 0), BOARD_W)), y: Math.round(Math.min(Math.max((viewport.scrollTop + viewport.clientHeight / 2 - PAD) / z, 0), BOARD_H)) }
          : { x: BOARD_W / 2, y: BOARD_H / 2 }
      },
      add: (kind) => {
        const viewport = viewportRef.current
        const { zoom: z, state: current } = latest.current
        const middle: Point = viewport
          ? { x: (viewport.scrollLeft + viewport.clientWidth / 2 - PAD) / z, y: (viewport.scrollTop + viewport.clientHeight / 2 - PAD) / z }
          : { x: BOARD_W / 2, y: BOARD_H / 2 }
        const size = SIZE_LIMITS[kind].start
        place(kind, { rect: freeSpotNear(middle, size, docOf(current).items.filter(isRectItem).map(rectOf)) })
      },
      addTemplate: (id) => {
        const template = templateById(id)
        const viewport = viewportRef.current
        if (!template) return
        const { zoom: z, state: current } = latest.current
        const middle: Point = viewport
          ? { x: (viewport.scrollLeft + viewport.clientWidth / 2 - PAD) / z, y: (viewport.scrollTop + viewport.clientHeight / 2 - PAD) / z }
          : { x: BOARD_W / 2, y: BOARD_H / 2 }
        const { origin, clear } = placeTemplate(template, docOf(current).items, middle)
        latest.current.dispatch({ type: 'add_items', items: instantiateTemplate(template, origin, newId, groupFor(template.id, newId())) })
        latest.current.dispatch({ type: 'set_tool', tool: 'select' })
        reveal({ x: origin.x, y: origin.y, ...template.size })
        say(
          clear
            ? `Added the ${template.name} template. Click a prompt to write in it, and move, resize or delete any part.`
            : `Added the ${template.name} template over what was there, since there was no clear space on the board.`,
        )
      },
    }
    return () => {
      controlRef.current = null
    }
    // place only reads dispatch, which does not change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlRef])

  // ---- Gestures ----

  const begin = (gesture: Gesture) => {
    gestureRef.current = gesture
    setActive(true)
  }

  const beginPan = (event: PointerEvent<HTMLElement>) => {
    const viewport = viewportRef.current
    if (!viewport) return
    event.preventDefault()
    begin({ kind: 'pan', pointerId: event.pointerId, start: { x: event.clientX, y: event.clientY }, scroll: { x: viewport.scrollLeft, y: viewport.scrollTop } })
  }

  const beginConnect = (event: PointerEvent<HTMLElement>, from: string) => {
    event.preventDefault()
    event.stopPropagation()
    begin({ kind: 'connect', pointerId: event.pointerId, start: { x: event.clientX, y: event.clientY }, from, moved: false })
  }

  const onSurfacePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (gestureRef.current) return
    if (event.button === 1 || (event.button === 0 && spaceRef.current)) return beginPan(event)
    if (event.button !== 0) return
    const target = event.target as Element
    const point = boardPoint(event)
    const start = { x: event.clientX, y: event.clientY }

    // A dot on the side of the selected thing: an arrow begins there.
    const dot = target.closest<HTMLElement>('[data-dot]')
    if (dot) return beginConnect(event, dot.dataset.dot!)

    // Tools that put something on the board do it at the press, wherever it is (on top of what is there, if need be). A note is placed by a
    // click. A shape, text or frame can also be drawn to size by dragging.
    if (tool === 'sticky') {
      event.preventDefault()
      return place('note', { at: point })
    }
    if (tool === 'shape' || tool === 'text' || tool === 'frame') {
      event.preventDefault()
      return begin({ kind: 'draw', pointerId: event.pointerId, start, startBoard: point, tool, newId: newId(), moved: false })
    }

    const itemEl = target.closest<HTMLElement>('[data-item-id]')
    const id = itemEl?.dataset.itemId
    const item = id ? items.find((other) => other.id === id) : undefined

    // The arrow tool: pressed on a thing, an arrow is pulled from it.
    if (tool === 'connector') {
      if (item && isRectItem(item) && !isConnector(item)) return beginConnect(event, item.id)
      return
    }

    if (item) {
      if (editing === item.id) return
      const additive = event.shiftKey
      const wasSelected = selection.includes(item.id)
      let ids = selection
      let collapseTo: string | null = null
      if (additive) {
        dispatch({ type: 'select', ids: [item.id], mode: 'toggle' })
        ids = wasSelected ? selection.filter((other) => other !== item.id) : [...selection, item.id]
      } else if (!wasSelected) {
        dispatch({ type: 'select', ids: [item.id] })
        ids = [item.id]
      } else if (selection.length > 1) {
        // A plain press on one of several that are selected narrows to it, once it is clear that it was not the start of a drag.
        collapseTo = item.id
      }
      // An arrow is selected by a press, and moved by its ends.
      if (isConnector(item) || ids.length === 0) return
      begin({ kind: 'drag', pointerId: event.pointerId, ids: ids.filter((other) => items.some((it) => it.id === other && !isConnector(it))), start, moved: false, collapseTo })
      return
    }

    // The empty board: a box that selects what it touches. A press that goes nowhere clears the selection.
    begin({ kind: 'marquee', pointerId: event.pointerId, start, startBoard: point, additive: event.shiftKey, base: selection, moved: false })
  }

  const onResizePointerDown = (event: PointerEvent<HTMLElement>, item: RectItem) => {
    if (event.button !== 0 || gestureRef.current) return
    event.preventDefault()
    event.stopPropagation()
    begin({ kind: 'resize', pointerId: event.pointerId, id: item.id, start: { x: event.clientX, y: event.clientY }, size: rectOf(item) })
  }

  const onHandleDown = (event: PointerEvent<SVGElement>, id: string, end: 'from' | 'to') => {
    if (event.button !== 0 || gestureRef.current) return
    event.preventDefault()
    event.stopPropagation()
    begin({ kind: 'end', pointerId: event.pointerId, id, end, start: { x: event.clientX, y: event.clientY }, moved: false })
  }

  // A gesture is tracked on the window, so it always ends: on release anywhere, if the button is already up when the pointer next moves,
  // on cancel, right-click or blur, and it is given up on Escape.
  useEffect(() => {
    if (!active) return

    const finish = (commit: boolean) => {
      const gesture = gestureRef.current
      const shown = liveRef.current
      gestureRef.current = null
      liveRef.current = null
      setActive(false)
      setLive(null)
      if (!gesture) return
      const send = latest.current.dispatch
      const current = docOf(latest.current.state).items

      if (gesture.kind === 'drag') {
        if (gesture.moved && commit && shown?.kind === 'drag') {
          send({ type: 'move', ids: gesture.ids, dx: shown.dx, dy: shown.dy })
          say(`Moved ${plural(gesture.ids.length, 'thing', 'things')}.`)
        } else if (!gesture.moved && commit && gesture.collapseTo) send({ type: 'select', ids: [gesture.collapseTo] })
      } else if (gesture.kind === 'resize') {
        if (commit && shown?.kind === 'resize') {
          send({ type: 'resize_item', id: gesture.id, w: shown.w, h: shown.h })
          say('Resized.')
        }
      } else if (gesture.kind === 'marquee') {
        if (!commit) send({ type: 'select', ids: gesture.base })
        else if (!gesture.moved && !gesture.additive) send({ type: 'select', ids: [] })
      } else if (gesture.kind === 'draw') {
        if (!commit) return
        const rect = shown?.kind === 'draw' ? shown.rect : null
        const drawn = gesture.moved && rect && (rect.w >= DRAWN_MIN || rect.h >= DRAWN_MIN)
        place(gesture.tool, drawn ? { rect } : { at: gesture.startBoard }, gesture.newId)
      } else if (gesture.kind === 'connect') {
        if (commit && gesture.moved && shown?.kind === 'connect') {
          const before = current.length
          send({ type: 'add_connector', id: newId(), from: { item: gesture.from }, to: shown.target ? { item: shown.target } : clampPoint(shown.point) })
          send({ type: 'set_tool', tool: 'select' })
          say(current.length >= before ? 'Added an arrow.' : '')
        }
      } else if (gesture.kind === 'end') {
        if (commit && gesture.moved && shown?.kind === 'end') {
          send({ type: 'set_connector', id: gesture.id, patch: { [gesture.end]: shown.target ? { item: shown.target } : clampPoint(shown.point) } })
          say('Moved the end of the arrow.')
        }
      }
    }

    const show = (next: Live) => {
      liveRef.current = next
      setLive(next)
    }

    const onMove = (event: globalThis.PointerEvent) => {
      const gesture = gestureRef.current
      if (!gesture || event.pointerId !== gesture.pointerId) return
      if (event.pointerType === 'mouse' && event.buttons === 0) return finish(true)
      const { zoom: z, state: now } = latest.current
      const all = docOf(now).items
      const dxScreen = event.clientX - gesture.start.x
      const dyScreen = event.clientY - gesture.start.y
      const here = screenToBoard({ x: event.clientX, y: event.clientY }, origin(), z)

      if (gesture.kind === 'pan') {
        const viewport = viewportRef.current
        if (viewport) {
          viewport.scrollLeft = gesture.scroll.x - dxScreen
          viewport.scrollTop = gesture.scroll.y - dyScreen
        }
        return
      }

      if (gesture.kind === 'drag') {
        if (!gesture.moved) {
          if (Math.hypot(dxScreen, dyScreen) <= DRAG_THRESHOLD_PX) return
          gesture.moved = true
        }
        return show({ kind: 'drag', ids: gesture.ids, dx: dxScreen / z, dy: dyScreen / z })
      }

      if (gesture.kind === 'resize') {
        const item = all.find((other) => other.id === gesture.id)
        if (!item || !isRectItem(item)) return
        const { min, max } = SIZE_LIMITS[item.kind]
        const size = resizeRect(gesture.size, gesture.size.w + dxScreen / z, gesture.size.h + dyScreen / z, min, max)
        return show({ kind: 'resize', id: gesture.id, w: size.w, h: size.h })
      }

      if (gesture.kind === 'draw') {
        if (!gesture.moved) {
          if (Math.hypot(dxScreen, dyScreen) <= DRAG_THRESHOLD_PX) return
          gesture.moved = true
        }
        return show({ kind: 'draw', tool: gesture.tool, rect: between(gesture.startBoard, clampPoint(here)) })
      }

      if (gesture.kind === 'connect' || gesture.kind === 'end') {
        if (!gesture.moved) {
          if (Math.hypot(dxScreen, dyScreen) <= ARROW_THRESHOLD_PX) return
          gesture.moved = true
        }
        // What the end would land on: not the thing the arrow starts from, and for the end of an arrow being moved, not the thing the other
        // end is on.
        let avoid: string | undefined = gesture.kind === 'connect' ? gesture.from : undefined
        if (gesture.kind === 'end') {
          const arrow = all.find((other) => other.id === gesture.id)
          const other = arrow && isConnector(arrow) ? (gesture.end === 'from' ? arrow.to : arrow.from) : null
          avoid = other && 'item' in other ? other.item : undefined
        }
        const target = connectTargetAt(all, here, avoid)?.id ?? null
        return show(gesture.kind === 'connect' ? { kind: 'connect', from: gesture.from, point: here, target } : { kind: 'end', id: gesture.id, end: gesture.end, point: here, target })
      }

      // marquee
      if (!gesture.moved) {
        if (Math.hypot(dxScreen, dyScreen) <= DRAG_THRESHOLD_PX) return
        gesture.moved = true
      }
      const rect = between(gesture.startBoard, clampPoint(here))
      // What the box selects: things it touches, arrows with both ends in it, and a frame only when the whole of it is in the box (so that
      // drawing a box inside a frame to select what is in it does not select the frame as well).
      const touched = all
        .filter((item) => {
          if (isConnector(item)) {
            const ends = endPoints(item, all)
            return ends.length === 2 && ends.every((point) => point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h)
          }
          const box = rectOf(item)
          if (isFrame(item)) return box.x >= rect.x && box.y >= rect.y && box.x + box.w <= rect.x + rect.w && box.y + box.h <= rect.y + rect.h
          return intersects(box, rect)
        })
        .map((item) => item.id)
      const ids = gesture.additive ? [...gesture.base, ...touched.filter((id) => !gesture.base.includes(id))] : touched
      if (ids.join() !== now.selection.join()) latest.current.dispatch({ type: 'select', ids })
      show({ kind: 'marquee', rect })
    }
    const onUp = (event: globalThis.PointerEvent) => {
      if (event.pointerId === gestureRef.current?.pointerId) finish(true)
    }
    const onCancel = (event: globalThis.PointerEvent) => {
      if (event.pointerId === gestureRef.current?.pointerId) finish(false)
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
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('blur', onAbort)
      window.removeEventListener('contextmenu', onAbort)
    }
    // finish and the handlers only read refs and the latest state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  // Space held down pans with the pointer.
  useEffect(() => {
    const down = (event: globalThis.KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat) return
      const target = event.target as HTMLElement | null
      if (!target || !viewportRef.current?.contains(target) || target.closest('textarea, input, select, button')) return
      event.preventDefault()
      spaceRef.current = true
      setPanReady(true)
    }
    const up = (event: globalThis.KeyboardEvent) => {
      if (event.code !== 'Space') return
      spaceRef.current = false
      setPanReady(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  // ---- What is drawn now: the items with what the gesture is doing to them ----

  const plan = live?.kind === 'drag' ? planMove(items, live.ids, live.dx, live.dy) : null
  const shiftEnd = (end: ConnectorItem['from']) => (plan && !('item' in end) ? { x: end.x + plan.delta.x, y: end.y + plan.delta.y } : end)
  const viewItems: BoardItem[] = items.map((item) => {
    if (plan && isRectItem(item) && plan.rectIds.includes(item.id)) return { ...item, x: item.x + plan.delta.x, y: item.y + plan.delta.y }
    if (plan && isConnector(item) && plan.arrowIds.includes(item.id)) return { ...item, from: shiftEnd(item.from), to: shiftEnd(item.to) }
    if (live?.kind === 'resize' && live.id === item.id && isRectItem(item)) return { ...item, w: live.w, h: live.h }
    return item
  })
  const carried = new Set(plan ? [...plan.rectIds, ...plan.arrowIds] : [])

  // An arrow being drawn, or one of whose ends is being moved.
  let draft: ConnectorItem | null = null
  if (live?.kind === 'connect') {
    draft = { id: '__draft', kind: 'connector', from: { item: live.from }, to: live.target ? { item: live.target } : live.point, style: state.connectorStyle, head: 'end', text: '' }
  } else if (live?.kind === 'end') {
    const arrow = viewItems.find((item) => item.id === live.id)
    if (arrow && isConnector(arrow)) {
      const end = live.target ? { item: live.target } : live.point
      draft = { ...arrow, [live.end]: end }
    }
  }
  const dropTarget = live?.kind === 'connect' || live?.kind === 'end' ? live.target : null

  const selectedViews = viewItems.filter((item) => selection.includes(item.id))
  const single = selection.length === 1 ? selectedViews[0] : undefined

  // The bar over the selection: where it is, and what is under it. Hidden while a gesture is under way, or something is being written in.
  const selectionRects = selectedViews.flatMap((item) => {
    if (isRectItem(item)) return [rectOf(item)]
    const path = connectorPath(item, viewItems)
    if (!path) return []
    const box = boundsOf(path.points.map((point) => ({ x: point.x, y: point.y, w: 0, h: 0 })))
    return box ? [box] : []
  })
  const selectionBox = boundsOf(selectionRects)
  const showBar = selectionBox && !live && !editing && !active
  const held = selectedViews.filter(isFrame).reduce((total, frame) => total + membersOf(items, items.find((item) => item.id === frame.id) as FrameItem).length, 0)
  const barStyle: CSSProperties | undefined =
    selectionBox && showBar
      ? (() => {
          const left = PAD + selectionBox.x * zoom
          const above = PAD + selectionBox.y * zoom - 60
          // Above the selection, unless that is off the top of the board, and then below it.
          const top = above < 8 ? PAD + (selectionBox.y + selectionBox.h) * zoom + 10 : above
          return { left, top }
        })()
      : undefined

  const surface: CSSProperties & { '--cell': string } = {
    left: PAD,
    top: PAD,
    width: BOARD_W * zoom,
    height: BOARD_H * zoom,
    '--cell': `${GRID * 2 * zoom}px`,
  }

  // ---- The keyboard ----

  // In the order they were selected, which is the order an arrow joining two of them goes in.
  const selectedNow = selection.flatMap((id) => items.filter((item) => item.id === id))

  // If everything selected is from one use of a template, the bar can put that template back as it was.
  const group = selectedNow.length > 0 && selectedNow.every((item) => item.group && item.group === selectedNow[0].group) ? selectedNow[0].group! : null
  const groupTemplate = group ? templateOfGroup(group) : undefined
  const resetTemplate = () => {
    const origin = group ? originOfGroup(items, group) : null
    if (!group || !groupTemplate || !origin) return
    dispatch({ type: 'replace_group', group, items: instantiateTemplate(groupTemplate, origin, newId, group) })
    say(`Reset the ${groupTemplate.name} template.`)
  }

  const startEditing = (item: BoardItem) => {
    if (item.kind === 'frame' || item.kind === 'connector' || 'text' in item) setEditing(item.id)
  }

  const onViewportKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    // Typing in a note, or pressing a button of the board's own, is not for the board.
    if (target.closest('textarea, input, select, .board__bar, .board__zoom')) return
    const meta = event.metaKey || event.ctrlKey

    if (meta && event.key.toLowerCase() === 'a') {
      event.preventDefault()
      dispatch({ type: 'select_all' })
      say(`Selected ${plural(items.length, 'thing', 'things')}.`)
      return
    }
    if (event.key === 'Escape') {
      if (selection.length > 0) dispatch({ type: 'select', ids: [] })
      if (tool !== 'select') dispatch({ type: 'set_tool', tool: 'select' })
      return
    }
    if (selection.length === 0) return

    // Order: Ctrl or Cmd with ] and [ goes forward and back, and with Shift to the front and the back.
    if (meta && (event.key === ']' || event.key === '[' || event.key === '}' || event.key === '{')) {
      event.preventDefault()
      const forward = event.key === ']' || event.key === '}'
      const to = event.shiftKey ? (forward ? 'front' : 'back') : forward ? 'forward' : 'backward'
      dispatch({ type: 'reorder', ids: selection, to })
      say(`Moved ${plural(selection.length, 'thing', 'things')} ${to === 'front' ? 'to the front' : to === 'back' ? 'to the back' : to}.`)
      return
    }

    if (event.key === 'Enter' && selection.length === 1) {
      event.preventDefault()
      startEditing(selectedNow[0])
      return
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      const frames = selectedNow.filter(isFrame)
      // A frame is deleted without what is inside it, and the board says so. Taking its contents too is a separate, asked-for step.
      const stays = frames.reduce((total, frame) => total + membersOf(items, frame).filter((member) => !selection.includes(member.id)).length, 0)
      dispatch({ type: 'delete', ids: selection })
      say(stays > 0 ? `Deleted the frame. The ${plural(stays, 'thing', 'things')} in it ${stays === 1 ? 'stays' : 'stay'} on the board.` : `Deleted ${plural(selection.length, 'thing', 'things')}.`)
      return
    }
    const arrow = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key]
    if (!arrow) return
    event.preventDefault()
    if (event.altKey) {
      // Alt with an arrow resizes a single thing, a grid step at a time.
      const item = selectedNow[0]
      if (selection.length !== 1 || !item || !isRectItem(item)) return
      const { min, max } = SIZE_LIMITS[item.kind]
      const size = resizeRect(rectOf(item), item.w + arrow[0] * GRID, item.h + arrow[1] * GRID, min, max)
      if (size.w === item.w && size.h === item.h) return say('It cannot be that size.')
      dispatch({ type: 'resize_item', id: item.id, w: size.w, h: size.h })
      say(`It is now ${size.w} by ${size.h}.`)
      return
    }
    const step = event.shiftKey ? BIG_STEP : GRID
    const moved = planMove(items, selection, arrow[0] * step, arrow[1] * step)
    if (!moved) return say('That is the edge of the board.')
    dispatch({ type: 'move', ids: selection, dx: arrow[0] * step, dy: arrow[1] * step })
    say(`Moved ${plural(expandWithMembers(items, selection).length || selection.length, 'thing', 'things')}.`)
  }

  // ---- Drawing the items ----

  const common = <T extends BoardItem>(item: T): ViewProps<T> => ({
    item,
    items: viewItems,
    selected: selection.includes(item.id),
    editing: editing === item.id,
    dragging: carried.has(item.id),
    resizing: live?.kind === 'resize' && live.id === item.id,
    // It stays while it is being dragged, so what is being pressed is not taken away from under the pointer.
    resizable: tool === 'select' && single?.id === item.id && editing !== item.id && (!live || (live.kind === 'resize' && live.id === item.id)),
    onFocus: () => {
      if (!(selection.length === 1 && selection[0] === item.id) && !gestureRef.current) dispatch({ type: 'select', ids: [item.id] })
    },
    onEdit: () => startEditing(item),
    onStopEditing: () => setEditing((current) => (current === item.id ? null : current)),
    onText: (text) => dispatch({ type: 'set_text', id: item.id, text }),
    onResizeDown: (event) => isRectItem(item) && onResizePointerDown(event, item),
  })

  // The dots stay while an arrow is being pulled from one, so what is being pressed is not taken away from under the pointer.
  const dots = single && isNode(single) && tool === 'select' && !editing && (!live || live.kind === 'connect') ? single : null
  const frames = viewItems.filter(isFrame)
  const nodes = viewItems.filter(isNode)
  const arrows = viewItems.filter(isConnector).filter((arrow) => !(live?.kind === 'end' && live.id === arrow.id))

  const classes = ['board']
  if (CREATION.includes(tool)) classes.push('board--create')
  if (tool === 'connector') classes.push('board--arrow')
  if (panReady) classes.push('board--pan-ready')
  if (active) classes.push('board--busy')

  return (
    <ToolWindow title="Board" reason={reason}>
      <div className={classes.join(' ')}>
        <div
          ref={viewportRef}
          className="board__viewport"
          role="group"
          aria-label="Board. Things can be moved with the arrow keys, and written in with Enter."
          tabIndex={0}
          onKeyDown={onViewportKeyDown}
        >
          <div className="board__sizer" style={{ width: BOARD_W * zoom + PAD * 2, height: BOARD_H * zoom + PAD * 2 }}>
            <div
              ref={surfaceRef}
              className="board__surface"
              style={surface}
              onPointerDown={onSurfacePointerDown}
              onDoubleClick={(event) => {
                if ((event.target as HTMLElement).closest('[data-item-id], [data-dot]') || tool !== 'select') return
                place('note', { at: boardPoint(event) })
              }}
            >
              <div className="board__world" style={{ width: BOARD_W, height: BOARD_H, transform: `scale(${zoom})` }}>
                {frames.map((item) => (
                  <FrameView key={item.id} {...common(item)} onTitle={(title) => dispatch({ type: 'set_title', id: item.id, title })} />
                ))}

                <ConnectorsLayer
                  connectors={arrows}
                  items={viewItems}
                  selection={selection}
                  editing={editing}
                  draft={draft}
                  target={dropTarget}
                  onFocus={(id) => {
                    if (!(selection.length === 1 && selection[0] === id) && !gestureRef.current) dispatch({ type: 'select', ids: [id] })
                  }}
                  onEdit={(id) => setEditing(id)}
                  onStopEditing={() => setEditing(null)}
                  onLabel={(id, text) => dispatch({ type: 'set_text', id, text })}
                  onHandleDown={onHandleDown}
                  handlesFor={tool === 'select' && single && isConnector(single) && !editing && live?.kind !== 'drag' ? single.id : null}
                />

                {nodes.map((item) =>
                  item.kind === 'note' ? <NoteView key={item.id} {...common(item)} />
                  : item.kind === 'shape' ? <ShapeView key={item.id} {...common(item)} />
                  : <TextLabelView key={item.id} {...common(item)} />,
                )}

                {dots &&
                  (['top', 'right', 'bottom', 'left'] as const).map((side) => {
                    const at = side === 'top' ? { left: dots.x + dots.w / 2, top: dots.y } : side === 'bottom' ? { left: dots.x + dots.w / 2, top: dots.y + dots.h } : side === 'left' ? { left: dots.x, top: dots.y + dots.h / 2 } : { left: dots.x + dots.w, top: dots.y + dots.h / 2 }
                    return <span key={side} className="dot" data-dot={dots.id} data-side={side} title="Drag to draw an arrow from here" style={at} />
                  })}

                {live?.kind === 'marquee' && <div className="board__marquee" style={{ left: live.rect.x, top: live.rect.y, width: live.rect.w, height: live.rect.h }} />}
                {live?.kind === 'draw' && <div className="board__marquee board__marquee--draw" data-tool={live.tool} style={{ left: live.rect.x, top: live.rect.y, width: live.rect.w, height: live.rect.h }} />}
              </div>
            </div>

            {showBar && barStyle && <SelectionBar key={selection.join(',')} selected={selectedNow} held={held} dispatch={dispatch} say={say} style={barStyle} template={groupTemplate ? { name: groupTemplate.name, reset: resetTemplate } : null} decide={decide} />}
          </div>
        </div>

        <div className="board__zoom glass glass--strong" role="group" aria-label="Zoom">
          <button type="button" className="board__zoom-button" aria-label="Zoom out" onClick={() => changeZoom(stepZoom(zoom, -1))}>
            −
          </button>
          <button type="button" className="board__zoom-value" aria-label={`Zoom ${percentLabel(zoom)}. Press for 100 percent.`} onClick={() => changeZoom(1)}>
            {percentLabel(zoom)}
          </button>
          <button type="button" className="board__zoom-button" aria-label="Zoom in" onClick={() => changeZoom(stepZoom(zoom, 1))}>
            +
          </button>
          <button type="button" className="board__zoom-fit" onClick={fit}>
            Fit
          </button>
        </div>

        <div className="visually-hidden" role="status" aria-live="polite">
          {announcement}
        </div>
      </div>
    </ToolWindow>
  )
}
