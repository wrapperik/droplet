import { describe, expect, it } from 'vitest'
import type { BoardItem } from './boardTypes.ts'
import { dismissKey, hintsFor, LOOSE_NOTES_NUDGE, MAX_HINTS, nudgesFor, placeholderFor, selectionLabel, type Room } from './composerHints.ts'

const note = (id: string, text = 'Idea', x = 0, y = 0): BoardItem => ({ id, kind: 'note', x, y, w: 200, h: 180, text, colour: 'yellow', author: 'you' })
const frame: BoardItem = { id: 'f', kind: 'frame', x: 4000, y: 2000, w: 400, h: 300, title: 'Names', colour: 'white' }
const arrow: BoardItem = { id: 'a', kind: 'connector', from: { x: 0, y: 0 }, to: { x: 10, y: 10 }, style: 'straight', head: 'end', text: '' }
const board = (items: BoardItem[], selected: BoardItem[] = []): Room => ({ view: 'board', board: { items, selected } })
const manyNotes = (count: number) => Array.from({ length: count }, (_, i) => note(`n${i}`, `Idea ${i}`, (i % 4) * 220, Math.floor(i / 4) * 200))

describe('the placeholder', () => {
  it('follows what is selected on the board', () => {
    expect(placeholderFor(board([note('a')], [note('a')]))).toBe('Ask about the selected note')
    expect(placeholderFor(board([note('a'), note('b'), note('c')], [note('a'), note('b')]))).toBe('Ask about the 2 selected notes')
    expect(placeholderFor(board([frame], [frame]))).toBe('Ask about the selected frame')
  })

  it('invites the first thing on an empty board, and ideas on a full one', () => {
    expect(placeholderFor(board([]))).toMatch(/start the board/)
    expect(placeholderFor(board([note('a')]))).toMatch(/group or tidy/)
  })

  it('asks who the invoice is for until the client is named', () => {
    expect(placeholderFor({ view: 'invoice', invoice: { clientNamed: false, number: 'INV-0001' } })).toBe('Who is this invoice for?')
    expect(placeholderFor({ view: 'invoice', invoice: { clientNamed: true, number: 'INV-0001' } })).toBe('Add a line, or change the terms')
  })

  it('asks for the feeling in the palette, or about the selected colour', () => {
    expect(placeholderFor({ view: 'brand' })).toBe('Describe the feeling you want')
    expect(placeholderFor({ view: 'brand', palette: { blocks: [], selectedPosition: 3 } })).toBe('Ask about colour 3, or describe the feeling you want')
  })

  it('is the usual words where no workspace is open', () => {
    expect(placeholderFor({})).toBe('Write your message...')
  })
})

describe('the selection chip', () => {
  it('says what is selected on the board', () => {
    expect(selectionLabel(board([note('a')], [note('a')]))).toBe('1 note selected')
    expect(selectionLabel(board([note('a'), note('b')], [note('a'), note('b')]))).toBe('2 notes selected')
    expect(selectionLabel(board([frame], [frame]))).toBe('1 frame selected')
    expect(selectionLabel(board([frame, note('a')], [frame, note('a')]))).toBe('2 things selected')
    expect(selectionLabel(board([arrow], [arrow]))).toBe('1 arrow selected')
  })

  it('is nothing when nothing is selected, or off the board', () => {
    expect(selectionLabel(board([note('a')]))).toBeNull()
    expect(selectionLabel({ view: 'brand' })).toBeNull()
  })
})

describe('nudges', () => {
  const failing = [{ id: 1, hex: '#777777', role: 'text' as const }, { id: 2, hex: '#888888', role: 'background' as const }]
  const passing = [{ id: 1, hex: '#0E1A2B', role: 'text' as const }, { id: 2, hex: '#F4F8FB', role: 'background' as const }]

  it('offers to fix the contrast when the text on the background fails', () => {
    expect(nudgesFor({ view: 'brand', palette: { blocks: failing } }).map((nudge) => nudge.label)).toEqual(['Fix the contrast?'])
    expect(nudgesFor({ view: 'brand', palette: { blocks: passing } })).toEqual([])
  })

  it('offers to group the notes once there are twelve loose ones, and not before, and not ones in a frame', () => {
    expect(nudgesFor(board(manyNotes(LOOSE_NOTES_NUDGE - 1)))).toEqual([])
    expect(nudgesFor(board(manyNotes(LOOSE_NOTES_NUDGE))).map((nudge) => nudge.label)).toEqual(['Group these?'])
    const inFrame = manyNotes(LOOSE_NOTES_NUDGE).map((item, i) => ({ ...item, x: 4050 + (i % 2) * 10, y: 2050 }) as BoardItem)
    expect(nudgesFor(board([frame, ...inFrame]))).toEqual([])
  })

  it('offers to export an invoice that is ready and not exported', () => {
    expect(nudgesFor({ view: 'invoice', exportable: { number: 'INV-0007' } }).map((nudge) => nudge.label)).toEqual(['Export INV-0007?'])
    expect(nudgesFor({ view: 'invoice', exportable: null })).toEqual([])
    expect(nudgesFor({ exportable: { number: 'INV-0007' } })).toEqual([])
  })

  it('send an ordinary request when pressed, and never act', () => {
    for (const nudge of nudgesFor({ view: 'brand', palette: { blocks: failing }, exportable: { number: 'INV-0007' } })) {
      expect(nudge.kind).toBe('nudge')
      expect(nudge.text.length).toBeGreaterThan(10)
    }
  })

  it('stay away once dismissed, for that workspace only', () => {
    const room: Room = { view: 'brand', palette: { blocks: failing } }
    const nudge = nudgesFor(room)[0]
    expect(hintsFor(room, new Set([dismissKey(room, nudge)]))).toEqual([])
    expect(hintsFor({ view: 'board', board: { items: [], selected: [] }, palette: { blocks: failing } }, new Set([dismissKey(room, nudge)])).map((hint) => hint.id)).not.toContain('contrast')
  })
})

describe('chips', () => {
  it('on an empty board: names, the customer template and an interview', () => {
    expect(hintsFor(board([])).map((hint) => hint.label)).toEqual(['Brainstorm names', 'Customer template', 'Interview me'])
  })

  it('on a board with something on it: none of those', () => {
    expect(hintsFor(board([note('a')]))).toEqual([])
  })

  it('on an invoice with no client: use a saved client, only if the project remembers one', () => {
    const room: Room = { view: 'invoice', invoice: { clientNamed: false, number: 'INV-0001' }, savedClients: 2 }
    expect(hintsFor(room).map((hint) => hint.label)).toEqual(['Use a saved client'])
    expect(hintsFor({ ...room, savedClients: 0 })).toEqual([])
    expect(hintsFor({ ...room, invoice: { clientNamed: true, number: 'INV-0001' } })).toEqual([])
  })

  it('in the palette, once it is saved and there is no logo: make the logo brief', () => {
    expect(hintsFor({ view: 'brand', hasPalette: true, hasLogo: false }).map((hint) => hint.label)).toEqual(['Make the logo brief'])
    expect(hintsFor({ view: 'brand', hasPalette: true, hasLogo: true })).toEqual([])
    expect(hintsFor({ view: 'brand', hasPalette: false })).toEqual([])
  })

  it('show a nudge first, and never more than three', () => {
    const hints = hintsFor({ ...board([]), exportable: { number: 'INV-0007' } })
    expect(hints).toHaveLength(MAX_HINTS)
    expect(hints[0].kind).toBe('nudge')
    expect(hints.slice(1).every((hint) => hint.kind === 'hint')).toBe(true)
  })
})
