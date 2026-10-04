import { describe, expect, it } from 'vitest'
import { BOARD_H, BOARD_W, NOTE_DEFAULT, NOTE_MAX, NOTE_MIN } from './boardGeometry.ts'
import {
  BOARD_LAYOUT,
  MAX_ITEMS,
  MAX_NOTE_TEXT,
  boardArrangementIsDefault,
  canRedoBoard,
  canUndoBoard,
  docOf,
  isBoardUnsaved,
  sameItems,
  itemById,
  openBoard,
  reduceBoard,
  selectedItems,
  type BoardAction,
  type BoardItem,
  type BoardState,
  type BoardSummary,
  type FrameItem,
  type NoteItem,
  type ShapeItem,
} from './boardState.ts'

const run = (state: BoardState, ...actions: BoardAction[]) => actions.reduce(reduceBoard, state)
const empty = () => openBoard()
const add = (id: string, x = 600, y = 600) => ({ type: 'add_note', id, at: { x, y } }) as const
const note = (state: BoardState, id: string) => itemById(docOf(state), id) as NoteItem

describe('opening a board', () => {
  it('is empty, with the select tool in hand and a yellow note next', () => {
    const state = empty()
    expect(docOf(state).items).toEqual([])
    expect(state).toMatchObject({ selection: [], tool: 'select', noteColour: 'yellow' })
    expect(docOf(state).layout).toEqual(BOARD_LAYOUT)
    expect(canUndoBoard(state)).toBe(false)
  })

  it('makes saved notes fit: inside the board, within the size limits, and no more text than a note holds', () => {
    const state = openBoard([{ id: 'a', kind: 'note', x: BOARD_W + 500, y: -40, w: 10, h: 9000, text: 'x'.repeat(2000), colour: 'mint', author: 'you' }])
    const a = note(state, 'a')
    expect(a.x).toBeLessThanOrEqual(BOARD_W - a.w)
    expect(a.y).toBe(0)
    expect(a.w).toBe(NOTE_MIN.w)
    expect(a.h).toBe(NOTE_MAX.h)
    expect(a.text).toHaveLength(MAX_NOTE_TEXT)
  })
})

describe('add_note', () => {
  it('adds a note centred on the point, snapped, in the colour in hand, and selects it', () => {
    const state = run(empty(), add('a', 500, 500))
    expect(note(state, 'a')).toMatchObject({ kind: 'note', x: 400, y: 420, ...NOTE_DEFAULT, colour: 'yellow', author: 'you', text: '' })
    expect(state.selection).toEqual(['a'])
    expect(canUndoBoard(state)).toBe(true)
  })

  it('uses the colour in hand, or the one it is given', () => {
    const state = run(empty(), { type: 'set_note_colour', colour: 'sky' }, add('a'), { type: 'add_note', id: 'b', at: { x: 1500, y: 600 }, colour: 'peach' })
    expect(note(state, 'a').colour).toBe('sky')
    expect(note(state, 'b').colour).toBe('peach')
  })

  it('makes a note by Droplet pink, whatever was asked', () => {
    const state = run(empty(), { type: 'add_note', id: 'a', at: { x: 600, y: 600 }, author: 'ai', colour: 'yellow', text: 'An idea' })
    expect(note(state, 'a')).toMatchObject({ author: 'ai', colour: 'pink', text: 'An idea' })
  })

  it('keeps a note inside the board when it is placed at a corner', () => {
    const state = run(empty(), add('a', 0, 0), add('b', BOARD_W, BOARD_H))
    expect(note(state, 'a')).toMatchObject({ x: 0, y: 0 })
    expect(note(state, 'b')).toMatchObject({ x: BOARD_W - NOTE_DEFAULT.w, y: BOARD_H - NOTE_DEFAULT.h })
  })

  it('places a note where a rectangle says', () => {
    const state = run(empty(), { type: 'add_note', id: 'a', rect: { x: 333, y: 217, w: 200, h: 180 } })
    expect(note(state, 'a')).toMatchObject({ x: 340, y: 220 })
  })

  it('does not add a note with an id that is there, or more than the board holds', () => {
    const one = run(empty(), add('a'))
    expect(run(one, add('a', 900, 900))).toBe(one)
    const full = openBoard(Array.from({ length: MAX_ITEMS }, (_, i) => ({ id: `n${i}`, kind: 'note' as const, x: 0, y: 0, w: 200, h: 180, text: '', colour: 'yellow' as const, author: 'you' as const })))
    expect(run(full, add('extra'))).toBe(full)
  })

  it('cuts the text of a note to what it can hold', () => {
    const state = run(empty(), { type: 'add_note', id: 'a', at: { x: 600, y: 600 }, text: 'x'.repeat(MAX_NOTE_TEXT + 50) })
    expect(note(state, 'a').text).toHaveLength(MAX_NOTE_TEXT)
  })
})

describe('move', () => {
  it('moves notes by the distance, snapped', () => {
    const state = run(empty(), add('a'), { type: 'move', ids: ['a'], dx: 53, dy: 27 })
    expect(note(state, 'a')).toMatchObject({ x: 560, y: 540 })
  })

  it('moves a group as one', () => {
    const state = run(empty(), add('a', 500, 500), add('b', 1500, 800), { type: 'move', ids: ['a', 'b'], dx: 100, dy: 0 })
    expect(note(state, 'b').x - note(state, 'a').x).toBe(1000)
    expect(note(state, 'a').x).toBe(500)
  })

  it('does not take any of them past the board edge', () => {
    const state = run(empty(), add('a', 100, 100), add('b', 400, 100), { type: 'move', ids: ['a', 'b'], dx: -900, dy: -900 })
    expect(note(state, 'a')).toMatchObject({ x: 0, y: 0 })
    expect(note(state, 'b').x).toBe(300)
  })

  it('brings what was moved to the front', () => {
    const state = run(empty(), add('a', 500, 500), add('b', 1500, 500), add('c', 2500, 500), { type: 'move', ids: ['a'], dx: 40, dy: 0 })
    expect(docOf(state).items.map((item) => item.id)).toEqual(['b', 'c', 'a'])
  })

  it('is no step when nothing moves, or the notes are not there', () => {
    const state = run(empty(), add('a', 0, 0))
    expect(run(state, { type: 'move', ids: ['a'], dx: -100, dy: -100 })).toBe(state)
    expect(run(state, { type: 'move', ids: ['ghost'], dx: 100, dy: 100 })).toBe(state)
  })
})

describe('resize_item', () => {
  it('sets the size, snapped and within its limits', () => {
    const state = run(empty(), add('a'), { type: 'resize_item', id: 'a', w: 331, h: 5000 })
    expect(note(state, 'a')).toMatchObject({ w: 340, h: NOTE_MAX.h })
  })

  it('is no step when the size is the same', () => {
    const state = run(empty(), add('a'))
    expect(run(state, { type: 'resize_item', id: 'a', ...NOTE_DEFAULT })).toBe(state)
  })

  it('does not grow past the board edge', () => {
    const state = run(empty(), add('a', BOARD_W - 100, 600), { type: 'resize_item', id: 'a', w: 600, h: 180 })
    expect(note(state, 'a').x + note(state, 'a').w).toBeLessThanOrEqual(BOARD_W)
  })
})

describe('set_text', () => {
  it('sets the words, and is one step for everything typed in one note', () => {
    let state = run(empty(), add('a'))
    const steps = state.history.past.length
    state = run(state, { type: 'set_text', id: 'a', text: 'W' }, { type: 'set_text', id: 'a', text: 'Wh' }, { type: 'set_text', id: 'a', text: 'Why' })
    expect(note(state, 'a').text).toBe('Why')
    expect(state.history.past.length).toBe(steps + 1)
  })

  it('is no step when the words are the same', () => {
    const state = run(empty(), add('a'), { type: 'set_text', id: 'a', text: 'x' })
    expect(run(state, { type: 'set_text', id: 'a', text: 'x' })).toBe(state)
  })
})

describe('set_colour', () => {
  it('colours every note given', () => {
    const state = run(empty(), add('a'), add('b', 1500, 600), { type: 'set_colour', ids: ['a', 'b'], colour: 'lilac' })
    expect([note(state, 'a').colour, note(state, 'b').colour]).toEqual(['lilac', 'lilac'])
  })

  it('is no step when they already are that colour', () => {
    const state = run(empty(), add('a'))
    expect(run(state, { type: 'set_colour', ids: ['a'], colour: 'yellow' })).toBe(state)
  })

  it('lets a founder keep a note by Droplet by choosing it a colour of their own', () => {
    const state = run(empty(), { type: 'add_note', id: 'a', at: { x: 600, y: 600 }, author: 'ai' }, { type: 'set_colour', ids: ['a'], colour: 'mint' })
    expect(note(state, 'a')).toMatchObject({ colour: 'mint', author: 'ai' })
  })
})

describe('delete and selection', () => {
  it('deletes notes and takes them out of the selection', () => {
    const state = run(empty(), add('a'), add('b', 1500, 600), { type: 'select', ids: ['a', 'b'] }, { type: 'delete', ids: ['a'] })
    expect(docOf(state).items.map((item) => item.id)).toEqual(['b'])
    expect(state.selection).toEqual(['b'])
  })

  it('replaces, adds to and toggles the selection', () => {
    let state = run(empty(), add('a'), add('b', 1500, 600), add('c', 2500, 600), { type: 'select', ids: ['a'] })
    expect(state.selection).toEqual(['a'])
    state = run(state, { type: 'select', ids: ['b'], mode: 'add' })
    expect(state.selection).toEqual(['a', 'b'])
    state = run(state, { type: 'select', ids: ['a', 'c'], mode: 'toggle' })
    expect(state.selection).toEqual(['b', 'c'])
    state = run(state, { type: 'select', ids: [] })
    expect(state.selection).toEqual([])
  })

  it('ignores ids that are not on the board', () => {
    const state = run(empty(), add('a'), { type: 'select', ids: ['a', 'ghost'] })
    expect(state.selection).toEqual(['a'])
  })

  it('selects all', () => {
    const state = run(empty(), add('a'), add('b', 1500, 600), { type: 'select', ids: [] }, { type: 'select_all' })
    expect(selectedItems(state).map((item) => item.id)).toEqual(['a', 'b'])
  })

  it('is not a step in the history: undo takes back what was done to the board, not what was selected', () => {
    const state = run(empty(), add('a'), add('b', 1500, 600))
    const steps = state.history.past.length
    expect(run(state, { type: 'select', ids: ['a'] }).history.past.length).toBe(steps)
    expect(run(state, { type: 'set_tool', tool: 'sticky' }).history.past.length).toBe(steps)
  })
})

describe('tool and note colour', () => {
  it('sets the tool in hand and the colour of the next note', () => {
    const state = run(empty(), { type: 'set_tool', tool: 'sticky' }, { type: 'set_note_colour', colour: 'mint' })
    expect(state).toMatchObject({ tool: 'sticky', noteColour: 'mint' })
  })
})

describe('undo and redo', () => {
  it('takes back an edit and brings it back', () => {
    const added = run(empty(), add('a'))
    const undone = run(added, { type: 'undo' })
    expect(docOf(undone).items).toEqual([])
    expect(canRedoBoard(undone)).toBe(true)
    expect(docOf(run(undone, { type: 'redo' })).items).toHaveLength(1)
  })

  it('keeps only what is still on the board selected', () => {
    const added = run(empty(), add('a'))
    expect(added.selection).toEqual(['a'])
    expect(run(added, { type: 'undo' }).selection).toEqual([])
  })

  it('does nothing when there is nothing to undo or redo', () => {
    const state = empty()
    expect(run(state, { type: 'undo' })).toBe(state)
    expect(run(state, { type: 'redo' })).toBe(state)
  })
})

describe('batch', () => {
  it('applies several actions as one step', () => {
    const state = run(empty(), { type: 'batch', actions: [add('a'), add('b', 1500, 600), { type: 'set_colour', ids: ['a', 'b'], colour: 'sky' }] })
    expect(docOf(state).items).toHaveLength(2)
    expect(state.history.past).toHaveLength(1)
    expect(docOf(run(state, { type: 'undo' })).items).toEqual([])
  })
})

describe('the arrangement', () => {
  it('handles the shared arrangement actions, so the toolbar and the window work as in every workspace', () => {
    const state = run(empty(), { type: 'resize', id: 'board', value: 18 })
    expect(docOf(state).layout.find((placement) => placement.id === 'board')?.w).toBe(18)
    expect(boardArrangementIsDefault(docOf(state))).toBe(false)
    expect(boardArrangementIsDefault(docOf(run(state, { type: 'reset_layout' })))).toBe(true)
  })

  it('does not let the fixed tools be hidden', () => {
    const state = empty()
    expect(run(state, { type: 'hide', component: 'select' })).toBe(state)
    expect(run(state, { type: 'hide', component: 'sticky' })).toBe(state)
  })
})

describe('isBoardUnsaved', () => {
  it('is unsaved with nothing saved, and saved once it matches what was', () => {
    const state = run(empty(), add('a'))
    const doc = docOf(state)
    expect(isBoardUnsaved(doc, null)).toBe(true)
    const saved = { items: doc.items, layout: doc.layout, tools: doc.tools, expanded: doc.expanded, hidden: doc.hidden, savedAt: 'x' }
    expect(isBoardUnsaved(doc, saved)).toBe(false)
    expect(isBoardUnsaved(docOf(run(state, { type: 'set_text', id: 'a', text: 'new' })), saved)).toBe(true)
  })
})

describe('sameItems', () => {
  const a: BoardItem = { id: 'a', kind: 'note', x: 0, y: 20, w: 200, h: 180, text: 'x', colour: 'sky', author: 'you' }

  it('is true for the same notes, whatever order their fields were written in', () => {
    const reordered = { author: 'you', colour: 'sky', text: 'x', h: 180, w: 200, y: 20, x: 0, kind: 'note', id: 'a' } as BoardItem
    expect(sameItems([a], [reordered])).toBe(true)
  })

  it('is false when anything about a note, or the order of the notes, differs', () => {
    expect(sameItems([a], [{ ...a, text: 'y' }])).toBe(false)
    expect(sameItems([a], [{ ...a, x: 20 }])).toBe(false)
    expect(sameItems([a], [{ ...a, colour: 'mint' }])).toBe(false)
    expect(sameItems([a], [])).toBe(false)
    const b = { ...a, id: 'b' }
    expect(sameItems([a, b], [b, a])).toBe(false)
  })

  it('does not count a board that was saved and read back from storage as changed', () => {
    const state = run(empty(), add('a'), { type: 'set_text', id: 'a', text: 'Saved' })
    const doc = docOf(state)
    const stored = JSON.parse(JSON.stringify({ items: (doc.items as NoteItem[]).map((item) => ({ id: item.id, kind: item.kind, x: item.x, y: item.y, w: item.w, h: item.h, text: item.text, colour: item.colour, author: item.author })), layout: doc.layout, tools: doc.tools, expanded: doc.expanded, hidden: doc.hidden, savedAt: 'x' }))
    expect(isBoardUnsaved(doc, stored)).toBe(false)
  })
})


// ---- Shapes, text, frames and arrows ----

const frameAt = (id: string, x = 100, y = 100, w = 800, h = 600) => ({ type: 'add_frame', id, rect: { x, y, w, h } }) as const
const arrowBetween = (id: string, from: string, to: string) => ({ type: 'add_connector', id, from: { item: from }, to: { item: to } }) as const
const get = <T extends BoardItem>(state: BoardState, id: string) => itemById(docOf(state), id) as T

describe('add_shape', () => {
  it('adds a shape of the kind in hand, white, centred on the point, and selects it', () => {
    const state = run(empty(), { type: 'set_shape_kind', shape: 'ellipse' }, { type: 'add_shape', id: 's', at: { x: 600, y: 600 } })
    expect(get(state, 's')).toMatchObject({ kind: 'shape', shape: 'ellipse', colour: 'white', text: '', w: 200, h: 140, x: 500, y: 540 })
    expect(state.selection).toEqual(['s'])
  })

  it('makes a diamond a little taller, to hold the same words', () => {
    const state = run(empty(), { type: 'add_shape', id: 'd', shape: 'diamond', at: { x: 600, y: 600 } })
    expect(get(state, 'd')).toMatchObject({ w: 220, h: 180 })
  })

  it('takes a rectangle drawn with the pointer, fitted to the grid and its limits', () => {
    const state = run(empty(), { type: 'add_shape', id: 's', rect: { x: 103, y: 99, w: 10, h: 5000 } })
    expect(get(state, 's')).toMatchObject({ x: 100, y: 100, w: 80, h: 900 })
  })

  it('can be given its words and colour, and its kind changed after', () => {
    let state = run(empty(), { type: 'add_shape', id: 's', at: { x: 600, y: 600 }, text: 'Decide', colour: 'mint' })
    state = run(state, { type: 'set_shape', ids: ['s'], shape: 'diamond' })
    expect(get(state, 's')).toMatchObject({ text: 'Decide', colour: 'mint', shape: 'diamond' })
  })
})

describe('add_text and add_frame', () => {
  it('adds a text label, at the body size unless told', () => {
    const state = run(empty(), { type: 'add_text', id: 't', at: { x: 600, y: 600 }, text: 'Our offer' }, { type: 'set_text_size', ids: ['t'], size: 'title' })
    expect(get(state, 't')).toMatchObject({ kind: 'text', text: 'Our offer', size: 'title', w: 240, h: 60 })
  })

  it('adds a frame, white, called "Frame" until it is renamed', () => {
    let state = run(empty(), { type: 'add_frame', id: 'f', at: { x: 1000, y: 800 } })
    expect(get(state, 'f')).toMatchObject({ kind: 'frame', title: 'Frame', colour: 'white', w: 480, h: 360 })
    state = run(state, { type: 'set_title', id: 'f', title: 'Offers' })
    expect(get(state, 'f').kind === 'frame' && (get(state, 'f') as { title: string }).title).toBe('Offers')
  })

  it('keeps a frame inside the board and within its smallest size', () => {
    const state = run(empty(), { type: 'add_frame', id: 'f', rect: { x: 4700, y: 3100, w: 20, h: 20 } })
    expect(get(state, 'f')).toMatchObject({ w: 160, h: 120, x: 4640, y: 3080 })
  })

  it('is one step for everything typed in a title', () => {
    let state = run(empty(), frameAt('f'))
    const steps = state.history.past.length
    state = run(state, { type: 'set_title', id: 'f', title: 'O' }, { type: 'set_title', id: 'f', title: 'Of' }, { type: 'set_title', id: 'f', title: 'Offers' })
    expect(state.history.past.length).toBe(steps + 1)
  })

  it('does not set the words of a frame with set_text, or the title of a note', () => {
    const state = run(empty(), frameAt('f'), add('n'))
    expect(run(state, { type: 'set_text', id: 'f', text: 'x' })).toBe(state)
    expect(run(state, { type: 'set_title', id: 'n', title: 'x' })).toBe(state)
  })
})

describe('add_connector', () => {
  it('joins two things, with the style in hand and an arrow at the end', () => {
    const state = run(empty(), { type: 'set_connector_style', style: 'elbow' }, add('a'), add('b', 1500, 600), arrowBetween('c', 'a', 'b'))
    expect(get(state, 'c')).toMatchObject({ kind: 'connector', from: { item: 'a' }, to: { item: 'b' }, style: 'elbow', head: 'end', text: '' })
    expect(state.selection).toEqual(['c'])
  })

  it('can end on a point of its own, kept on the board', () => {
    const state = run(empty(), add('a'), { type: 'add_connector', id: 'c', from: { item: 'a' }, to: { x: 99999, y: -5 } })
    expect(get(state, 'c')).toMatchObject({ to: { x: 4800, y: 0 } })
  })

  it('does not join a thing to itself, or to something that is not there, or to another arrow', () => {
    const state = run(empty(), add('a'), add('b', 1500, 600), arrowBetween('c', 'a', 'b'))
    expect(run(state, arrowBetween('x', 'a', 'a'))).toBe(state)
    expect(run(state, arrowBetween('x', 'a', 'ghost'))).toBe(state)
    expect(run(state, arrowBetween('x', 'a', 'c'))).toBe(state)
  })

  it('does not draw the same arrow twice between the same two things', () => {
    const state = run(empty(), add('a'), add('b', 1500, 600), arrowBetween('c', 'a', 'b'))
    expect(run(state, arrowBetween('d', 'a', 'b'))).toBe(state)
    // the other way round says something else
    expect(docOf(run(state, arrowBetween('d', 'b', 'a'))).items.filter((item) => item.kind === 'connector')).toHaveLength(2)
  })

  it('changes its style, its arrows, and where it ends', () => {
    let state = run(empty(), add('a'), add('b', 1500, 600), add('n', 2500, 600), arrowBetween('c', 'a', 'b'))
    state = run(state, { type: 'set_connector', id: 'c', patch: { style: 'elbow', head: 'both' } })
    expect(get(state, 'c')).toMatchObject({ style: 'elbow', head: 'both' })
    state = run(state, { type: 'set_connector', id: 'c', patch: { to: { item: 'n' } } })
    expect(get(state, 'c')).toMatchObject({ to: { item: 'n' } })
    state = run(state, { type: 'set_connector', id: 'c', patch: { to: { x: 900, y: 900 } } })
    expect(get(state, 'c')).toMatchObject({ to: { x: 900, y: 900 } })
  })

  it('refuses to move an end onto the thing the other end is on, or onto nothing that exists, and is no step when nothing changes', () => {
    const state = run(empty(), add('a'), add('b', 1500, 600), arrowBetween('c', 'a', 'b'))
    expect(run(state, { type: 'set_connector', id: 'c', patch: { to: { item: 'a' } } })).toBe(state)
    expect(run(state, { type: 'set_connector', id: 'c', patch: { to: { item: 'ghost' } } })).toBe(state)
    expect(run(state, { type: 'set_connector', id: 'c', patch: { style: 'straight' } })).toBe(state)
  })

  it('has a label of its own, kept short, which set_text sets', () => {
    let state = run(empty(), add('a'), add('b', 1500, 600), arrowBetween('c', 'a', 'b'))
    state = run(state, { type: 'set_text', id: 'c', text: 'x'.repeat(200) })
    expect((get(state, 'c') as { text: string }).text).toHaveLength(60)
  })
})

describe('arrows follow what they are on', () => {
  it('goes with a thing when it is deleted, and comes back with undo, as one step', () => {
    let state = run(empty(), add('a'), add('b', 1500, 600), arrowBetween('c', 'a', 'b'))
    state = run(state, { type: 'delete', ids: ['a'] })
    expect(docOf(state).items.map((item) => item.id)).toEqual(['b'])
    state = run(state, { type: 'undo' })
    expect(docOf(state).items.map((item) => item.id).sort()).toEqual(['a', 'b', 'c'])
  })

  it('is not moved by being asked to move, when it is on things, but its loose ends are', () => {
    let state = run(empty(), add('a'), { type: 'add_connector', id: 'c', from: { item: 'a' }, to: { x: 1500, y: 700 } })
    state = run(state, { type: 'move', ids: ['c'], dx: 100, dy: 0 })
    expect(get(state, 'c')).toMatchObject({ from: { item: 'a' }, to: { x: 1600, y: 700 } })
    expect(note(state, 'a').x).toBe(500)
  })

  it('does not take a loose end off the board', () => {
    const state = run(empty(), add('a'), { type: 'add_connector', id: 'c', from: { item: 'a' }, to: { x: 4790, y: 700 } }, { type: 'move', ids: ['c'], dx: 400, dy: 0 })
    expect((get(state, 'c') as { to: { x: number } }).to.x).toBeLessThanOrEqual(4800)
  })
})

describe('frames hold what is inside them', () => {
  const setup = () => run(empty(), frameAt('f', 100, 100, 800, 600), add('in', 400, 400), add('out', 2000, 400), arrowBetween('c', 'in', 'out'))

  it('moves what is inside with the frame, and leaves what is outside', () => {
    const state = run(setup(), { type: 'move', ids: ['f'], dx: 200, dy: 100 })
    expect(get(state, 'f')).toMatchObject({ x: 300, y: 200 })
    expect(note(state, 'in')).toMatchObject({ x: 500, y: 420 })
    expect(note(state, 'out').x).toBe(1900)
  })

  it('stops the whole group at the board edge, not only the frame', () => {
    const state = run(empty(), frameAt('f', 100, 100, 800, 600), add('in', 800, 600), { type: 'move', ids: ['f'], dx: -900, dy: 0 })
    expect(get<FrameItem>(state, 'f').x).toBe(0)
    expect(note(state, 'in').x).toBe(600)
  })

  it('takes a note in when it is moved into the frame, and out when it is moved out, with no step of its own', () => {
    // moved in: its middle is now inside, so the frame takes it
    let state = run(setup(), { type: 'move', ids: ['out'], dx: -1200, dy: 0 })
    state = run(state, { type: 'move', ids: ['f'], dx: 100, dy: 0 })
    expect(note(state, 'out').x).toBe(700 + 100)
    // moved out again: the frame leaves it
    state = run(state, { type: 'move', ids: ['out'], dx: 1200, dy: 0 })
    state = run(state, { type: 'move', ids: ['f'], dx: 100, dy: 0 })
    expect(note(state, 'out').x).toBe(2000)
  })

  it('keeps an arrow between two things joined as they move with the frame', () => {
    const before = get(setup(), 'c')
    const after = get(run(setup(), { type: 'move', ids: ['f'], dx: 200, dy: 0 }), 'c')
    expect(after).toEqual(before)
  })

  it('moves a frame with the arrow keys the same way, as the move action is the same one', () => {
    const state = run(setup(), { type: 'move', ids: ['f', 'in'], dx: 20, dy: 0 })
    expect(note(state, 'in').x).toBe(320)
    expect(get<FrameItem>(state, 'f').x).toBe(120)
  })
})

describe('deleting a frame', () => {
  const setup = () => run(empty(), frameAt('f', 100, 100, 800, 600), add('in', 400, 400), add('n2', 600, 400))

  it('leaves what is inside it', () => {
    const state = run(setup(), { type: 'delete', ids: ['f'] })
    expect(docOf(state).items.map((item) => item.id)).toEqual(['in', 'n2'])
  })

  it('takes what is inside with it only when asked', () => {
    const state = run(setup(), { type: 'delete', ids: ['f'], contents: true })
    expect(docOf(state).items).toEqual([])
  })

  it('takes the arrows on what it deletes', () => {
    const state = run(setup(), arrowBetween('c', 'in', 'n2'), { type: 'delete', ids: ['f'], contents: true })
    expect(docOf(state).items).toEqual([])
  })

  it('deletes what is inside when it was selected too, as it was asked for', () => {
    const state = run(setup(), { type: 'delete', ids: ['f', 'in'] })
    expect(docOf(state).items.map((item) => item.id)).toEqual(['n2'])
  })
})

describe('resizing every kind', () => {
  it('resizes a shape, a text label and a frame within their own limits', () => {
    let state = run(empty(), { type: 'add_shape', id: 's', at: { x: 600, y: 600 } }, { type: 'add_text', id: 't', at: { x: 2000, y: 600 } }, frameAt('f', 100, 1500, 400, 300))
    state = run(state, { type: 'resize_item', id: 's', w: 20, h: 20 }, { type: 'resize_item', id: 't', w: 5000, h: 5000 }, { type: 'resize_item', id: 'f', w: 40, h: 40 })
    expect(get(state, 's')).toMatchObject({ w: 80, h: 60 })
    expect(get(state, 't')).toMatchObject({ w: 1200, h: 600 })
    expect(get(state, 'f')).toMatchObject({ w: 160, h: 120 })
  })

  it('does not resize an arrow', () => {
    const state = run(empty(), add('a'), add('b', 1500, 600), arrowBetween('c', 'a', 'b'))
    expect(run(state, { type: 'resize_item', id: 'c', w: 500, h: 500 })).toBe(state)
  })

  it('changes which things a frame holds as it is resized', () => {
    let state = run(empty(), frameAt('f', 100, 100, 400, 400), add('n', 600, 300))
    expect(run(state, { type: 'move', ids: ['f'], dx: 100, dy: 0 }).history.present.items.find((item) => item.id === 'n')).toMatchObject({ x: 500 })
    state = run(state, { type: 'resize_item', id: 'f', w: 800, h: 400 })
    expect(note(run(state, { type: 'move', ids: ['f'], dx: 100, dy: 0 }), 'n').x).toBe(600)
  })
})

describe('set_colour for each kind', () => {
  it('gives a shape or a frame white or a founder colour, and not pink', () => {
    let state = run(empty(), { type: 'add_shape', id: 's', at: { x: 600, y: 600 } }, frameAt('f', 100, 1500, 400, 300))
    state = run(state, { type: 'set_colour', ids: ['s', 'f'], colour: 'sky' })
    expect([get<ShapeItem>(state, 's').colour, get<FrameItem>(state, 'f').colour]).toEqual(['sky', 'sky'])
    expect(run(state, { type: 'set_colour', ids: ['s', 'f'], colour: 'pink' })).toBe(state)
  })

  it('gives a note a founder colour and not white, and a shape and a note together a colour they both have', () => {
    let state = run(empty(), add('n'), { type: 'add_shape', id: 's', at: { x: 2000, y: 600 } })
    state = run(state, { type: 'set_colour', ids: ['n', 's'], colour: 'mint' })
    expect([note(state, 'n').colour, get<ShapeItem>(state, 's').colour]).toEqual(['mint', 'mint'])
  })

  it('leaves text and arrows alone', () => {
    const state = run(empty(), { type: 'add_text', id: 't', at: { x: 600, y: 600 } })
    expect(run(state, { type: 'set_colour', ids: ['t'], colour: 'mint' })).toBe(state)
  })
})


describe('layers', () => {
  const kinds = (state: BoardState) => docOf(state).items.map((item) => item.kind)

  it('draws frames first, then arrows, then the rest, whatever order they were made in', () => {
    const state = run(empty(), add('a'), add('b', 1500, 600), arrowBetween('c', 'a', 'b'), frameAt('f'), { type: 'add_shape', id: 's', at: { x: 3000, y: 2000 } })
    expect(kinds(state)).toEqual(['frame', 'connector', 'note', 'note', 'shape'])
  })

  const order = (state: BoardState) => docOf(state).items.map((item) => item.id)

  it('brings to the front and sends to the back, within its own layer', () => {
    let state = run(empty(), add('a', 500, 500), add('b', 1500, 500), add('c', 2500, 500), frameAt('f'))
    state = run(state, { type: 'reorder', ids: ['a'], to: 'front' })
    expect(order(state)).toEqual(['f', 'b', 'c', 'a'])
    state = run(state, { type: 'reorder', ids: ['a'], to: 'back' })
    expect(order(state)).toEqual(['f', 'a', 'b', 'c'])
  })

  it('goes forward and backward one place at a time', () => {
    let state = run(empty(), add('a', 500, 500), add('b', 1500, 500), add('c', 2500, 500))
    state = run(state, { type: 'reorder', ids: ['a'], to: 'forward' })
    expect(order(state)).toEqual(['b', 'a', 'c'])
    state = run(state, { type: 'reorder', ids: ['c'], to: 'backward' })
    expect(order(state)).toEqual(['b', 'c', 'a'])
  })

  it('moves several together, keeping their order', () => {
    let state = run(empty(), add('a', 500, 500), add('b', 1500, 500), add('c', 2500, 500), add('d', 3500, 500))
    state = run(state, { type: 'reorder', ids: ['a', 'b'], to: 'forward' })
    expect(order(state)).toEqual(['c', 'a', 'b', 'd'])
  })

  it('is no step when it is already there', () => {
    const state = run(empty(), add('a', 500, 500), add('b', 1500, 500))
    expect(run(state, { type: 'reorder', ids: ['b'], to: 'front' })).toBe(state)
    expect(run(state, { type: 'reorder', ids: ['a'], to: 'back' })).toBe(state)
    expect(run(state, { type: 'reorder', ids: ['a', 'b'], to: 'front' })).toBe(state)
  })

  it('does not put a note under a frame, since frames are always behind', () => {
    let state = run(empty(), frameAt('f'), add('a', 400, 400))
    state = run(state, { type: 'reorder', ids: ['a'], to: 'back' })
    expect(order(state)).toEqual(['f', 'a'])
  })

  it('puts a frame on top of another frame, and so makes it the one that holds what is inside both', () => {
    let state = run(empty(), frameAt('under', 100, 100, 800, 600), frameAt('over', 200, 200, 400, 300), add('n', 300, 300))
    state = run(state, { type: 'reorder', ids: ['over'], to: 'back' })
    // 'under' is now on top, so it holds the note, and moving it takes the note
    state = run(state, { type: 'move', ids: ['under'], dx: 100, dy: 0 })
    // 'under' is on top, so it holds the note, which goes with it: 200 to 300
    expect(note(state, 'n').x).toBe(300)
  })
})

describe('opening a board with all the kinds', () => {
  it('keeps an arrow only when what it is on is there, and fits everything', () => {
    const state = openBoard([
      { id: 'a', kind: 'note', x: 100, y: 100, w: 200, h: 180, text: 'a', colour: 'yellow', author: 'you' },
      { id: 'good', kind: 'connector', from: { item: 'a' }, to: { x: 500, y: 500 }, style: 'straight', head: 'end', text: '' },
      { id: 'dangling', kind: 'connector', from: { item: 'a' }, to: { item: 'gone' }, style: 'straight', head: 'end', text: '' },
      { id: 'loop', kind: 'connector', from: { item: 'a' }, to: { item: 'a' }, style: 'straight', head: 'end', text: '' },
      { id: 'huge', kind: 'frame', x: -50, y: 0, w: 9000, h: 9000, title: 'x'.repeat(200), colour: 'white' },
    ])
    expect(docOf(state).items.map((item) => item.id)).toEqual(['huge', 'good', 'a'])
    expect(get(state, 'huge')).toMatchObject({ x: 0, y: 0, w: 4800, h: 3200 })
    expect((get(state, 'huge') as unknown as { title: string }).title).toHaveLength(80)
  })
})

describe('sameItems for all the kinds', () => {
  it('compares arrows by value, whatever order the fields of the ends were written in', () => {
    const a = { id: 'c', kind: 'connector', from: { item: 'a' }, to: { x: 1, y: 2 }, style: 'straight', head: 'end', text: '' } as BoardItem
    const b = { text: '', head: 'end', style: 'straight', to: { y: 2, x: 1 }, from: { item: 'a' }, kind: 'connector', id: 'c' } as BoardItem
    expect(sameItems([a], [b])).toBe(true)
    expect(sameItems([a], [{ ...(a as object), to: { x: 1, y: 3 } } as BoardItem])).toBe(false)
  })
})

describe('tool settings', () => {
  it('sets the kind of the next shape and how the next arrow is drawn, outside the history', () => {
    const state = run(empty(), { type: 'set_shape_kind', shape: 'diamond' }, { type: 'set_connector_style', style: 'elbow' }, { type: 'set_tool', tool: 'connector' })
    expect(state).toMatchObject({ shapeKind: 'diamond', connectorStyle: 'elbow', tool: 'connector' })
    expect(state.history.past).toHaveLength(0)
  })

  it('has every tool in the toolbar, none of which can be hidden', () => {
    const state = empty()
    for (const id of ['select', 'sticky', 'shape', 'text', 'frame', 'connector']) expect(run(state, { type: 'hide', component: id })).toBe(state)
  })
})

// ---- Several things at once, and templates ----

const aNote = (id: string, x: number, y: number, extra: Partial<NoteItem> = {}): NoteItem => ({ id, kind: 'note', x, y, w: 200, h: 180, text: '', colour: 'yellow', author: 'you', ...extra })
const anArrow = (id: string, from: string, to: string, group?: string): BoardItem => ({ id, kind: 'connector', from: { item: from }, to: { item: to }, style: 'straight', head: 'end', text: '', ...(group ? { group } : {}) })

describe('add_items', () => {
  it('adds all of them as one step, and selects nothing', () => {
    const state = run(empty(), { type: 'add_items', items: [aNote('a', 100, 100), aNote('b', 600, 100), anArrow('c', 'a', 'b')] })
    expect(docOf(state).items.map((item) => item.id)).toEqual(['c', 'a', 'b'])
    expect(state.history.past).toHaveLength(1)
    expect(state.selection).toEqual([])
    expect(docOf(run(state, { type: 'undo' })).items).toEqual([])
  })

  it('fits what it is given to the board', () => {
    const state = run(empty(), { type: 'add_items', items: [aNote('a', 99999, -50, { w: 10, text: 'x'.repeat(2000) })] })
    expect(get<NoteItem>(state, 'a')).toMatchObject({ x: 4800 - 120, y: 0, w: 120 })
    expect(get<NoteItem>(state, 'a').text).toHaveLength(600)
  })

  it('lets an arrow be on things already on the board', () => {
    const state = run(empty(), add('there'), { type: 'add_items', items: [aNote('new', 1500, 100), anArrow('c', 'there', 'new')] })
    expect(docOf(state).items.some((item) => item.id === 'c')).toBe(true)
  })

  it('leaves out an arrow whose end is on nothing, and keeps the rest', () => {
    const state = run(empty(), { type: 'add_items', items: [aNote('a', 100, 100), anArrow('c', 'a', 'ghost')] })
    expect(docOf(state).items.map((item) => item.id)).toEqual(['a'])
  })

  it('adds nothing when an id is already there, or there is nothing to add, or there would be too many', () => {
    const one = run(empty(), add('a'))
    expect(run(one, { type: 'add_items', items: [aNote('a', 900, 900)] })).toBe(one)
    expect(run(one, { type: 'add_items', items: [] })).toBe(one)
    const nearlyFull = openBoard(Array.from({ length: MAX_ITEMS - 1 }, (_, i) => aNote(`n${i}`, 0, 0)))
    expect(run(nearlyFull, { type: 'add_items', items: [aNote('x1', 0, 0), aNote('x2', 0, 0)] })).toBe(nearlyFull)
    expect(docOf(run(nearlyFull, { type: 'add_items', items: [aNote('x1', 0, 0)] })).items).toHaveLength(MAX_ITEMS)
  })

  it('keeps the hint and the group, cut to length, and leaves them out when they are empty', () => {
    const state = run(empty(), { type: 'add_items', items: [aNote('a', 100, 100, { hint: 'h'.repeat(300), group: 'g'.repeat(300) }), aNote('b', 600, 100, { hint: '', group: '' })] })
    expect(get<NoteItem>(state, 'a').hint).toHaveLength(120)
    expect(get<NoteItem>(state, 'a').group).toHaveLength(80)
    expect('hint' in get<NoteItem>(state, 'b')).toBe(false)
    expect('group' in get<NoteItem>(state, 'b')).toBe(false)
  })
})

describe('replace_group', () => {
  const setup = () => run(empty(), { type: 'add_items', items: [aNote('a', 100, 100, { group: 'g1', text: 'written' }), aNote('b', 600, 100, { group: 'g1' }), anArrow('c', 'a', 'b', 'g1'), aNote('mine', 3000, 100)] })

  it('takes off everything in the group and puts the new things on, as one step', () => {
    const state = run(setup(), { type: 'replace_group', group: 'g1', items: [aNote('a2', 100, 100, { group: 'g1', hint: 'fresh' }), aNote('b2', 600, 100, { group: 'g1' })] })
    expect(docOf(state).items.map((item) => item.id).sort()).toEqual(['a2', 'b2', 'mine'])
    expect(get<NoteItem>(state, 'a2').text).toBe('')
    expect(state.history.past).toHaveLength(2)
    expect(docOf(run(state, { type: 'undo' })).items.map((item) => item.id).sort()).toEqual(['a', 'b', 'c', 'mine'])
  })

  it('takes the arrows that were on what it took off, even an arrow of the founder\'s own', () => {
    const state = run(setup(), { type: 'add_connector', id: 'own', from: { item: 'a' }, to: { item: 'mine' } }, { type: 'replace_group', group: 'g1', items: [aNote('a2', 100, 100, { group: 'g1' })] })
    expect(docOf(state).items.some((item) => item.id === 'own')).toBe(false)
  })

  it('leaves what is not in the group alone', () => {
    const state = run(setup(), { type: 'replace_group', group: 'g1', items: [aNote('a2', 100, 100, { group: 'g1' })] })
    expect(get<NoteItem>(state, 'mine')).toMatchObject({ x: 3000 })
  })

  it('does nothing for a group that is not on the board, or when an id is not new', () => {
    const state = setup()
    expect(run(state, { type: 'replace_group', group: 'nobody', items: [aNote('z', 0, 0)] })).toBe(state)
    expect(run(state, { type: 'replace_group', group: 'g1', items: [aNote('mine', 0, 0)] })).toBe(state)
  })

  it('takes what was selected out of the selection', () => {
    const state = run(setup(), { type: 'select', ids: ['a', 'mine'] }, { type: 'replace_group', group: 'g1', items: [aNote('a2', 100, 100, { group: 'g1' })] })
    expect(state.selection).toEqual(['mine'])
  })
})

describe('opening a board with hints and groups', () => {
  it('keeps them, so a template that was saved comes back as it was', () => {
    const state = openBoard([aNote('a', 100, 100, { hint: 'Who is it for?', group: 'customer_problem:1' })])
    expect(get<NoteItem>(state, 'a')).toMatchObject({ hint: 'Who is it for?', group: 'customer_problem:1' })
  })
})

describe('keep_notes', () => {
  const droplet = (id: string, x: number) => ({ type: 'add_note', id, at: { x, y: 600 }, author: 'ai', text: 'An idea' }) as const

  it('makes a note by Droplet the founder\'s own, in the colour of the next note, with no pink', () => {
    const state = run(empty(), { type: 'set_note_colour', colour: 'mint' }, droplet('a', 600), { type: 'keep_notes', ids: ['a'] })
    expect(note(state, 'a')).toMatchObject({ author: 'you', colour: 'mint', text: 'An idea' })
  })

  it('keeps several at once, as one step, and leaves the founder\'s own notes and the rest alone', () => {
    const state = run(empty(), add('mine'), droplet('a', 1500), droplet('b', 2500), droplet('c', 3500))
    const steps = state.history.past.length
    const kept = run(state, { type: 'keep_notes', ids: ['a', 'b', 'mine'] })
    expect(kept.history.past.length).toBe(steps + 1)
    expect(note(kept, 'a').author).toBe('you')
    expect(note(kept, 'b').author).toBe('you')
    expect(note(kept, 'c')).toMatchObject({ author: 'ai', colour: 'pink' })
    expect(note(kept, 'mine').colour).toBe('yellow')
  })

  it('is no step when nothing selected is Droplet\'s', () => {
    const state = run(empty(), add('mine'))
    expect(run(state, { type: 'keep_notes', ids: ['mine'] })).toBe(state)
    expect(run(state, { type: 'keep_notes', ids: ['ghost'] })).toBe(state)
  })

  it('can be undone', () => {
    const state = run(empty(), droplet('a', 600), { type: 'keep_notes', ids: ['a'] }, { type: 'undo' })
    expect(note(state, 'a')).toMatchObject({ author: 'ai', colour: 'pink' })
  })
})

describe('fill_note', () => {
  const prompt = (id: string) => aNote(id, 600, 600, { hint: 'Who is it for?', group: 'customer_problem:1' })

  it('writes into an empty note, which becomes a note by Droplet in the same place, without its hint', () => {
    const state = run(empty(), { type: 'add_items', items: [prompt('p')] }, { type: 'fill_note', id: 'p', text: 'Busy people with dogs' })
    expect(get<NoteItem>(state, 'p')).toMatchObject({ text: 'Busy people with dogs', author: 'ai', colour: 'pink', x: 600, y: 600, group: 'customer_problem:1' })
    expect('hint' in get<NoteItem>(state, 'p')).toBe(false)
  })

  it('refuses a note that has words in it, so the founder\'s are never written over, and a thing that is not a note', () => {
    const state = run(empty(), add('mine'), { type: 'set_text', id: 'mine', text: 'mine' }, { type: 'add_shape', id: 's', at: { x: 2000, y: 600 } })
    expect(run(state, { type: 'fill_note', id: 'mine', text: 'x' })).toBe(state)
    expect(run(state, { type: 'fill_note', id: 's', text: 'x' })).toBe(state)
    expect(run(state, { type: 'fill_note', id: 'ghost', text: 'x' })).toBe(state)
  })

  it('refuses empty words, and cuts long ones to what a note holds', () => {
    const state = run(empty(), { type: 'add_items', items: [prompt('p')] })
    expect(run(state, { type: 'fill_note', id: 'p', text: '   ' })).toBe(state)
    expect(get<NoteItem>(run(state, { type: 'fill_note', id: 'p', text: 'x'.repeat(2000) }), 'p').text).toHaveLength(600)
  })

  it('can be undone, and then it is the prompt again', () => {
    const state = run(empty(), { type: 'add_items', items: [prompt('p')] }, { type: 'fill_note', id: 'p', text: 'x' }, { type: 'undo' })
    expect(get<NoteItem>(state, 'p')).toMatchObject({ text: '', hint: 'Who is it for?', author: 'you' })
  })
})

// ---- The summary ----

describe('the summary', () => {
  const at = '2026-10-05T10:00:00'
  const droplet = (over: Partial<BoardSummary> = {}): BoardSummary => ({ decided: ['The name is Kindred Gifting'], open: ['Who pays first'], next: ['Talk to two firms'], by: 'droplet', edited: false, writtenAt: at, ...over })

  it('is none on a new board, and the summary window is off the screen until it is wanted', () => {
    const state = empty()
    expect(docOf(state).summary).toBeNull()
    expect(docOf(state).hidden).toContain('summary')
  })

  it('is set as a whole, as one step, and tidied: one line each, cut to length, empty ones dropped, no more than eight', () => {
    const state = run(empty(), { type: 'set_summary', summary: droplet({ decided: ['  A   line\n  here ', '', 'x'.repeat(300), ...Array.from({ length: 10 }, (_, i) => `l${i}`)] }) })
    const decided = docOf(state).summary!.decided
    expect(decided[0]).toBe('A line here')
    expect(decided[1]).toHaveLength(160)
    expect(decided).toHaveLength(8)
    expect(state.history.past).toHaveLength(1)
    expect(docOf(run(state, { type: 'undo' })).summary).toBeNull()
  })

  it('is cleared with null, and setting what is already there is no step', () => {
    const state = run(empty(), { type: 'set_summary', summary: droplet() })
    expect(run(state, { type: 'set_summary', summary: droplet() })).toBe(state)
    expect(docOf(run(state, { type: 'set_summary', summary: null })).summary).toBeNull()
    expect(run(empty(), { type: 'set_summary', summary: null }).history.past).toHaveLength(0)
  })

  it('marks what Droplet wrote as edited once the founder changes a section, and not before', () => {
    let state = run(empty(), { type: 'set_summary', summary: droplet() })
    expect(docOf(state).summary).toMatchObject({ by: 'droplet', edited: false })
    state = run(state, { type: 'edit_summary', section: 'open', lines: ['Who pays first', 'What it costs'], at })
    expect(docOf(state).summary).toMatchObject({ by: 'droplet', edited: true, open: ['Who pays first', 'What it costs'], decided: ['The name is Kindred Gifting'] })
  })

  it('makes the founder\'s own summary when there is none, in the section being written', () => {
    const state = run(empty(), { type: 'edit_summary', section: 'next', lines: ['Call Thandi'], at })
    expect(docOf(state).summary).toEqual({ decided: [], open: [], next: ['Call Thandi'], by: 'you', edited: false, writtenAt: at })
  })

  it('does not call the founder\'s own summary edited when they keep writing it', () => {
    let state = run(empty(), { type: 'edit_summary', section: 'next', lines: ['Call Thandi'], at })
    state = run(state, { type: 'edit_summary', section: 'decided', lines: ['A name'], at: '2026-10-06T10:00:00' })
    expect(docOf(state).summary).toMatchObject({ by: 'you', edited: false, writtenAt: at, decided: ['A name'] })
  })

  it('is one step for everything typed in one section, and no step when the lines do not change', () => {
    let state = run(empty(), { type: 'set_summary', summary: droplet() })
    const steps = state.history.past.length
    state = run(state, { type: 'edit_summary', section: 'next', lines: ['T'], at }, { type: 'edit_summary', section: 'next', lines: ['Ta'], at }, { type: 'edit_summary', section: 'next', lines: ['Talk'], at })
    expect(state.history.past.length).toBe(steps + 1)
    expect(run(state, { type: 'edit_summary', section: 'next', lines: ['Talk'], at })).toBe(state)
  })

  it('is opened with a saved board, tidied', () => {
    const state = openBoard([], null, droplet({ decided: ['  spaced   out  '] }))
    expect(docOf(state).summary?.decided).toEqual(['spaced out'])
  })

  it('counts as unsaved when it differs from what was saved, and not when it is the same', () => {
    const state = run(empty(), { type: 'set_summary', summary: droplet() })
    const doc = docOf(state)
    const saved = { items: doc.items, summary: doc.summary, layout: doc.layout, tools: doc.tools, expanded: doc.expanded, hidden: doc.hidden, savedAt: 'x' }
    expect(isBoardUnsaved(doc, saved)).toBe(false)
    expect(isBoardUnsaved(doc, { ...saved, summary: null })).toBe(true)
    expect(isBoardUnsaved(docOf(run(state, { type: 'edit_summary', section: 'open', lines: ['New'], at })), saved)).toBe(true)
    // a save from before there was a summary has none, and a board with none is the same as it
    const before = docOf(empty())
    const old = { items: [], layout: before.layout, tools: before.tools, expanded: [], hidden: before.hidden, savedAt: 'x' }
    expect(isBoardUnsaved(before, old)).toBe(false)
  })

  it('can be shown from the Windows menu, which is how a founder opens it', () => {
    const state = run(empty(), { type: 'show', component: 'summary' })
    expect(docOf(state).hidden).not.toContain('summary')
    expect(docOf(run(state, { type: 'hide', component: 'summary' })).hidden).toContain('summary')
  })
})
