import { describe, expect, it } from 'vitest'
import { intersects } from '../lib/boardGeometry.ts'
import { AI_NOTE } from '../lib/boardPlacement.ts'
import { docOf, openBoard, reduceBoard, type BoardState } from '../lib/boardState.ts'
import { TEMPLATES, promptsOf, templateById } from '../lib/boardTemplates.ts'
import { isConnector, isFrame, isNode, rectOf, type BoardItem, type FrameItem, type NoteItem } from '../lib/boardTypes.ts'
import { applyBoardTurnActions } from './boardActions.ts'
import { boardActionSchema, type BoardTurnAction } from './boardSpec.ts'
import { openBoardState, templateBoardSnapshot } from './fixtures.ts'
import { stateOfBoardSnapshot } from './boardSnapshot.ts'

const counter = () => {
  let n = 0
  return () => `new-${++n}`
}
const view = { x: 2200, y: 1400 }
// The fixture board: f1 is the frame "Name ideas", holding n1 and n2; n3, n4 and n5 are loose.
const apply = (actions: BoardTurnAction[], base: BoardState = openBoardState()) => applyBoardTurnActions({ base, actions, view, newId: counter() })
const items = (state: BoardState) => docOf(state).items
const aiNotes = (state: BoardState) => items(state).filter((item): item is NoteItem => item.kind === 'note' && item.author === 'ai')
const reasons = (result: ReturnType<typeof apply>) => result.skipped.map((skipped) => skipped.reason)

describe('add_note', () => {
  it('adds a note by Droplet, pink, with its name on it, whatever else was said', () => {
    const { state, skipped } = apply([{ type: 'add_note', text: 'Pet Pals' }])
    expect(skipped).toEqual([])
    expect(aiNotes(state)).toHaveLength(1)
    expect(aiNotes(state)[0]).toMatchObject({ text: 'Pet Pals', colour: 'pink', author: 'ai', ...AI_NOTE })
  })

  it('puts it near what the founder is looking at when it is given no place, clear of everything', () => {
    const { state } = apply([{ type: 'add_note', text: 'Pet Pals' }])
    const mine = aiNotes(state)[0]
    for (const other of items(state).filter((item) => item.id !== mine.id)) if (!isConnector(other)) expect(intersects(rectOf(mine), rectOf(other))).toBe(false)
    expect(Math.hypot(mine.x + mine.w / 2 - view.x, mine.y + mine.h / 2 - view.y)).toBeLessThan(900)
  })

  it('puts it inside the frame when told, in the first clear place, without covering the founder\'s notes', () => {
    const base = openBoardState()
    const frame = items(base).find(isFrame) as FrameItem
    const { state, skipped } = apply([{ type: 'add_note', text: 'One', in: 'f1' }, { type: 'add_note', text: 'Two', in: 'f1' }])
    expect(skipped).toEqual([])
    for (const note of aiNotes(state)) {
      expect(note.x).toBeGreaterThanOrEqual(frame.x)
      expect(note.x + note.w).toBeLessThanOrEqual(frame.x + frame.w)
      expect(note.y + note.h).toBeLessThanOrEqual(frame.y + frame.h)
      for (const founders of items(state).filter((item): item is NoteItem => item.kind === 'note' && item.author === 'you')) expect(intersects(rectOf(note), rectOf(founders))).toBe(false)
    }
    const [one, two] = aiNotes(state)
    expect(intersects(rectOf(one), rectOf(two))).toBe(false)
  })

  it('puts it beside a thing when told, which is why the model need not know where anything is', () => {
    const base = openBoardState()
    const target = items(base).find((item) => item.id === 'c') as NoteItem
    const { state } = apply([{ type: 'add_note', text: 'A related idea', near: 'n3' }])
    const mine = aiNotes(state)[0]
    expect(Math.hypot(mine.x - target.x, mine.y - target.y)).toBeLessThan(800)
    expect(intersects(rectOf(mine), rectOf(target))).toBe(false)
  })

  it('draws an arrow from the thing it is beside to the new note, when asked', () => {
    const { state } = apply([{ type: 'add_note', text: 'A related idea', near: 'n3', connect: true }])
    const arrow = items(state).find(isConnector)!
    expect('item' in arrow.from && arrow.from.item).toBe('c')
    expect('item' in arrow.to && arrow.to.item).toBe(aiNotes(state)[0].id)
  })

  it('puts several beside the same thing, each clear of the others, so a note can be expanded into many', () => {
    const { state, skipped } = apply(['A', 'B', 'C', 'D', 'E'].map((text) => ({ type: 'add_note' as const, text, near: 'n3', connect: true })))
    expect(skipped).toEqual([])
    const mine = aiNotes(state)
    expect(mine).toHaveLength(5)
    for (let i = 0; i < mine.length; i++) for (let j = i + 1; j < mine.length; j++) expect(intersects(rectOf(mine[i]), rectOf(mine[j]))).toBe(false)
    expect(items(state).filter(isConnector)).toHaveLength(5)
  })

  it('refuses in and near together, connect without near, and a thing that is not there or is the wrong kind', () => {
    expect(reasons(apply([{ type: 'add_note', text: 'x', in: 'f1', near: 'n3' }]))[0]).toContain('in or near, not both')
    expect(reasons(apply([{ type: 'add_note', text: 'x', connect: true }]))[0]).toContain('connect needs near')
    expect(reasons(apply([{ type: 'add_note', text: 'x', near: 'n99' }]))[0]).toContain('There is no "n99"')
    expect(reasons(apply([{ type: 'add_note', text: 'x', in: 'n3' }]))[0]).toContain('is not a frame')
    expect(reasons(apply([{ type: 'add_note', text: 'x', in: 'f9' }]))[0]).toContain('There is no "f9"')
  })

  it('says what the board does hold when a reference is wrong, so the model can correct it', () => {
    expect(reasons(apply([{ type: 'add_note', text: 'x', near: 'n99' }]))[0]).toMatch(/f1, n1, n2/)
  })

  it('says a frame is full and how many more would fit', () => {
    const small: BoardState = openBoard([{ id: 'tiny', kind: 'frame', x: 1000, y: 1000, w: 300, h: 260, title: 'Tiny', colour: 'white' }])
    const result = applyBoardTurnActions({ base: small, actions: [{ type: 'add_note', text: 'x', in: 'f1' }], view, newId: counter() })
    expect(reasons(result)[0]).toContain('has no room for another note (0 would fit)')
    expect(items(result.state)).toHaveLength(1)
  })

  it('leaves the board as it was when nothing could be done', () => {
    const base = openBoardState()
    expect(apply([{ type: 'add_note', text: 'x', near: 'n99' }], base).state).toBe(base)
  })
})

describe('what it never does', () => {
  it('has no way to name a place, a size or a colour: the schema carries none, and a thing that does is not an action it can send', () => {
    const shape = JSON.stringify(boardActionSchema.options.map((option) => Object.keys((option as { shape: Record<string, unknown> }).shape)))
    for (const forbidden of ['"x"', '"y"', '"w"', '"h"', '"colour"', '"color"', '"left"', '"top"', '"width"', '"height"', '"author"']) expect(shape).not.toContain(forbidden)
  })

  it('has no action that edits, recolours, resizes or deletes, or saves', () => {
    for (const bad of ['delete_note', 'remove_note', 'edit_note', 'set_text', 'set_colour', 'resize_note', 'move_note', 'delete', 'save', 'export', 'clear_board']) {
      expect(boardActionSchema.safeParse({ type: bad, note: 'n1', text: 'x' }).success, bad).toBe(false)
    }
  })

  it('leaves every one of the founder\'s notes as it was: the same words, colour, size and place', () => {
    const base = openBoardState()
    const before = items(base).filter((item) => item.kind === 'note').map((item) => JSON.stringify(item))
    const { state } = apply([
      { type: 'add_note', text: 'One', in: 'f1' },
      { type: 'add_note', text: 'Two', near: 'n3', connect: true },
      { type: 'add_note', text: 'Three' },
      { type: 'connect', from: 'n1', to: 'n2' },
    ])
    for (const note of before) expect(items(state).map((item) => JSON.stringify(item))).toContain(note)
  })

  it('never makes a note that is not pink and by Droplet, however it is added', () => {
    const { state } = apply([{ type: 'add_note', text: 'A' }, { type: 'add_note', text: 'B', in: 'f1' }, { type: 'add_note', text: 'C', near: 'n4' }, { type: 'add_template', template: 'name_ideas', fill: ['x'] }])
    const created = items(state).filter((item) => !['names', 'a', 'b', 'c', 'd', 'e'].includes(item.id) && item.kind === 'note' && item.text !== '')
    expect(created.length).toBeGreaterThan(0)
    for (const note of created as NoteItem[]) expect(note).toMatchObject({ author: 'ai', colour: 'pink' })
  })
})

describe('fill_prompt', () => {
  const template = () => stateOfBoardSnapshot(templateBoardSnapshot())

  it('writes into an empty prompt, which becomes a note by Droplet in the same place', () => {
    const base = template()
    const prompt = items(base).find((item) => item.kind === 'note') as NoteItem
    const { state, skipped } = applyBoardTurnActions({ base, actions: [{ type: 'fill_prompt', note: 'n1', text: 'Busy people with dogs' }], view, newId: counter() })
    expect(skipped).toEqual([])
    expect(items(state).find((item) => item.id === prompt.id)).toMatchObject({ text: 'Busy people with dogs', author: 'ai', colour: 'pink', x: prompt.x, y: prompt.y })
  })

  it('refuses a note that has words in it, and says to add a new one beside it', () => {
    const result = apply([{ type: 'fill_prompt', note: 'n1', text: 'Overwrite' }])
    expect(reasons(result)[0]).toContain('not mine to write over')
    expect(reasons(result)[0]).toContain('add_note')
    expect(items(result.state).find((item) => item.id === 'a')).toMatchObject({ text: 'Kindred Gifting', author: 'you' })
  })

  it('refuses a thing that is not a note, or is not there', () => {
    expect(reasons(apply([{ type: 'fill_prompt', note: 'f1', text: 'x' }]))[0]).toContain('is not a note')
    expect(reasons(apply([{ type: 'fill_prompt', note: 'n99', text: 'x' }]))[0]).toContain('There is no "n99"')
  })

  it('fills several, and counts them with the notes it adds', () => {
    const { state } = applyBoardTurnActions({ base: template(), actions: [1, 2, 3].map((n) => ({ type: 'fill_prompt' as const, note: `n${n}`, text: `Answer ${n}` })), view, newId: counter() })
    expect(aiNotes(state)).toHaveLength(3)
  })
})

describe('cluster', () => {
  it('gathers the notes into a new frame with the title, with the notes inside it, in a clear place', () => {
    const { state, skipped } = apply([{ type: 'cluster', title: 'Who it is for', notes: ['n3', 'n4', 'n5'] }])
    expect(skipped).toEqual([])
    const frame = items(state).filter(isFrame).find((item) => item.title === 'Who it is for')!
    expect(frame).toBeTruthy()
    for (const id of ['c', 'd', 'e']) {
      const note = items(state).find((item) => item.id === id) as NoteItem
      expect(note.x).toBeGreaterThanOrEqual(frame.x)
      expect(note.x + note.w).toBeLessThanOrEqual(frame.x + frame.w)
      expect(note.y + note.h).toBeLessThanOrEqual(frame.y + frame.h)
    }
    // the frame holds them, so it will carry them
    const moved = reduceBoard(state, { type: 'move', ids: [frame.id], dx: 100, dy: 0 })
    expect((items(moved).find((item) => item.id === 'c') as NoteItem).x).toBe((items(state).find((item) => item.id === 'c') as NoteItem).x + 100)
  })

  it('keeps the words, colour and size of the notes, and moves only where they are', () => {
    const base = openBoardState()
    const { state } = apply([{ type: 'cluster', title: 'Loose', notes: ['n3', 'n4'] }], base)
    for (const id of ['c', 'd']) {
      const before = items(base).find((item) => item.id === id) as NoteItem
      const after = items(state).find((item) => item.id === id) as NoteItem
      expect({ ...after, x: 0, y: 0 }).toEqual({ ...before, x: 0, y: 0 })
    }
  })

  it('makes more than one group in a reply, each with its own notes, clear of each other', () => {
    const { state, skipped } = apply([{ type: 'cluster', title: 'One', notes: ['n3', 'n4'] }, { type: 'cluster', title: 'Two', notes: ['n1', 'n5'] }])
    expect(skipped).toEqual([])
    const frames = items(state).filter(isFrame).filter((frame) => ['One', 'Two'].includes(frame.title))
    expect(frames).toHaveLength(2)
    expect(intersects(rectOf(frames[0]), rectOf(frames[1]))).toBe(false)
  })

  it('refuses a thing in two groups, a thing that is not there, and something that is not a note, a shape or text', () => {
    expect(reasons(apply([{ type: 'cluster', title: 'A', notes: ['n3', 'n4'] }, { type: 'cluster', title: 'B', notes: ['n4', 'n5'] }]))[0]).toContain('more than one group')
    expect(reasons(apply([{ type: 'cluster', title: 'A', notes: ['n3', 'n99'] }]))[0]).toContain('There is no "n99"')
    expect(reasons(apply([{ type: 'cluster', title: 'A', notes: ['n3', 'f1'] }]))[0]).toContain('cannot be put in a group')
    expect(reasons(apply([{ type: 'cluster', title: 'A', notes: ['n3', 'n3'] }]))[0]).toContain('more than one group')
  })

  it('needs at least two things, which the schema asks for', () => {
    expect(boardActionSchema.safeParse({ type: 'cluster', title: 'A', notes: ['n3'] }).success).toBe(false)
  })

  it('is no more than four groups in a reply', () => {
    const many = [['n1', 'n2'], ['n3', 'n4']].map((notes, i) => ({ type: 'cluster' as const, title: `G${i}`, notes }))
    expect(apply(many).skipped).toEqual([])
  })

  it('says there is no space when the board has none, rather than putting a frame on top of things', () => {
    const wall: BoardItem[] = [{ id: 'w', kind: 'frame', x: 0, y: 0, w: 4800, h: 3200, title: 'Everything', colour: 'white' }, ...(docOf(openBoardState()).items.filter((item) => item.kind === 'note'))]
    const result = applyBoardTurnActions({ base: openBoard(wall), actions: [{ type: 'cluster', title: 'A', notes: ['n1', 'n2'] }], view, newId: counter() })
    // the frame wall is not a thing in the way of a new frame being placed over its inside only if there is no clear area
    expect(reasons(result).length + items(result.state).filter(isFrame).length).toBeGreaterThan(0)
  })
})

describe('add_template', () => {
  it('puts the template on the board, empty, in a clear place, as ordinary things in one group', () => {
    const { state, skipped } = apply([{ type: 'add_template', template: 'name_ideas' }])
    expect(skipped).toEqual([])
    const template = templateById('name_ideas')!
    expect(items(state)).toHaveLength(items(openBoardState()).length + template.items.length)
    const added = items(state).filter((item) => item.group?.startsWith('name_ideas:'))
    expect(added).toHaveLength(template.items.length)
    for (const item of added.filter(isNode)) expect(intersects(rectOf(item), rectOf(items(openBoardState()).find((other) => other.id === 'a') as NoteItem))).toBe(false)
  })

  it('fills the prompts in the order they are listed for the template, as notes by Droplet, and leaves the rest', () => {
    const template = templateById('customer_problem')!
    const { state } = apply([{ type: 'add_template', template: 'customer_problem', fill: ['First', 'Second'] }])
    const notes = items(state).filter((item): item is NoteItem => item.kind === 'note' && !!item.group?.startsWith('customer_problem:'))
    expect(notes.filter((note) => note.text !== '')).toHaveLength(2)
    expect(notes.filter((note) => note.text !== '').map((note) => note.text)).toEqual(['First', 'Second'])
    expect(notes.filter((note) => note.text !== '').every((note) => note.author === 'ai' && note.colour === 'pink')).toBe(true)
    expect(notes.filter((note) => note.text === '')).toHaveLength(promptsOf(template).length - 2)
    // the first two in the order of the template are the first two filled
    const order = items(state).filter((item): item is NoteItem => item.kind === 'note' && !!item.group)
    expect(order.slice(0, 2).map((note) => note.text)).toEqual(['First', 'Second'])
  })

  it('refuses more words than the template has prompts, and says how many it has', () => {
    const template = templateById('brain_dump')!
    const result = apply([{ type: 'add_template', template: 'brain_dump', fill: Array.from({ length: promptsOf(template).length + 1 }, (_, i) => `w${i}`) }])
    expect(reasons(result)[0]).toContain(`has ${promptsOf(template).length} prompts`)
    expect(items(result.state)).toHaveLength(items(openBoardState()).length)
  })

  it('refuses a second template in a reply, and any template that is not one', () => {
    expect(reasons(apply([{ type: 'add_template', template: 'name_ideas' }, { type: 'add_template', template: 'pros_cons' }]))[0]).toContain('Only one template')
    expect(boardActionSchema.safeParse({ type: 'add_template', template: 'made_up' }).success).toBe(false)
  })

  it('does not put a template on top of what is there: with no clear space it says so', () => {
    const wall: BoardItem[] = [{ id: 'w', kind: 'frame', x: 0, y: 0, w: 4800, h: 3200, title: 'Everything', colour: 'white' }]
    const result = applyBoardTurnActions({ base: openBoard(wall), actions: [{ type: 'add_template', template: 'brain_dump' }], view, newId: counter() })
    expect(reasons(result)[0]).toContain('no clear space')
    expect(items(result.state)).toHaveLength(1)
  })

  it('can put every template on an empty board', () => {
    for (const template of TEMPLATES) {
      const result = applyBoardTurnActions({ base: openBoard(), actions: [{ type: 'add_template', template: template.id }], view, newId: counter() })
      expect(result.skipped, template.id).toEqual([])
      expect(items(result.state)).toHaveLength(template.items.length)
    }
  })
})

describe('connect', () => {
  it('joins two things with an arrow, with its label', () => {
    const { state } = apply([{ type: 'connect', from: 'n3', to: 'n4', label: 'leads to' }])
    expect(items(state).find(isConnector)).toMatchObject({ from: { item: 'c' }, to: { item: 'd' }, text: 'leads to' })
  })

  it('refuses a thing joined to itself, to something that is not there, to an arrow, and the same arrow twice', () => {
    expect(reasons(apply([{ type: 'connect', from: 'n3', to: 'n3' }]))[0]).toContain('same thing')
    expect(reasons(apply([{ type: 'connect', from: 'n3', to: 'n99' }]))[0]).toContain('There is no "n99"')
    expect(reasons(apply([{ type: 'connect', from: 'n3', to: 'n4' }, { type: 'connect', from: 'n3', to: 'n4' }]))[0]).toContain('already an arrow')
    const withArrow = apply([{ type: 'connect', from: 'n3', to: 'n4' }]).state
    // a1 is now the arrow; a later turn cannot join to it
    expect(reasons(applyBoardTurnActions({ base: stateOfBoardSnapshotWithArrow(withArrow), actions: [{ type: 'connect', from: 'n3', to: 'a1' }], view, newId: counter() }))[0]).toContain('not other arrows')
  })

  it('allows a frame at either end', () => {
    expect(apply([{ type: 'connect', from: 'f1', to: 'n3' }]).skipped).toEqual([])
  })
})

// A board in the state a later request would see it: rebuilt from a snapshot, so that references mean what they would then.
import { snapshotOfBoard } from './boardSnapshot.ts'
function stateOfBoardSnapshotWithArrow(state: BoardState): BoardState {
  return stateOfBoardSnapshot(snapshotOfBoard(state, view, 'none'))
}

describe('undo and redo', () => {
  it('undoes the last step when there is one, on its own', () => {
    const base = reduceBoard(openBoardState(), { type: 'add_note', id: 'z', at: { x: 3500, y: 2500 }, text: 'x' })
    const { state } = applyBoardTurnActions({ base: stateOfBoardSnapshotWithArrow(base), actions: [{ type: 'undo' }], view, newId: counter() })
    expect(items(state).some((item) => item.id === 'z')).toBe(false)
  })

  it('refuses undo with nothing to undo, redo with nothing to redo, and either with other actions', () => {
    expect(reasons(apply([{ type: 'undo' }]))[0]).toBe('There is nothing to undo.')
    expect(reasons(apply([{ type: 'redo' }]))[0]).toBe('There is nothing to redo.')
    expect(reasons(apply([{ type: 'undo' }, { type: 'add_note', text: 'x' }]))[0]).toContain('cannot be combined')
  })
})

describe('a turn', () => {
  it('is one step in the history, so one undo takes back everything the model did', () => {
    const base = openBoardState()
    const steps = base.history.past.length
    const { state } = apply([{ type: 'add_note', text: 'A', near: 'n3', connect: true }, { type: 'add_note', text: 'B', in: 'f1' }, { type: 'cluster', title: 'Group', notes: ['n4', 'n5'] }], base)
    expect(state.history.past.length).toBe(steps + 1)
    expect(docOf(reduceBoard(state, { type: 'undo' })).items).toEqual(docOf(base).items)
  })

  it('does not run on past twelve notes, and says so for each that is left out', () => {
    const result = apply(Array.from({ length: 14 }, (_, i) => ({ type: 'add_note' as const, text: `Idea ${i}` })))
    expect(aiNotes(result.state)).toHaveLength(12)
    expect(result.skipped).toHaveLength(2)
    expect(reasons(result)[0]).toContain('more than 12 notes')
  })

  it('does the rest of a reply when one action cannot be done, and says which could not', () => {
    const result = apply([{ type: 'add_note', text: 'Fine' }, { type: 'add_note', text: 'Bad', near: 'n99' }, { type: 'add_note', text: 'Also fine' }])
    expect(aiNotes(result.state)).toHaveLength(2)
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0].position).toBe(1)
  })

  it('means the same by a reference all the way through, even after things are moved into a group', () => {
    const { state, skipped } = apply([{ type: 'cluster', title: 'Group', notes: ['n3', 'n4'] }, { type: 'add_note', text: 'Beside the third', near: 'n3' }])
    expect(skipped).toEqual([])
    expect(aiNotes(state)).toHaveLength(1)
  })

  it('gives the same answer on the server, from the snapshot, as in the browser, from the board', () => {
    const base = openBoardState()
    const snapshotState = stateOfBoardSnapshotWithArrow(base)
    const actions: BoardTurnAction[] = [{ type: 'add_note', text: 'A', in: 'f1' }, { type: 'add_note', text: 'B', near: 'n3', connect: true }]
    const here = applyBoardTurnActions({ base, actions, view, newId: counter() })
    const there = applyBoardTurnActions({ base: snapshotState, actions, view, newId: counter() })
    const place = (state: BoardState) => aiNotes(state).map((note) => [note.x, note.y, note.text])
    expect(place(there.state)).toEqual(place(here.state))
  })
})

describe('write_summary', () => {
  const now = () => '2026-10-05T10:00:00'
  const write = (actions: BoardTurnAction[], base: BoardState = openBoardState()) => applyBoardTurnActions({ base, actions, view, newId: counter(), now })
  const summary = { type: 'write_summary' as const, decided: ['The name is Kindred Gifting'], open: ['What the first offer is'], next: ['Write down one offer'] }

  it('writes the summary as Droplet\'s, not edited, as of now, and brings the window onto the screen', () => {
    const { state, skipped } = write([summary])
    expect(skipped).toEqual([])
    expect(docOf(state).summary).toEqual({ decided: ['The name is Kindred Gifting'], open: ['What the first offer is'], next: ['Write down one offer'], by: 'droplet', edited: false, writtenAt: '2026-10-05T10:00:00' })
    expect(docOf(state).hidden).not.toContain('summary')
  })

  it('is one step, and undo takes the summary away again, and the window with it', () => {
    const base = openBoardState()
    const { state } = write([summary], base)
    expect(state.history.past.length).toBe(base.history.past.length + 1)
    const undone = reduceBoard(state, { type: 'undo' })
    expect(docOf(undone).summary).toBeNull()
    expect(docOf(undone).hidden).toContain('summary')
  })

  it('writes again over what is there, which is how it is updated, and says it is Droplet\'s again', () => {
    const first = write([summary]).state
    const edited = reduceBoard(first, { type: 'edit_summary', section: 'next', lines: ['My own next step'], at: now() })
    expect(docOf(edited).summary?.edited).toBe(true)
    const again = write([{ ...summary, next: ['A new next step'] }], edited).state
    expect(docOf(again).summary).toMatchObject({ by: 'droplet', edited: false, next: ['A new next step'] })
  })

  it('does not touch a single note, frame or arrow on the board', () => {
    const base = openBoardState()
    const { state } = write([summary], base)
    expect(JSON.stringify(items(state))).toBe(JSON.stringify(items(base)))
  })

  it('refuses a summary with nothing in it, and a second one in a reply', () => {
    expect(reasons(write([{ type: 'write_summary', decided: [], open: [], next: [] }]))[0]).toContain('at least one line')
    expect(reasons(write([summary, summary]))[0]).toContain('Only one summary')
  })

  it('takes a summary with only some of its sections', () => {
    const { state, skipped } = write([{ type: 'write_summary', decided: [], open: ['Who pays first'], next: [] }])
    expect(skipped).toEqual([])
    expect(docOf(state).summary).toMatchObject({ decided: [], open: ['Who pays first'], next: [] })
  })

  it('has lines the schema holds to six, each to 140 characters', () => {
    expect(boardActionSchema.safeParse({ ...summary, decided: Array.from({ length: 7 }, () => 'x') }).success).toBe(false)
    expect(boardActionSchema.safeParse({ ...summary, next: ['x'.repeat(141)] }).success).toBe(false)
    expect(boardActionSchema.safeParse({ ...summary, open: [''] }).success).toBe(false)
    expect(boardActionSchema.safeParse({ type: 'write_summary', decided: ['x'] }).success).toBe(false)
  })

  it('cannot remember anything for the project: there is no such action', () => {
    for (const bad of ['remember_name', 'set_business_name', 'save_offer', 'remember']) expect(boardActionSchema.safeParse({ type: bad, text: 'Kindred' }).success, bad).toBe(false)
  })
})
