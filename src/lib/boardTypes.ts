import type { Rect, Size } from './boardGeometry.ts'

// What can be on the board. Notes, shapes, text labels and frames are rectangles. A connector is not: it is an arrow between two ends, and
// each end is on a thing (and follows it when it moves) or at a point of its own.

// ---- Colours ----

// The colours a founder chooses from for a note, and pink, which is Droplet's: a note in pink was written by the AI, so it can be told at a glance.
export const FOUNDER_COLOURS = ['yellow', 'mint', 'sky', 'lilac', 'peach', 'grey'] as const
export type FounderColour = (typeof FOUNDER_COLOURS)[number]
export const NOTE_COLOURS = [...FOUNDER_COLOURS, 'pink'] as const
export type NoteColour = (typeof NOTE_COLOURS)[number]

// Shapes and frames are white to begin with, and can be given any of the founder's colours. Pink is not one of them.
export const SHAPE_COLOURS = ['white', ...FOUNDER_COLOURS] as const
export type ShapeColour = (typeof SHAPE_COLOURS)[number]

export const COLOUR_LABELS: Record<NoteColour | ShapeColour, string> = {
  white: 'White',
  yellow: 'Yellow',
  mint: 'Mint',
  sky: 'Sky',
  lilac: 'Lilac',
  peach: 'Peach',
  grey: 'Grey',
  pink: 'Pink',
}

// ---- Kinds ----

export const SHAPE_KINDS = ['rectangle', 'rounded', 'ellipse', 'diamond'] as const
export type ShapeKind = (typeof SHAPE_KINDS)[number]
export const SHAPE_LABELS: Record<ShapeKind, string> = { rectangle: 'Rectangle', rounded: 'Rounded rectangle', ellipse: 'Ellipse', diamond: 'Diamond' }

export const TEXT_SIZES = ['body', 'title'] as const
export type TextSize = (typeof TEXT_SIZES)[number]
export const TEXT_SIZE_LABELS: Record<TextSize, string> = { body: 'Text', title: 'Title' }

export const CONNECTOR_STYLES = ['straight', 'elbow'] as const
export type ConnectorStyle = (typeof CONNECTOR_STYLES)[number]
export const CONNECTOR_STYLE_LABELS: Record<ConnectorStyle, string> = { straight: 'Straight', elbow: 'Elbow' }

// Which ends of an arrow have a head.
export const CONNECTOR_HEADS = ['end', 'both', 'none'] as const
export type ConnectorHead = (typeof CONNECTOR_HEADS)[number]
export const CONNECTOR_HEAD_LABELS: Record<ConnectorHead, string> = { end: 'Arrow at the end', both: 'Arrows at both ends', none: 'No arrows' }

// ---- Items ----

// What every thing on the board can carry besides its own parts. `starred` is the founder's "keep in mind": Droplet's notes on the project always include it. A `group` says which template put it there (see boardTemplates.ts): every
// thing from one use of a template has the same group, which is how a template can be reset. A `hint` is a faint prompt shown in a note,
// shape or text label while it has nothing written in it, and gone once it has.
type Common = { group?: string; starred?: boolean }
type Hinted = { hint?: string }

export type NoteItem = Rect & Common & Hinted & {
  id: string
  kind: 'note'
  text: string
  colour: NoteColour
  // Who wrote it: the founder, or Droplet when it was asked to.
  author: 'you' | 'ai'
}

export type ShapeItem = Rect & Common & Hinted & { id: string; kind: 'shape'; shape: ShapeKind; text: string; colour: ShapeColour }

// Words on the board with nothing behind them.
export type TextItem = Rect & Common & Hinted & { id: string; kind: 'text'; text: string; size: TextSize }

// A labelled area that groups what is inside it. What is inside is not stored: it is whatever has its middle in the frame, so the frame
// and what it holds move together, and moving a note out of it takes it out.
export type FrameItem = Rect & Common & { id: string; kind: 'frame'; title: string; colour: ShapeColour }

// One end of an arrow: on a thing, which it follows, or at a point of its own.
export type End = { item: string } | { x: number; y: number }

export type ConnectorItem = Common & {
  id: string
  kind: 'connector'
  from: End
  to: End
  style: ConnectorStyle
  head: ConnectorHead
  // A label on the arrow. Empty for none.
  text: string
}

export type BoardItem = NoteItem | ShapeItem | TextItem | FrameItem | ConnectorItem
export type RectItem = NoteItem | ShapeItem | TextItem | FrameItem
// What an arrow can be attached to, and what a frame can hold.
export type NodeItem = NoteItem | ShapeItem | TextItem

export const isConnector = (item: BoardItem): item is ConnectorItem => item.kind === 'connector'
export const isFrame = (item: BoardItem): item is FrameItem => item.kind === 'frame'
export const isRectItem = (item: BoardItem): item is RectItem => item.kind !== 'connector'
export const isNode = (item: BoardItem): item is NodeItem => item.kind === 'note' || item.kind === 'shape' || item.kind === 'text'
export const hasText = (item: BoardItem): item is NoteItem | ShapeItem | TextItem | ConnectorItem => item.kind !== 'frame'
export const attachedTo = (end: End): string | null => ('item' in end ? end.item : null)

export const rectOf = (item: RectItem): Rect => ({ x: item.x, y: item.y, w: item.w, h: item.h })

// ---- Limits ----

export const MAX_ITEMS = 500
export const MAX_NOTE_TEXT = 600
export const MAX_TEXT = 600
export const MAX_TITLE = 80
export const MAX_LABEL = 60
export const MAX_HINT = 120
export const MAX_GROUP = 80

// The size a thing starts, and the least and most it can be.
export type SizeLimits = { start: Size; min: Size; max: Size }
export const SIZE_LIMITS: Record<RectItem['kind'], SizeLimits> = {
  note: { start: { w: 200, h: 180 }, min: { w: 120, h: 100 }, max: { w: 600, h: 600 } },
  shape: { start: { w: 200, h: 140 }, min: { w: 80, h: 60 }, max: { w: 1200, h: 900 } },
  text: { start: { w: 240, h: 60 }, min: { w: 80, h: 40 }, max: { w: 1200, h: 600 } },
  frame: { start: { w: 480, h: 360 }, min: { w: 160, h: 120 }, max: { w: 4800, h: 3200 } },
}

// What an item says in words, for a screen reader.
export function describeItem(item: BoardItem, items: BoardItem[] = []): string {
  const name = (end: End) => {
    const id = attachedTo(end)
    const target = id ? items.find((other) => other.id === id) : null
    const words = target && isRectItem(target) ? (isFrame(target) ? target.title : target.text).trim() : ''
    return id ? words || 'an item' : 'a point'
  }
  switch (item.kind) {
    case 'note':
      return `${item.text.trim() || (item.hint ? `Empty note, ${item.hint}` : 'Empty note')}${item.author === 'ai' ? ', written by Droplet' : ''}`
    case 'shape':
      return `${SHAPE_LABELS[item.shape]}${item.text.trim() ? `: ${item.text.trim()}` : item.hint ? `, empty, ${item.hint}` : ', empty'}`
    case 'text':
      return item.text.trim() || (item.hint ? `Empty text, ${item.hint}` : 'Empty text')
    case 'frame':
      return `Frame: ${item.title.trim() || 'untitled'}`
    case 'connector':
      return `Arrow from ${name(item.from)} to ${name(item.to)}${item.text.trim() ? `, labelled ${item.text.trim()}` : ''}`
  }
}
