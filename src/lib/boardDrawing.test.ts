import { describe, expect, it } from 'vitest'
import { INK, MARGIN, NOTE_HEX, PAPER, SLATE, drawBoard, mix, paintDrawing, wrapLines, type Mark, type Surface } from './boardDrawing.ts'
import type { BoardItem, ConnectorItem, NoteItem, ShapeItem } from './boardTypes.ts'

const note = (id: string, x: number, y: number, extra: Partial<NoteItem> = {}): NoteItem => ({ id, kind: 'note', x, y, w: 200, h: 180, text: id, colour: 'yellow', author: 'you', ...extra })
const shape = (id: string, x: number, y: number, kind: ShapeItem['shape'] = 'rectangle', extra: Partial<ShapeItem> = {}): ShapeItem => ({ id, kind: 'shape', shape: kind, x, y, w: 200, h: 140, text: id, colour: 'white', ...extra })
const frame = (id: string, x: number, y: number, title = 'Frame'): BoardItem => ({ id, kind: 'frame', x, y, w: 800, h: 600, title, colour: 'white' })
const arrow = (id: string, from: string, to: string, extra: Partial<ConnectorItem> = {}): ConnectorItem => ({ id, kind: 'connector', from: { item: from }, to: { item: to }, style: 'straight', head: 'end', text: '', ...extra })
const kinds = (marks: Mark[]) => marks.map((mark) => mark.kind)

describe('the colours of a file', () => {
  it('are the colours of the notes in tokens.css, and Ink and Slate, so a file looks like the board', async () => {
    // @ts-expect-error node:fs has no types here, and this test is the only reader of it
    const { readFileSync } = await import('node:fs')
    const css: string = readFileSync('src/styles/tokens.css', 'utf8')
    for (const [name, hex] of Object.entries(NOTE_HEX)) expect(css.toLowerCase(), name).toContain(`--note-${name}: ${hex.toLowerCase()};`)
    expect(css.toLowerCase()).toContain(`--ink: ${INK.toLowerCase()};`)
    expect(css.toLowerCase()).toContain(`--slate: ${SLATE.toLowerCase()};`)
    expect(PAPER).toBe('#FFFFFF')
  })

  it('mix a colour over paper by a share', () => {
    expect(mix('#000000', 0.5, '#FFFFFF')).toBe('#808080')
    expect(mix('#FF0000', 1)).toBe('#FF0000')
    expect(mix('#FF0000', 0)).toBe('#FFFFFF')
  })
})

describe('drawing the board', () => {
  it('has nothing to draw for an empty board', () => {
    expect(drawBoard([])).toBeNull()
  })

  it('is cut to what is on the board with a margin, and starts at the top-left, however far in the board it was', () => {
    const drawing = drawBoard([note('a', 2000, 1500)])!
    expect(drawing.width).toBe(200 + MARGIN * 2)
    expect(drawing.height).toBe(180 + MARGIN * 2)
    const box = drawing.marks[0]
    expect(box).toMatchObject({ kind: 'rect', x: MARGIN, y: MARGIN, w: 200, h: 180 })
  })

  it('moves everything the same distance, so nothing shifts against anything else', () => {
    const items = [note('a', 1000, 1000), note('b', 1400, 1100)]
    const drawing = drawBoard(items)!
    const rects = drawing.marks.filter((mark) => mark.kind === 'rect') as Extract<Mark, { kind: 'rect' }>[]
    expect(rects[1].x - rects[0].x).toBe(400)
    expect(rects[1].y - rects[0].y).toBe(100)
  })

  it('draws a note in its colour with its words, and a note by Droplet with the word Droplet on it', () => {
    const drawing = drawBoard([note('mine', 0, 0, { text: 'Gift boxes', colour: 'mint' }), note('theirs', 400, 0, { text: 'An idea', colour: 'pink', author: 'ai' })])!
    expect(drawing.marks.find((mark) => mark.kind === 'rect' && mark.fill === NOTE_HEX.mint)).toBeDefined()
    expect(drawing.marks.find((mark) => mark.kind === 'rect' && mark.fill === NOTE_HEX.pink)).toBeDefined()
    const words = drawing.marks.filter((mark): mark is Extract<Mark, { kind: 'text' }> => mark.kind === 'text').map((mark) => mark.text)
    expect(words).toEqual(['Gift boxes', 'An idea', 'Droplet'])
  })

  it('leaves out the words of a note with none, and of a shape or text with only spaces', () => {
    const drawing = drawBoard([note('a', 0, 0, { text: '' }), shape('s', 400, 0, 'rectangle', { text: '   ' }), { id: 't', kind: 'text', x: 800, y: 0, w: 240, h: 60, text: '', size: 'body' }])!
    expect(kinds(drawing.marks)).toEqual(['rect', 'rect'])
  })

  it('draws each kind of shape as its own outline, a diamond as a polygon of four points', () => {
    const drawing = drawBoard([shape('a', 0, 0, 'rectangle'), shape('b', 300, 0, 'rounded'), shape('c', 600, 0, 'ellipse'), shape('d', 900, 0, 'diamond')])!
    const outlines = drawing.marks.filter((mark) => mark.kind !== 'text')
    expect(kinds(outlines)).toEqual(['rect', 'rect', 'ellipse', 'polygon'])
    expect((outlines[0] as Extract<Mark, { kind: 'rect' }>).radius).toBe(0)
    expect((outlines[1] as Extract<Mark, { kind: 'rect' }>).radius).toBeGreaterThan(0)
    expect((outlines[3] as Extract<Mark, { kind: 'polygon' }>).points).toHaveLength(4)
  })

  it('fills a coloured shape with its colour, and only the shape, not a box around a diamond', () => {
    const drawing = drawBoard([shape('d', 0, 0, 'diamond', { colour: 'sky' })])!
    expect(drawing.marks.filter((mark) => mark.kind === 'polygon')).toHaveLength(1)
    expect(drawing.marks.filter((mark) => mark.kind === 'rect')).toHaveLength(0)
    expect(drawing.marks[0]).toMatchObject({ fill: NOTE_HEX.sky })
  })

  it('keeps the words of a shape inside its outline, with less room in an ellipse and a diamond than in a box', () => {
    const room = (kind: ShapeItem['shape']) => (drawBoard([shape('a', 0, 0, kind)])!.marks.find((mark) => mark.kind === 'text') as Extract<Mark, { kind: 'text' }>).w
    expect(room('ellipse')).toBeLessThan(room('rectangle'))
    expect(room('diamond')).toBeLessThan(room('ellipse'))
    expect(room('rectangle')).toBeLessThan(200)
  })

  it('puts a frame at the back with its title above it, and counts the title in what it reaches', () => {
    const drawing = drawBoard([note('a', 100, 100), frame('f', 0, 100, 'The idea')])!
    expect(drawing.marks[0]).toMatchObject({ kind: 'rect', w: 800, h: 600 })
    const title = drawing.marks.find((mark) => mark.kind === 'text' && mark.text === 'The idea') as Extract<Mark, { kind: 'text' }>
    const back = drawing.marks[0] as Extract<Mark, { kind: 'rect' }>
    expect(title.y + title.h).toBeLessThan(back.y)
    expect(title.y).toBeGreaterThanOrEqual(MARGIN - 0.001)
  })

  it('draws an arrow as a line with a head, and two heads for a two-way arrow, and none for a plain line', () => {
    const two = [note('a', 0, 0), note('b', 600, 0)]
    expect(kinds(drawBoard([...two, arrow('x', 'a', 'b')])!.marks).filter((kind) => kind === 'line' || kind === 'polygon')).toEqual(['line', 'polygon'])
    expect(kinds(drawBoard([...two, arrow('x', 'a', 'b', { head: 'both' })])!.marks).filter((kind) => kind === 'polygon')).toHaveLength(2)
    expect(kinds(drawBoard([...two, arrow('x', 'a', 'b', { head: 'none' })])!.marks).filter((kind) => kind === 'polygon')).toHaveLength(0)
  })

  it('draws the head of an arrow at the thing it points to, and puts the label on the line', () => {
    const drawing = drawBoard([note('a', 0, 0), note('b', 600, 0), arrow('x', 'a', 'b', { text: 'then' })])!
    const head = drawing.marks.find((mark) => mark.kind === 'polygon') as Extract<Mark, { kind: 'polygon' }>
    const left = MARGIN + 600
    expect(head.points[0].x).toBeCloseTo(left, 0)
    expect(drawing.marks.some((mark) => mark.kind === 'text' && mark.text === 'then')).toBe(true)
  })

  it('leaves out an arrow whose end is on something that is gone, instead of failing', () => {
    const drawing = drawBoard([note('a', 0, 0), arrow('x', 'a', 'gone')])!
    expect(kinds(drawing.marks)).toEqual(['rect', 'text'])
  })

  it('layers frames, then arrows, then the rest, whatever order they are in', () => {
    const drawing = drawBoard([note('a', 100, 100), note('b', 700, 100), arrow('x', 'a', 'b'), frame('f', 0, 0)])!
    const order = drawing.marks.map((mark) => (mark.kind === 'rect' && mark.w === 800 ? 'frame' : mark.kind === 'line' ? 'arrow' : mark.kind === 'rect' ? 'note' : null)).filter(Boolean)
    expect(order).toEqual(['frame', 'arrow', 'note', 'note'])
  })
})

describe('wrapping words', () => {
  const measure = (text: string) => text.length * 10

  it('breaks at spaces so no line is wider than the room', () => {
    expect(wrapLines('one two three four', 90, measure)).toEqual(['one two', 'three', 'four'])
  })

  it('keeps a new line the founder wrote, even an empty one', () => {
    expect(wrapLines('one\n\ntwo', 200, measure)).toEqual(['one', '', 'two'])
  })

  it('cuts a word that is wider than a line, instead of running off it', () => {
    const lines = wrapLines('abcdefghij', 40, measure)
    expect(lines.every((line) => measure(line) <= 40)).toBe(true)
    expect(lines.join('')).toBe('abcdefghij')
  })

  it('gives one empty line for no words', () => {
    expect(wrapLines('', 100, measure)).toEqual([''])
  })
})

describe('painting', () => {
  // A surface that writes down what it was asked to do.
  function fake() {
    const calls: string[] = []
    const surface = {
      fillStyle: '', strokeStyle: '', lineWidth: 0, lineJoin: 'miter', lineCap: 'butt', font: '', textBaseline: 'alphabetic', textAlign: 'start',
      fillRect: (...a: number[]) => calls.push(`fillRect ${a.join(' ')}`),
      beginPath: () => calls.push('beginPath'), closePath: () => calls.push('closePath'),
      moveTo: () => calls.push('moveTo'), lineTo: () => calls.push('lineTo'), arcTo: () => calls.push('arcTo'), ellipse: () => calls.push('ellipse'),
      fill: () => calls.push(`fill ${surface.fillStyle}`), stroke: () => calls.push(`stroke ${surface.strokeStyle}`),
      fillText: (text: string) => calls.push(`text ${text}`), measureText: (text: string) => ({ width: text.length * 8 }),
      save: () => calls.push('save'), restore: () => calls.push('restore'), clip: () => calls.push('clip'), rect: () => calls.push('rect'),
    }
    return { surface: surface as unknown as Surface, calls }
  }

  it('lays paper down first, over all of the picture at its scale', () => {
    const { surface, calls } = fake()
    const drawing = drawBoard([note('a', 0, 0)])!
    paintDrawing(surface, drawing, 2)
    expect(calls[0]).toBe(`fillRect 0 0 ${drawing.width * 2} ${drawing.height * 2}`)
  })

  it('fills a note in its colour, and writes its words', () => {
    const { surface, calls } = fake()
    paintDrawing(surface, drawBoard([note('a', 0, 0, { text: 'Gift boxes', colour: 'peach' })])!)
    expect(calls).toContain(`fill ${NOTE_HEX.peach}`)
    expect(calls).toContain('text Gift boxes')
  })

  it('clips the words to their box, so long ones do not run over the next thing', () => {
    const { surface, calls } = fake()
    paintDrawing(surface, drawBoard([note('a', 0, 0)])!)
    const at = calls.indexOf('save')
    expect(calls.slice(at, at + 5)).toEqual(['save', 'beginPath', 'rect', 'clip', 'text a'])
    expect(calls[calls.length - 1]).toBe('restore')
  })

  it('wraps the words to the box, a line at a time', () => {
    const { surface, calls } = fake()
    paintDrawing(surface, drawBoard([note('a', 0, 0, { text: 'one two three four five six seven eight nine ten eleven twelve' })])!)
    expect(calls.filter((call) => call.startsWith('text ')).length).toBeGreaterThan(1)
  })

  it('draws an ellipse with the ellipse call, a diamond and an arrow with lines', () => {
    const { surface, calls } = fake()
    paintDrawing(surface, drawBoard([shape('a', 0, 0, 'ellipse'), shape('d', 400, 0, 'diamond'), arrow('x', 'a', 'd')])!)
    expect(calls).toContain('ellipse')
    expect(calls.filter((call) => call === 'lineTo').length).toBeGreaterThan(3)
  })
})
