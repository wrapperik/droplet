import {
  arrangementIsDefault,
  arrangementUnsaved,
  isArrangementAction,
  openArrangement,
  reduceArrangement,
  type Arrangement,
  type ArrangementAction,
  type ArrangementSave,
  type ArrangementSpec,
} from './arrangement.ts'
import { BOARD_H, BOARD_W, clamp, groupDelta, keepInside, snap, snapRect, type Point, type Rect } from './boardGeometry.ts'
import { expandWithMembers, membersOf } from './boardFrames.ts'
import {
  MAX_GROUP,
  MAX_HINT,
  MAX_ITEMS,
  MAX_LABEL,
  MAX_NOTE_TEXT,
  MAX_TEXT,
  MAX_TITLE,
  SIZE_LIMITS,
  attachedTo,
  isConnector,
  isFrame,
  isNode,
  isRectItem,
  rectOf,
  type BoardItem,
  type ConnectorItem,
  type ConnectorStyle,
  type End,
  type FounderColour,
  type NoteColour,
  type NoteItem,
  type RectItem,
  type ShapeColour,
  type ShapeKind,
  type TextSize,
} from './boardTypes.ts'
import { canRedo, canUndo, commit, createHistory, redo, undo, type History } from './history.ts'
import type { Placement } from './gridLayout.ts'

export * from './boardTypes.ts'

// Everything about the board that can change, and the one set of actions that changes it. As with the palette and the invoice, the
// interface and (later) the AI both go through `reduce`, and one undo step covers a person's edit or a whole turn.
//
// What is on the board is the document, and it is in the history. Which things are selected, which tool is in hand and the settings of the
// tools are not: undo takes back what was done to the board, not where the pointer was.

export type Tool = 'select' | 'sticky' | 'shape' | 'text' | 'frame' | 'connector'

// The components of the board workspace. The board itself is the one window. Tools are in the toolbar and are in hand for the next click
// on the board, so they have no bigger form to be dragged out into (fixed).
export const BOARD_COMPONENTS: ArrangementSpec['components'] = [
  { id: 'select', label: 'Select', kind: 'toolbar', hideable: false },
  { id: 'sticky', label: 'Sticky note', kind: 'toolbar', hideable: false },
  { id: 'shape', label: 'Shape', kind: 'toolbar', hideable: false },
  { id: 'text', label: 'Text', kind: 'toolbar', hideable: false },
  { id: 'frame', label: 'Frame', kind: 'toolbar', hideable: false },
  { id: 'connector', label: 'Arrow', kind: 'toolbar', hideable: false },
  { id: 'templates', label: 'Templates', kind: 'toolbar', hideable: false },
  { id: 'board', label: 'Board', kind: 'panel', hideable: false },
]

export const BOARD_WINDOW_SIZES: ArrangementSpec['windowSizes'] = {
  board: { w: 24, heightPx: 720 },
}

export const BOARD_LAYOUT: Placement[] = [
  { id: 'board', col: 0, row: 0, w: BOARD_WINDOW_SIZES.board.w },
]

export const BOARD_SPEC: ArrangementSpec = { components: BOARD_COMPONENTS, layout: BOARD_LAYOUT, windowSizes: BOARD_WINDOW_SIZES }

export type BoardDoc = Arrangement & {
  // In the order they are drawn: frames, then arrows, then everything else, each from back to front.
  items: BoardItem[]
}

export type BoardState = {
  history: History<BoardDoc>
  // The ids of what is selected. Not part of the history.
  selection: string[]
  tool: Tool
  // The settings of the tools: the colour of the next note, the kind of the next shape, and how the next arrow is drawn.
  noteColour: FounderColour
  shapeKind: ShapeKind
  connectorStyle: ConnectorStyle
}

export type SelectMode = 'replace' | 'add' | 'toggle'
export type ReorderTo = 'front' | 'back' | 'forward' | 'backward'

// Where a new thing goes: centred on a point, or exactly in a rectangle (such as one drawn with the pointer).
type Placing = { at?: Point; rect?: Rect }

export type BoardAction =
  | ({ type: 'add_note'; id: string; text?: string; colour?: NoteColour; author?: 'you' | 'ai' } & Placing)
  | ({ type: 'add_shape'; id: string; shape?: ShapeKind; text?: string; colour?: ShapeColour } & Placing)
  | ({ type: 'add_text'; id: string; text?: string; size?: TextSize } & Placing)
  | ({ type: 'add_frame'; id: string; title?: string; colour?: ShapeColour } & Placing)
  | { type: 'add_connector'; id: string; from: End; to: End; style?: ConnectorStyle; head?: ConnectorItem['head']; text?: string }
  // Several things at once, such as a template: all of them or none. Each is fitted to the board, an arrow may be on things in the same lot or
  // on things already there, and the ids must be new. Nothing is selected.
  | { type: 'add_items'; items: BoardItem[] }
  // Everything that one use of a template put on the board is taken off, and these are put on in its place, as one step. This is how a template is
  // reset. The arrows on what was taken off go with it.
  | { type: 'replace_group'; group: string; items: BoardItem[] }
  // Moved by (dx, dy), as a group: snapped, and held back at the board edge. A frame takes what is inside it. What moved comes to the front.
  | { type: 'move'; ids: string[]; dx: number; dy: number }
  // A thing's size, snapped, within its limits and the board edge. (`resize` is a window's width, from the arrangement.)
  | { type: 'resize_item'; id: string; w: number; h: number }
  // The words of a note, a shape or a text label, or the label of an arrow.
  | { type: 'set_text'; id: string; text: string }
  | { type: 'set_title'; id: string; title: string }
  | { type: 'set_colour'; ids: string[]; colour: NoteColour | ShapeColour }
  // Words written into a note that has none: it becomes a note by Droplet (pink, with its name on it) in the same place, and its hint goes. This is how
  // the AI fills in the prompts of a template. It is refused for a note that has words in it, so it cannot write over the founder's.
  | { type: 'fill_note'; id: string; text: string }
  // Notes by Droplet that the founder keeps: they become the founder's own, in the colour of the next note, with no pink and no "Droplet" on them.
  | { type: 'keep_notes'; ids: string[] }
  | { type: 'set_shape'; ids: string[]; shape: ShapeKind }
  | { type: 'set_text_size'; ids: string[]; size: TextSize }
  | { type: 'set_connector'; id: string; patch: Partial<Pick<ConnectorItem, 'style' | 'head' | 'from' | 'to'>> }
  | { type: 'reorder'; ids: string[]; to: ReorderTo }
  // Deleting a frame leaves what is inside it, unless `contents` says to take that too. An arrow goes with either end.
  | { type: 'delete'; ids: string[]; contents?: boolean }
  | { type: 'select'; ids: string[]; mode?: SelectMode }
  | { type: 'select_all' }
  | { type: 'set_tool'; tool: Tool }
  | { type: 'set_note_colour'; colour: FounderColour }
  | { type: 'set_shape_kind'; shape: ShapeKind }
  | { type: 'set_connector_style'; style: ConnectorStyle }
  | ArrangementAction
  | { type: 'undo' }
  | { type: 'redo' }
  // Several actions applied together and undone together.
  | { type: 'batch'; actions: BoardAction[] }

// ---- Opening, and fitting what is sent ----

// A rectangle of a kind made to fit: within the size limits, and inside the board. Snapped to the grid unless it is being opened from a save.
function fitRect(kind: RectItem['kind'], rect: Rect, snapToGrid = true): Rect {
  const { min, max } = SIZE_LIMITS[kind]
  const placed = snapToGrid ? snapRect(rect) : rect
  return keepInside({ x: placed.x, y: placed.y, w: clamp(snapToGrid ? snap(rect.w) : rect.w, min.w, max.w), h: clamp(snapToGrid ? snap(rect.h) : rect.h, min.h, max.h) })
}

const centredRect = (kind: RectItem['kind'], at: Point, size = SIZE_LIMITS[kind].start): Rect => fitRect(kind, { x: at.x - size.w / 2, y: at.y - size.h / 2, ...size })

const clampPoint = (point: Point): Point => ({ x: clamp(point.x, 0, BOARD_W), y: clamp(point.y, 0, BOARD_H) })

// An end that is valid on this board: on a thing that is there (and is not an arrow), or at a point on the board. Null otherwise.
function fitEnd(end: End, items: BoardItem[]): End | null {
  if ('item' in end) {
    const target = items.find((item) => item.id === end.item)
    return target && isRectItem(target) ? { item: end.item } : null
  }
  return Number.isFinite(end.x) && Number.isFinite(end.y) ? clampPoint(end) : null
}

// The drawing order: frames, then arrows, then everything else. Within each, the order they were in.
const layered = (items: BoardItem[]): BoardItem[] => [...items.filter(isFrame), ...items.filter(isConnector), ...items.filter(isNode)]

// A copy of an item with its group and its hint cut to length, and left out if they are empty.
function tidy<T extends BoardItem>(item: T): T {
  const copy: Record<string, unknown> = { ...item }
  if (typeof copy.group === 'string' && copy.group) copy.group = copy.group.slice(0, MAX_GROUP)
  else delete copy.group
  if (typeof copy.hint === 'string' && copy.hint) copy.hint = copy.hint.slice(0, MAX_HINT)
  else delete copy.hint
  return copy as T
}

// Items that are saved or sent are made to fit: inside the board, within the size limits, their words no longer than they can hold, and an
// arrow is kept only if what it is attached to is there (in the same lot, or among `context`, the things already on the board).
function fitItems(items: BoardItem[], context: BoardItem[] = []): BoardItem[] {
  const fitted: BoardItem[] = []
  const taken = (id: string) => fitted.some((other) => other.id === id) || context.some((other) => other.id === id)
  for (const item of items) {
    if (taken(item.id)) continue
    if (item.kind === 'note') fitted.push(tidy({ ...item, ...fitRect('note', rectOf(item), false), text: item.text.slice(0, MAX_NOTE_TEXT) }))
    else if (item.kind === 'shape') fitted.push(tidy({ ...item, ...fitRect('shape', rectOf(item), false), text: item.text.slice(0, MAX_TEXT) }))
    else if (item.kind === 'text') fitted.push(tidy({ ...item, ...fitRect('text', rectOf(item), false), text: item.text.slice(0, MAX_TEXT) }))
    else if (item.kind === 'frame') fitted.push(tidy({ ...item, ...fitRect('frame', rectOf(item), false), title: item.title.slice(0, MAX_TITLE) }))
  }
  const there = [...context, ...fitted]
  for (const item of items) {
    if (item.kind !== 'connector' || taken(item.id)) continue
    const from = fitEnd(item.from, there)
    const to = fitEnd(item.to, there)
    if (from && to && (attachedTo(from) === null || attachedTo(from) !== attachedTo(to))) fitted.push(tidy({ ...item, from, to, text: item.text.slice(0, MAX_LABEL) }))
  }
  return layered(fitted)
}

// The workspace for a board, arranged as the project's saved arrangement if there is one.
export function openBoard(items: BoardItem[] = [], arrangement?: ArrangementSave | null): BoardState {
  const doc: BoardDoc = { items: fitItems(items), ...openArrangement(BOARD_SPEC, arrangement) }
  return { history: createHistory(doc), selection: [], tool: 'select', noteColour: 'yellow', shapeKind: 'rectangle', connectorStyle: 'straight' }
}

export const docOf = (state: BoardState): BoardDoc => state.history.present
export const canUndoBoard = (state: BoardState) => canUndo(state.history)
export const canRedoBoard = (state: BoardState) => canRedo(state.history)
export const boardArrangementIsDefault = (doc: BoardDoc) => arrangementIsDefault(BOARD_SPEC, doc)

export const itemById = (doc: BoardDoc, id: string) => doc.items.find((item) => item.id === id)
export const selectedItems = (state: BoardState) => docOf(state).items.filter((item) => state.selection.includes(item.id))

// ---- Comparing ----

// A value written out the same way whatever order the fields of its objects were written in. What is read back from storage has its fields in
// the order of the schema, not of the code that made them, so comparing them as text would call a board that was saved changed.
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stable(object[key])}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

export function sameItems(a: BoardItem[], b: BoardItem[]): boolean {
  return a.length === b.length && a.every((item, index) => stable(item) === stable(b[index]))
}

// Whether anything differs from what was saved: the board, or how the workspace is arranged. With nothing saved, it is unsaved.
export function isBoardUnsaved(doc: BoardDoc, saved: { items: BoardItem[] } & ArrangementSave | null): boolean {
  return !saved || !sameItems(doc.items, saved.items) || arrangementUnsaved(BOARD_SPEC, doc, saved)
}

// ---- Actions ----

// Where a group lands when moved by (dx, dy), and what moves: the things asked for, everything inside a frame that was asked for, and the loose
// ends of arrows that were asked for (an end on a thing goes where the thing goes, and an end on nothing is the arrow's own to move). Snapped,
// and held back so that none of it leaves the board. Null when nothing would move. The interface uses the same plan to show a move while it
// is under way, so what is shown is what is done.
export function planMove(items: BoardItem[], ids: string[], dx: number, dy: number): { delta: Point; rectIds: string[]; arrowIds: string[] } | null {
  if (ids.length === 0) return null
  const rectIds = expandWithMembers(items, ids)
  const moving = items.filter((item): item is RectItem => rectIds.includes(item.id) && isRectItem(item))
  const arrows = items.filter(isConnector).filter((arrow) => ids.includes(arrow.id))
  const loose = arrows.flatMap((arrow) => [arrow.from, arrow.to]).filter((end): end is Point => !('item' in end))
  const rects: Rect[] = [...moving.map(rectOf), ...loose.map((point) => ({ x: point.x, y: point.y, w: 0, h: 0 }))]
  if (rects.length === 0) return null
  const delta = groupDelta(rects, dx, dy)
  if (delta.x === 0 && delta.y === 0) return null
  return { delta, rectIds, arrowIds: arrows.map((arrow) => arrow.id) }
}

type Working = { doc: BoardDoc; selection: string[]; tool: Tool; noteColour: FounderColour; shapeKind: ShapeKind; connectorStyle: ConnectorStyle }

const withItems = (w: Working, items: BoardItem[]): Working => ({ ...w, doc: { ...w.doc, items: layered(items) } })

// The ids that are still on the board, once each, in the order given.
const existing = (doc: BoardDoc, ids: string[]) => ids.filter((id, index) => ids.indexOf(id) === index && doc.items.some((item) => item.id === id))

const hasRoom = (w: Working) => w.doc.items.length < MAX_ITEMS
const idFree = (w: Working, id: string) => !w.doc.items.some((item) => item.id === id)

// Where a new rectangle of a kind goes.
const placed = (kind: RectItem['kind'], placing: Placing): Rect => (placing.rect ? fitRect(kind, placing.rect) : centredRect(kind, placing.at ?? { x: 0, y: 0 }))

// The arrows that are attached to any of these things.
const arrowsOn = (items: BoardItem[], ids: string[]) => items.filter(isConnector).filter((arrow) => [arrow.from, arrow.to].some((end) => ids.includes(attachedTo(end) ?? '')))

function step(w: Working, action: BoardAction): Working {
  const { items } = w.doc
  switch (action.type) {
    case 'add_note': {
      if (!hasRoom(w) || !idFree(w, action.id)) return w
      const author = action.author ?? 'you'
      const note: NoteItem = {
        id: action.id,
        kind: 'note',
        ...placed('note', action),
        text: (action.text ?? '').slice(0, MAX_NOTE_TEXT),
        // A note by Droplet is pink, whatever else was asked. A founder's is the colour in hand unless one was chosen.
        colour: author === 'ai' ? 'pink' : (action.colour ?? w.noteColour),
        author,
      }
      return { ...withItems(w, [...items, note]), selection: [note.id] }
    }

    case 'add_shape': {
      if (!hasRoom(w) || !idFree(w, action.id)) return w
      const shape = action.shape ?? w.shapeKind
      // A diamond needs a little more height than the others to hold the same words.
      const rect = action.rect ? placed('shape', action) : centredRect('shape', action.at ?? { x: 0, y: 0 }, shape === 'diamond' ? { w: 220, h: 180 } : undefined)
      const item: BoardItem = { id: action.id, kind: 'shape', shape, ...rect, text: (action.text ?? '').slice(0, MAX_TEXT), colour: action.colour ?? 'white' }
      return { ...withItems(w, [...items, item]), selection: [item.id] }
    }

    case 'add_text': {
      if (!hasRoom(w) || !idFree(w, action.id)) return w
      const item: BoardItem = { id: action.id, kind: 'text', ...placed('text', action), text: (action.text ?? '').slice(0, MAX_TEXT), size: action.size ?? 'body' }
      return { ...withItems(w, [...items, item]), selection: [item.id] }
    }

    case 'add_frame': {
      if (!hasRoom(w) || !idFree(w, action.id)) return w
      const item: BoardItem = { id: action.id, kind: 'frame', ...placed('frame', action), title: (action.title ?? 'Frame').slice(0, MAX_TITLE), colour: action.colour ?? 'white' }
      return { ...withItems(w, [...items, item]), selection: [item.id] }
    }

    case 'add_connector': {
      if (!hasRoom(w) || !idFree(w, action.id)) return w
      const from = fitEnd(action.from, items)
      const to = fitEnd(action.to, items)
      if (!from || !to || attachedTo(from) !== null && attachedTo(from) === attachedTo(to)) return w
      // The same arrow twice between the same two things says nothing new.
      const twin = items.filter(isConnector).some((arrow) => attachedTo(arrow.from) === attachedTo(from) && attachedTo(arrow.to) === attachedTo(to) && attachedTo(from) !== null && attachedTo(to) !== null)
      if (twin) return w
      const arrow: ConnectorItem = { id: action.id, kind: 'connector', from, to, style: action.style ?? w.connectorStyle, head: action.head ?? 'end', text: (action.text ?? '').slice(0, MAX_LABEL) }
      return { ...withItems(w, [...items, arrow]), selection: [arrow.id] }
    }

    case 'add_items': {
      // All or none: if the lot would not fit on the board, or one of the ids is not new, nothing is added. An arrow whose end is on nothing is
      // left out of the lot.
      const added = fitItems(action.items, items)
      if (added.length === 0 || items.length + added.length > MAX_ITEMS || action.items.some((item) => items.some((other) => other.id === item.id))) return w
      return withItems(w, [...items, ...added])
    }

    case 'replace_group': {
      const gone = new Set(items.filter((item) => item.group === action.group).map((item) => item.id))
      if (gone.size === 0) return w
      for (const arrow of arrowsOn(items, [...gone])) gone.add(arrow.id)
      const kept = items.filter((item) => !gone.has(item.id))
      const added = fitItems(action.items, kept)
      if (added.length === 0 || kept.length + added.length > MAX_ITEMS || action.items.some((item) => kept.some((other) => other.id === item.id))) return w
      return { ...withItems(w, [...kept, ...added]), selection: w.selection.filter((id) => !gone.has(id)) }
    }

    case 'move': {
      const plan = planMove(items, existing(w.doc, action.ids), action.dx, action.dy)
      if (!plan) return w
      const { delta, rectIds, arrowIds } = plan
      const shift = (end: End): End => ('item' in end ? end : { x: end.x + delta.x, y: end.y + delta.y })
      const moved = items.map((item) => {
        if (isRectItem(item) && rectIds.includes(item.id)) return { ...item, x: item.x + delta.x, y: item.y + delta.y }
        if (isConnector(item) && arrowIds.includes(item.id)) return { ...item, from: shift(item.from), to: shift(item.to) }
        return item
      })
      // What was moved comes to the front, in the order it was in.
      const front = (item: BoardItem) => (isRectItem(item) ? rectIds.includes(item.id) : arrowIds.includes(item.id))
      return withItems(w, [...moved.filter((item) => !front(item)), ...moved.filter(front)])
    }

    case 'resize_item': {
      const item = items.find((other) => other.id === action.id)
      if (!item || !isRectItem(item)) return w
      const { min, max } = SIZE_LIMITS[item.kind]
      const room = { w: BOARD_W - item.x, h: BOARD_H - item.y }
      const next = { w: clamp(snap(action.w), min.w, Math.min(max.w, room.w)), h: clamp(snap(action.h), min.h, Math.min(max.h, room.h)) }
      if (next.w === item.w && next.h === item.h) return w
      return withItems(w, items.map((other) => (other.id === item.id ? { ...other, ...next } : other)))
    }

    case 'set_text': {
      const item = items.find((other) => other.id === action.id)
      if (!item || !('text' in item)) return w
      const limit = item.kind === 'note' ? MAX_NOTE_TEXT : item.kind === 'connector' ? MAX_LABEL : MAX_TEXT
      const text = action.text.slice(0, limit)
      if (item.text === text) return w
      return withItems(w, items.map((other) => (other.id === item.id ? { ...other, text } : other)))
    }

    case 'set_title': {
      const item = items.find((other) => other.id === action.id)
      const title = action.title.slice(0, MAX_TITLE)
      if (!item || !isFrame(item) || item.title === title) return w
      return withItems(w, items.map((other) => (other.id === item.id ? { ...other, title } : other)))
    }

    case 'set_colour': {
      const ids = existing(w.doc, action.ids)
      // A note takes any of the note colours. A shape or a frame takes white or the founder's colours, and pink is not one of them.
      const next = items.map((item) => {
        if (!ids.includes(item.id) || !('colour' in item) || item.colour === action.colour) return item
        if (item.kind === 'note') return { ...item, colour: action.colour as NoteColour }
        if (action.colour === 'pink') return item
        return { ...item, colour: action.colour as ShapeColour }
      })
      return next.some((item, index) => item !== items[index]) ? withItems(w, next) : w
    }

    case 'fill_note': {
      const note = items.find((item) => item.id === action.id)
      const text = action.text.trim().slice(0, MAX_NOTE_TEXT)
      if (!note || note.kind !== 'note' || note.text.trim() !== '' || text === '') return w
      const { hint: _hint, ...bare } = note
      void _hint
      return withItems(w, items.map((item) => (item.id === note.id ? { ...bare, text, author: 'ai' as const, colour: 'pink' as const } : item)))
    }

    case 'keep_notes': {
      const ids = existing(w.doc, action.ids)
      const next = items.map((item) => (ids.includes(item.id) && item.kind === 'note' && item.author === 'ai' ? { ...item, author: 'you' as const, colour: w.noteColour } : item))
      return next.some((item, index) => item !== items[index]) ? withItems(w, next) : w
    }

    case 'set_shape': {
      const ids = existing(w.doc, action.ids)
      const next = items.map((item) => (ids.includes(item.id) && item.kind === 'shape' && item.shape !== action.shape ? { ...item, shape: action.shape } : item))
      return next.some((item, index) => item !== items[index]) ? withItems(w, next) : w
    }

    case 'set_text_size': {
      const ids = existing(w.doc, action.ids)
      const next = items.map((item) => (ids.includes(item.id) && item.kind === 'text' && item.size !== action.size ? { ...item, size: action.size } : item))
      return next.some((item, index) => item !== items[index]) ? withItems(w, next) : w
    }

    case 'set_connector': {
      const arrow = items.find((item) => item.id === action.id)
      if (!arrow || !isConnector(arrow)) return w
      const from = action.patch.from ? fitEnd(action.patch.from, items) : arrow.from
      const to = action.patch.to ? fitEnd(action.patch.to, items) : arrow.to
      // An arrow cannot start and end on the same thing, and an end that cannot be is refused.
      if (!from || !to || (attachedTo(from) !== null && attachedTo(from) === attachedTo(to))) return w
      const next: ConnectorItem = { ...arrow, from, to, style: action.patch.style ?? arrow.style, head: action.patch.head ?? arrow.head }
      return stable(next) === stable(arrow) ? w : withItems(w, items.map((item) => (item.id === arrow.id ? next : item)))
    }

    case 'reorder': {
      const ids = existing(w.doc, action.ids)
      if (ids.length === 0) return w
      // Within its own layer: a frame goes among the frames, an arrow among the arrows, and the rest among the rest.
      const layers = [items.filter(isFrame), items.filter(isConnector), items.filter(isNode)].map((layer) => {
        const picked = layer.filter((item) => ids.includes(item.id))
        if (picked.length === 0 || picked.length === layer.length) return layer
        const rest = layer.filter((item) => !ids.includes(item.id))
        if (action.to === 'front') return [...rest, ...picked]
        if (action.to === 'back') return [...picked, ...rest]
        const order = [...layer]
        if (action.to === 'forward') {
          for (let i = order.length - 2; i >= 0; i--) if (ids.includes(order[i].id) && !ids.includes(order[i + 1].id)) [order[i], order[i + 1]] = [order[i + 1], order[i]]
        } else {
          for (let i = 1; i < order.length; i++) if (ids.includes(order[i].id) && !ids.includes(order[i - 1].id)) [order[i], order[i - 1]] = [order[i - 1], order[i]]
        }
        return order
      })
      const next = layers.flat()
      return next.every((item, index) => item === items[index]) ? w : { ...w, doc: { ...w.doc, items: next } }
    }

    case 'delete': {
      const asked = existing(w.doc, action.ids)
      if (asked.length === 0) return w
      // A frame's contents are taken with it only when that is asked for.
      const gone = new Set(action.contents ? expandWithMembers(items, asked).concat(asked) : asked)
      for (const arrow of arrowsOn(items, [...gone])) gone.add(arrow.id)
      return { ...withItems(w, items.filter((item) => !gone.has(item.id))), selection: w.selection.filter((id) => !gone.has(id)) }
    }

    case 'select': {
      const ids = existing(w.doc, action.ids)
      const mode = action.mode ?? 'replace'
      const selection =
        mode === 'replace' ? ids
        : mode === 'add' ? [...w.selection, ...ids.filter((id) => !w.selection.includes(id))]
        : [...w.selection.filter((id) => !ids.includes(id)), ...ids.filter((id) => !w.selection.includes(id))]
      return selection.join() === w.selection.join() ? w : { ...w, selection }
    }

    case 'select_all':
      return { ...w, selection: items.map((item) => item.id) }

    case 'set_tool':
      return w.tool === action.tool ? w : { ...w, tool: action.tool }

    case 'set_note_colour':
      return w.noteColour === action.colour ? w : { ...w, noteColour: action.colour }

    case 'set_shape_kind':
      return w.shapeKind === action.shape ? w : { ...w, shapeKind: action.shape }

    case 'set_connector_style':
      return w.connectorStyle === action.style ? w : { ...w, connectorStyle: action.style }

    case 'batch':
      return action.actions.reduce(step, w)

    case 'undo':
    case 'redo':
      return w

    default: {
      if (!isArrangementAction(action)) return w
      const doc = reduceArrangement(BOARD_SPEC, w.doc, action)
      return doc === w.doc ? w : { ...w, doc }
    }
  }
}

// Typing in one thing is one step, not one per letter.
function mergeKey(action: BoardAction): string | null {
  if (action.type === 'set_text') return `text-${action.id}`
  if (action.type === 'set_title') return `title-${action.id}`
  return null
}

export function reduceBoard(state: BoardState, action: BoardAction): BoardState {
  if (action.type === 'undo' || action.type === 'redo') {
    const history = action.type === 'undo' ? undo(state.history) : redo(state.history)
    if (history === state.history) return state
    // What was selected may be gone now, or may be back, so only what is on the board stays selected.
    return { ...state, history, selection: existing(history.present, state.selection) }
  }
  const before: Working = { doc: state.history.present, selection: state.selection, tool: state.tool, noteColour: state.noteColour, shapeKind: state.shapeKind, connectorStyle: state.connectorStyle }
  const after = step(before, action)
  if (after === before) return state
  const history = commit(state.history, after.doc, mergeKey(action))
  return { history, selection: existing(after.doc, after.selection), tool: after.tool, noteColour: after.noteColour, shapeKind: after.shapeKind, connectorStyle: after.connectorStyle }
}

// The members of a frame, for the interface: what is inside it, which is what moves with it.
export const holds = (doc: BoardDoc, frameId: string) => {
  const frame = doc.items.find((item) => item.id === frameId)
  return frame && isFrame(frame) ? membersOf(doc.items, frame) : []
}
