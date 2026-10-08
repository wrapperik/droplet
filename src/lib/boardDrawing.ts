import { boundsOf, type Point, type Rect } from './boardGeometry.ts'
import { connectorPath } from './boardConnectors.ts'
import { rectOf, type BoardItem, type ConnectorItem, type FrameItem, type NoteItem, type ShapeItem, type TextItem } from './boardTypes.ts'

// The board as a list of simple marks (boxes, ellipses, lines, words) in board units, for the PNG and the PDF to draw. The same list feeds both,
// so the two files show the same board. Nothing here draws or reads the screen, so every rule can be tested.

// What a file is drawn in. Notes are paper, so these are the notes' own colours (checked against tokens.css by a test), with Ink on them and Slate
// for what is quiet. A file is not on a themed screen, so it does not follow the theme.
export const PAPER = '#FFFFFF'
export const INK = '#0E1A2B'
export const SLATE = '#4A5A70'
export const NOTE_HEX = {
  yellow: '#FFF1A8',
  mint: '#C9F0D8',
  sky: '#CFE6FB',
  lilac: '#E0D7F8',
  peach: '#FFD9BF',
  grey: '#E3E8EE',
  pink: '#FFCFE0',
  white: '#FFFFFF',
} as const

const channels = (hex: string) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16))
const toHex = (values: number[]) => `#${values.map((value) => Math.round(value).toString(16).padStart(2, '0')).join('').toUpperCase()}`

// A colour at a share of full strength over another one: what a see-through fill looks like on paper.
export const mix = (top: string, share: number, under: string = PAPER) => {
  const [a, b] = [channels(top), channels(under)]
  return toHex(a.map((value, index) => value * share + b[index] * (1 - share)))
}

export type Mark =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; radius: number; fill: string | null; stroke: string | null; strokeWidth: number }
  | { kind: 'ellipse'; x: number; y: number; w: number; h: number; fill: string | null; stroke: string | null; strokeWidth: number }
  | { kind: 'polygon'; points: Point[]; fill: string | null; stroke: string | null; strokeWidth: number }
  | { kind: 'line'; points: Point[]; stroke: string; strokeWidth: number }
  // The words in a box, set at a size, wrapped to the box's width.
  | { kind: 'text'; x: number; y: number; w: number; h: number; text: string; size: number; bold: boolean; colour: string; align: 'left' | 'centre'; middle: boolean; lineHeight: number }

export type Drawing = {
  // The size of the picture, in board units, which includes a margin around everything.
  width: number
  height: number
  marks: Mark[]
}

export const MARGIN = 48
// What is inside a note, a shape and a text, matching the board: the size of the words and the room around them.
const NOTE_PAD = { x: 16, y: 14 }
const NOTE_SIZE = 18
const SHAPE_SIZE = 18
const TEXT_SIZES = { body: 22, title: 44 } as const
const FRAME_TITLE = 20
const FRAME_TITLE_GAP = 8
const AUTHOR_SIZE = 12
const ARROW_HEAD = 14

const isFrameItem = (item: BoardItem): item is FrameItem => item.kind === 'frame'

function frameMarks(frame: FrameItem): Mark[] {
  const fill = frame.colour === 'white' ? mix(INK, 0.04) : mix(NOTE_HEX[frame.colour], 0.38)
  const marks: Mark[] = [{ kind: 'rect', ...rectOf(frame), radius: 10, fill, stroke: mix(SLATE, 0.4), strokeWidth: 2 }]
  if (frame.title.trim() !== '') {
    marks.push({ kind: 'text', x: frame.x, y: frame.y - FRAME_TITLE_GAP - FRAME_TITLE * 1.3, w: frame.w, h: FRAME_TITLE * 1.3, text: frame.title, size: FRAME_TITLE, bold: true, colour: INK, align: 'left', middle: false, lineHeight: 1.3 })
  }
  return marks
}

function noteMarks(note: NoteItem): Mark[] {
  const marks: Mark[] = [{ kind: 'rect', ...rectOf(note), radius: 8, fill: NOTE_HEX[note.colour], stroke: mix(INK, 0.12), strokeWidth: 1 }]
  if (note.text.trim() !== '') {
    marks.push({ kind: 'text', x: note.x + NOTE_PAD.x, y: note.y + NOTE_PAD.y, w: note.w - NOTE_PAD.x * 2, h: note.h - NOTE_PAD.y * 2, text: note.text, size: NOTE_SIZE, bold: false, colour: INK, align: 'left', middle: false, lineHeight: 1.35 })
  }
  // A note by Droplet says so in words, as it does on the board.
  if (note.author === 'ai') {
    marks.push({ kind: 'text', x: note.x + note.w - 14 - 80, y: note.y + note.h - 8 - AUTHOR_SIZE * 1.3, w: 80, h: AUTHOR_SIZE * 1.3, text: 'Droplet', size: AUTHOR_SIZE, bold: true, colour: mix(INK, 0.7, NOTE_HEX[note.colour]), align: 'left', middle: false, lineHeight: 1.3 })
  }
  return marks
}

// The room for words inside a shape: the box for a rectangle, less at the corners of an ellipse and the points of a diamond.
function shapeRoom(shape: ShapeItem): Rect {
  const pad = shape.shape === 'ellipse' ? 0.15 : shape.shape === 'diamond' ? 0.25 : 0.06
  return { x: shape.x + shape.w * pad + 6, y: shape.y + shape.h * pad + 6, w: Math.max(shape.w * (1 - pad * 2) - 12, 0), h: Math.max(shape.h * (1 - pad * 2) - 12, 0) }
}

function shapeMarks(shape: ShapeItem): Mark[] {
  const fill = NOTE_HEX[shape.colour]
  const stroke = mix(INK, 0.6)
  const outline: Mark =
    shape.shape === 'ellipse'
      ? { kind: 'ellipse', x: shape.x, y: shape.y, w: shape.w, h: shape.h, fill, stroke, strokeWidth: 2 }
      : shape.shape === 'diamond'
        ? { kind: 'polygon', points: [{ x: shape.x + shape.w / 2, y: shape.y }, { x: shape.x + shape.w, y: shape.y + shape.h / 2 }, { x: shape.x + shape.w / 2, y: shape.y + shape.h }, { x: shape.x, y: shape.y + shape.h / 2 }], fill, stroke, strokeWidth: 2 }
        : { kind: 'rect', ...rectOf(shape), radius: shape.shape === 'rounded' ? Math.min(shape.w, shape.h) * 0.25 : 0, fill, stroke, strokeWidth: 2 }
  const marks: Mark[] = [outline]
  if (shape.text.trim() !== '') {
    const room = shapeRoom(shape)
    marks.push({ kind: 'text', ...room, text: shape.text, size: SHAPE_SIZE, bold: false, colour: INK, align: 'centre', middle: true, lineHeight: 1.3 })
  }
  return marks
}

function textMarks(item: TextItem): Mark[] {
  if (item.text.trim() === '') return []
  const size = TEXT_SIZES[item.size]
  return [{ kind: 'text', ...rectOf(item), text: item.text, size, bold: item.size === 'title', colour: INK, align: 'left', middle: false, lineHeight: item.size === 'title' ? 1.15 : 1.3 }]
}

// An arrow: its line, and a head at each end it has one, drawn as a filled triangle so the file needs no marker.
function arrowMarks(connector: ConnectorItem, items: BoardItem[]): Mark[] {
  const path = connectorPath(connector, items)
  if (!path || path.points.length < 2) return []
  const { points } = path
  const colour = mix(INK, 0.75)
  const marks: Mark[] = []
  const head = (tip: Point, from: Point): Mark => {
    const angle = Math.atan2(tip.y - from.y, tip.x - from.x)
    const back = { x: tip.x - Math.cos(angle) * ARROW_HEAD, y: tip.y - Math.sin(angle) * ARROW_HEAD }
    const across = { x: -Math.sin(angle) * ARROW_HEAD * 0.45, y: Math.cos(angle) * ARROW_HEAD * 0.45 }
    return { kind: 'polygon', points: [tip, { x: back.x + across.x, y: back.y + across.y }, { x: back.x - across.x, y: back.y - across.y }], fill: colour, stroke: null, strokeWidth: 0 }
  }
  marks.push({ kind: 'line', points, stroke: colour, strokeWidth: 3 })
  if (connector.head !== 'none') marks.push(head(points[points.length - 1], points[points.length - 2]))
  if (connector.head === 'both') marks.push(head(points[0], points[1]))
  if (connector.text.trim() !== '') {
    const width = 160
    marks.push({ kind: 'text', x: path.label.x - width / 2, y: path.label.y - 12, w: width, h: 24, text: connector.text, size: 16, bold: false, colour: INK, align: 'centre', middle: true, lineHeight: 1.3 })
  }
  return marks
}

// Where the marks reach, so the picture is cut to what is on the board rather than the whole board, which is mostly empty.
function reach(marks: Mark[]): Rect | null {
  const rects: Rect[] = marks.map((mark) => {
    if (mark.kind === 'rect' || mark.kind === 'ellipse' || mark.kind === 'text') return { x: mark.x, y: mark.y, w: mark.w, h: mark.h }
    const xs = mark.points.map((point) => point.x)
    const ys = mark.points.map((point) => point.y)
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
  })
  return boundsOf(rects)
}

const shifted = (mark: Mark, dx: number, dy: number): Mark =>
  mark.kind === 'polygon' || mark.kind === 'line' ? { ...mark, points: mark.points.map((point) => ({ x: point.x + dx, y: point.y + dy })) } : { ...mark, x: mark.x + dx, y: mark.y + dy }

// Draws the board as marks, in the order the board layers them: frames at the back, then arrows, then notes, shapes and text in order. Cut to what
// is on it, with a margin, and moved so the top-left is the origin. Null for a board with nothing on it.
export function drawBoard(items: BoardItem[]): Drawing | null {
  if (items.length === 0) return null
  const marks: Mark[] = [
    ...items.filter(isFrameItem).flatMap(frameMarks),
    ...items.filter((item): item is ConnectorItem => item.kind === 'connector').flatMap((connector) => arrowMarks(connector, items)),
    ...items.flatMap((item) => (item.kind === 'note' ? noteMarks(item) : item.kind === 'shape' ? shapeMarks(item) : item.kind === 'text' ? textMarks(item) : [])),
  ]
  const bounds = reach(marks)
  if (!bounds) return null
  const dx = MARGIN - bounds.x
  const dy = MARGIN - bounds.y
  return { width: Math.ceil(bounds.w + MARGIN * 2), height: Math.ceil(bounds.h + MARGIN * 2), marks: marks.map((mark) => shifted(mark, dx, dy)) }
}

// Breaks words into lines no wider than `width`, a paragraph at a time and a word at a time. A word wider than a line is cut where it overflows.
// `measure` says how wide a piece of text is, so the same rule serves a canvas and a test.
export function wrapLines(text: string, width: number, measure: (text: string) => number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    let line = ''
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const tryLine = line === '' ? word : `${line} ${word}`
      if (measure(tryLine) <= width) {
        line = tryLine
        continue
      }
      if (line !== '') lines.push(line)
      let rest = word
      while (measure(rest) > width && rest.length > 1) {
        let cut = rest.length - 1
        while (cut > 1 && measure(rest.slice(0, cut)) > width) cut--
        lines.push(rest.slice(0, cut))
        rest = rest.slice(cut)
      }
      line = rest
    }
    lines.push(line)
  }
  return lines
}

// The minimal drawing surface the PNG needs, so the painting can be tested with a stand-in.
export type Surface = {
  fillStyle: string | CanvasGradient | CanvasPattern
  strokeStyle: string | CanvasGradient | CanvasPattern
  lineWidth: number
  lineJoin: CanvasLineJoin
  lineCap: CanvasLineCap
  font: string
  textBaseline: CanvasTextBaseline
  textAlign: CanvasTextAlign
  fillRect(x: number, y: number, w: number, h: number): void
  beginPath(): void
  closePath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void
  ellipse(x: number, y: number, rx: number, ry: number, rotation: number, start: number, end: number): void
  fill(): void
  stroke(): void
  fillText(text: string, x: number, y: number): void
  measureText(text: string): { width: number }
  save(): void
  restore(): void
  clip(): void
  rect(x: number, y: number, w: number, h: number): void
}

const FONT = 'Google Sans Variable, Helvetica, Arial, sans-serif'

function roundedRect(surface: Surface, x: number, y: number, w: number, h: number, radius: number) {
  const r = Math.min(radius, w / 2, h / 2)
  surface.beginPath()
  surface.moveTo(x + r, y)
  surface.arcTo(x + w, y, x + w, y + h, r)
  surface.arcTo(x + w, y + h, x, y + h, r)
  surface.arcTo(x, y + h, x, y, r)
  surface.arcTo(x, y, x + w, y, r)
  surface.closePath()
}

function paintShape(surface: Surface, fill: string | null, stroke: string | null, strokeWidth: number) {
  if (fill) {
    surface.fillStyle = fill
    surface.fill()
  }
  if (stroke && strokeWidth > 0) {
    surface.strokeStyle = stroke
    surface.lineWidth = strokeWidth
    surface.stroke()
  }
}

// Paints a drawing onto a surface at a scale, on a paper background. Words that do not fit their box are cut off at its edge, as on the board.
export function paintDrawing(surface: Surface, drawing: Drawing, scale = 1) {
  surface.fillStyle = PAPER
  surface.fillRect(0, 0, drawing.width * scale, drawing.height * scale)
  surface.lineJoin = 'round'
  surface.lineCap = 'round'
  for (const mark of drawing.marks) {
    const s = (value: number) => value * scale
    if (mark.kind === 'rect') {
      roundedRect(surface, s(mark.x), s(mark.y), s(mark.w), s(mark.h), s(mark.radius))
      paintShape(surface, mark.fill, mark.stroke, s(mark.strokeWidth))
    } else if (mark.kind === 'ellipse') {
      surface.beginPath()
      surface.ellipse(s(mark.x + mark.w / 2), s(mark.y + mark.h / 2), s(mark.w / 2), s(mark.h / 2), 0, 0, Math.PI * 2)
      paintShape(surface, mark.fill, mark.stroke, s(mark.strokeWidth))
    } else if (mark.kind === 'polygon' || mark.kind === 'line') {
      surface.beginPath()
      mark.points.forEach((point, index) => (index === 0 ? surface.moveTo(s(point.x), s(point.y)) : surface.lineTo(s(point.x), s(point.y))))
      if (mark.kind === 'polygon') {
        surface.closePath()
        paintShape(surface, mark.fill, mark.stroke, s(mark.strokeWidth))
      } else {
        paintShape(surface, null, mark.stroke, s(mark.strokeWidth))
      }
    } else {
      surface.save()
      surface.beginPath()
      surface.rect(s(mark.x), s(mark.y), s(mark.w), s(mark.h))
      surface.clip()
      surface.font = `${mark.bold ? 600 : 400} ${s(mark.size)}px ${FONT}`
      surface.fillStyle = mark.colour
      surface.textBaseline = 'top'
      surface.textAlign = mark.align === 'centre' ? 'center' : 'left'
      const lines = wrapLines(mark.text, s(mark.w), (text) => surface.measureText(text).width)
      const step = s(mark.size * mark.lineHeight)
      const top = mark.middle ? s(mark.y) + Math.max((s(mark.h) - step * lines.length) / 2, 0) : s(mark.y)
      const left = mark.align === 'centre' ? s(mark.x + mark.w / 2) : s(mark.x)
      lines.forEach((line, index) => surface.fillText(line, left, top + step * index))
      surface.restore()
    }
  }
}
