import { describe, expect, it } from 'vitest'
import { docOf, openBoard, reduceBoard } from '../lib/boardState.ts'
import { TEMPLATES, promptsOf } from '../lib/boardTemplates.ts'
import type { BoardItem, NoteItem } from '../lib/boardTypes.ts'
import { describeBoard, describeTemplates, refsOf, snapshotOfBoard, stateOfBoardSnapshot } from './boardSnapshot.ts'
import { MAX_SNAPSHOT_ITEMS, boardSnapshotSchema } from './boardSpec.ts'
import { openBoardSnapshot, openBoardState, templateBoardSnapshot } from './fixtures.ts'

const note = (id: string, x: number, y: number, extra: Partial<NoteItem> = {}): NoteItem => ({ id, kind: 'note', x, y, w: 200, h: 180, text: id, colour: 'yellow', author: 'you', ...extra })
const view = { x: 2000, y: 1500 }

describe('refsOf', () => {
  it('names things by their kind and their number in the order they are drawn, from 1', () => {
    const state = openBoard([
      note('a', 100, 100),
      { id: 'f', kind: 'frame', x: 0, y: 0, w: 400, h: 300, title: 'F', colour: 'white' },
      { id: 's', kind: 'shape', shape: 'ellipse', x: 800, y: 100, w: 200, h: 140, text: '', colour: 'white' },
      note('b', 1200, 100),
      { id: 't', kind: 'text', x: 1600, y: 100, w: 240, h: 60, text: 'x', size: 'body' },
      { id: 'c', kind: 'connector', from: { item: 'a' }, to: { item: 'b' }, style: 'straight', head: 'end', text: '' },
    ])
    const refs = refsOf(docOf(state).items)
    expect([...refs.values()].sort()).toEqual(['a1', 'f1', 'n1', 'n2', 's1', 't1'])
    expect(refs.get('f')).toBe('f1')
    expect(refs.get('a')).toBe('n1')
    expect(refs.get('b')).toBe('n2')
    expect(refs.get('c')).toBe('a1')
  })

  it('counts each kind on its own, so a new frame does not change the number of a note', () => {
    const before = refsOf(docOf(openBoard([note('a', 100, 100), note('b', 600, 100)])).items)
    const after = refsOf(docOf(openBoard([note('a', 100, 100), note('b', 600, 100), { id: 'f', kind: 'frame', x: 2000, y: 2000, w: 400, h: 300, title: '', colour: 'white' }])).items)
    expect(after.get('a')).toBe(before.get('a'))
    expect(after.get('b')).toBe(before.get('b'))
  })
})

describe('snapshotOfBoard', () => {
  it('is a valid snapshot, with each thing by its reference, its words and its place', () => {
    const snapshot = openBoardSnapshot()
    expect(boardSnapshotSchema.safeParse(snapshot).success).toBe(true)
    expect(snapshot.items.find((item) => item.ref === 'f1')).toMatchObject({ kind: 'frame', title: 'Name ideas' })
    expect(snapshot.items.find((item) => item.ref === 'n3')).toMatchObject({ kind: 'note', text: 'Corporate clients in Pretoria', author: 'you' })
    expect(snapshot.more).toBe(0)
    expect(snapshot.view).toEqual({ x: 2200, y: 1400 })
  })

  it('says what is selected, by reference', () => {
    expect(openBoardSnapshot(['c']).selection).toEqual(['n3'])
    expect(openBoardSnapshot([]).selection).toEqual([])
  })

  it('carries a prompt\'s hint and the template it came from', () => {
    const snapshot = templateBoardSnapshot()
    const prompt = snapshot.items.find((item) => item.kind === 'note')!
    expect(prompt).toMatchObject({ text: '', template: 'customer_problem' })
    expect('hint' in prompt && prompt.hint).toBe('Describe one real person')
    expect(snapshot.items.find((item) => item.kind === 'frame')).toMatchObject({ template: 'customer_problem' })
  })

  it('cuts long words, and keeps the view on the board', () => {
    const state = openBoard([note('a', 100, 100, { text: 'x'.repeat(500) })])
    const snapshot = snapshotOfBoard(state, { x: 99999, y: -5 }, 'none')
    expect((snapshot.items[0] as unknown as NoteItem).text).toHaveLength(160)
    expect(snapshot.view).toEqual({ x: 4800, y: 0 })
    expect(boardSnapshotSchema.safeParse(snapshot).success).toBe(true)
  })

  it('says whether it can be undone, redone and saved', () => {
    const state = reduceBoard(openBoardState(), { type: 'delete', ids: ['a'] })
    expect(snapshotOfBoard(state, view, 'unsaved')).toMatchObject({ canUndo: true, canRedo: false, saved: 'unsaved' })
    expect(snapshotOfBoard(reduceBoard(state, { type: 'undo' }), view, 'saved')).toMatchObject({ canUndo: false, canRedo: true, saved: 'saved' })
  })

  it('shows a board of more than it can hold with its frames, what is selected and then the rest, and says how many are not shown', () => {
    const items: BoardItem[] = [{ id: 'f', kind: 'frame', x: 0, y: 0, w: 400, h: 300, title: 'F', colour: 'white' }]
    for (let i = 0; i < MAX_SNAPSHOT_ITEMS + 30; i++) items.push(note(`n${i}`, (i % 20) * 200, 400 + Math.floor(i / 20) * 200))
    const state = reduceBoard(openBoard(items), { type: 'select', ids: [`n${MAX_SNAPSHOT_ITEMS + 25}`] })
    const snapshot = snapshotOfBoard(state, view, 'none')
    expect(snapshot.items).toHaveLength(MAX_SNAPSHOT_ITEMS)
    expect(snapshot.more).toBe(1 + MAX_SNAPSHOT_ITEMS + 30 - MAX_SNAPSHOT_ITEMS)
    expect(snapshot.items.some((item) => item.kind === 'frame')).toBe(true)
    // the selected one is shown, whatever its place in the order, and the selection says so
    expect(snapshot.selection).toHaveLength(1)
    expect(boardSnapshotSchema.safeParse(snapshot).success).toBe(true)
  })

  it('shows an arrow only joined to what is shown', () => {
    const items: BoardItem[] = [note('a', 100, 100), note('b', 600, 100), { id: 'c', kind: 'connector', from: { item: 'a' }, to: { item: 'b' }, style: 'elbow', head: 'both', text: 'then' }]
    const arrow = snapshotOfBoard(openBoard(items), view, 'none').items.find((item) => item.kind === 'connector')
    expect(arrow).toMatchObject({ ref: 'a1', from: 'n1', to: 'n2', style: 'elbow', head: 'both', text: 'then' })
  })
})

describe('stateOfBoardSnapshot', () => {
  it('rebuilds a board whose things have their references as ids, in the same places', () => {
    const state = stateOfBoardSnapshot(openBoardSnapshot())
    const items = docOf(state).items
    expect(items.map((item) => item.id).sort()).toEqual(['f1', 'n1', 'n2', 'n3', 'n4', 'n5'])
    const original = docOf(openBoardState()).items.find((item) => item.id === 'c') as NoteItem
    expect(items.find((item) => item.id === 'n3')).toMatchObject({ x: original.x, y: original.y, w: original.w, text: original.text })
  })

  it('has the selection, and the history that lets undo and redo be allowed or refused as they were', () => {
    const snapshot = { ...openBoardSnapshot(['c']), canUndo: true, canRedo: false }
    const state = stateOfBoardSnapshot(snapshot)
    expect(state.selection).toEqual(['n3'])
    expect(state.history.past).toHaveLength(1)
    expect(state.history.future).toHaveLength(0)
    expect(stateOfBoardSnapshot({ ...snapshot, canUndo: false }).history.past).toHaveLength(0)
  })

  it('keeps an arrow only where what it joins is there', () => {
    const snapshot = { ...openBoardSnapshot(), items: [...openBoardSnapshot().items, { ref: 'a1', kind: 'connector' as const, from: 'n1', to: 'n9', style: 'straight' as const, head: 'end' as const, text: '' }] }
    expect(docOf(stateOfBoardSnapshot(snapshot)).items.some((item) => item.id === 'a1')).toBe(false)
  })

  it('knows which things came from a template', () => {
    const items = docOf(stateOfBoardSnapshot(templateBoardSnapshot())).items
    expect(items.every((item) => item.group?.startsWith('customer_problem:'))).toBe(true)
  })
})

describe('describeBoard', () => {
  const described = describeBoard(openBoardSnapshot()) as {
    frames: { ref: string; title: string; holds: string[] }[]
    things: { ref: string; by: string; text: string; inFrame?: string; selected?: boolean }[]
    emptyPrompts: { ref: string }[]
    selected: string[]
  }

  it('says which frame holds what, with the founder\'s words', () => {
    expect(described.frames).toHaveLength(1)
    expect(described.frames[0]).toMatchObject({ ref: 'f1', title: 'Name ideas', holds: ['n1', 'n2'] })
    expect(described.things.find((thing) => thing.ref === 'n1')).toMatchObject({ text: 'Kindred Gifting', by: 'the founder', inFrame: 'f1' })
    expect(described.things.find((thing) => thing.ref === 'n3')?.inFrame).toBeUndefined()
  })

  it('says what is selected', () => {
    expect(described.selected).toEqual(['n3'])
    expect(described.things.find((thing) => thing.ref === 'n3')?.selected).toBe(true)
  })

  it('does not say where anything is: that is the app\'s to decide', () => {
    const text = JSON.stringify(described)
    expect(text).not.toMatch(/"(x|y|w|h)":/)
  })

  it('says which notes are Droplet\'s', () => {
    const state = reduceBoard(openBoardState(), { type: 'add_note', id: 'z', at: { x: 3500, y: 2500 }, text: 'An idea', author: 'ai' })
    const things = (describeBoard(snapshotOfBoard(state, view, 'none')) as { things: { text: string; by: string }[] }).things
    expect(things.find((thing) => thing.text === 'An idea')?.by).toBe('Droplet')
  })

  it('lists the empty prompts with their hints and the frame they are in, so they can be filled in', () => {
    const prompts = (describeBoard(templateBoardSnapshot()) as { emptyPrompts: { ref: string; hint?: string; inFrame?: string }[] }).emptyPrompts
    expect(prompts).toHaveLength(6)
    expect(prompts[0]).toMatchObject({ hint: 'Describe one real person', inFrame: 'f1' })
  })

  it('says how many things it cannot show', () => {
    const snapshot = { ...openBoardSnapshot(), more: 7 }
    expect((describeBoard(snapshot) as { notShown?: string }).notShown).toContain('7 more things')
    expect((describeBoard(openBoardSnapshot()) as { notShown?: string }).notShown).toBeUndefined()
  })
})

describe('describeTemplates', () => {
  it('lists every template, with the prompts that can be filled, in the order a fill is given in', () => {
    const text = describeTemplates()
    for (const template of TEMPLATES) {
      expect(text).toContain(template.id)
      expect(text).toContain(`has ${promptsOf(template).length} prompts`)
      for (const prompt of promptsOf(template)) expect(text).toContain(prompt.hint!)
    }
  })
})
