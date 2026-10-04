import { beforeEach, describe, expect, it } from 'vitest'
import { clearBoard, loadBoard, openBoardForProject, saveBoard } from './boardStore.ts'
import { BOARD_LAYOUT, docOf, isBoardUnsaved, openBoard, reduceBoard, type BoardItem } from './boardState.ts'

const data = {
  items: [{ id: 'a', kind: 'note' as const, x: 100, y: 100, w: 200, h: 180, text: 'Hello', colour: 'yellow' as const, author: 'you' as const }],
  layout: BOARD_LAYOUT,
}

beforeEach(() => window.localStorage.clear())

describe('boardStore', () => {
  it('saves and loads a board per project', () => {
    expect(saveBoard('duckstack', data)).not.toBeNull()
    expect(loadBoard('duckstack')?.items).toEqual(data.items)
    expect(loadBoard('other')).toBeNull()
  })

  it('reads nothing from storage that is not a board', () => {
    window.localStorage.setItem('droplet-project-duckstack-board', '{not json')
    expect(loadBoard('duckstack')).toBeNull()
    window.localStorage.setItem('droplet-project-duckstack-board', JSON.stringify({ items: 'no' }))
    expect(loadBoard('duckstack')).toBeNull()
  })

  it('refuses a note with a colour that does not exist, or one far off the board', () => {
    const bad = (note: object) => {
      window.localStorage.setItem('droplet-project-duckstack-board', JSON.stringify({ ...data, items: [{ ...data.items[0], ...note }], savedAt: 'x' }))
      return loadBoard('duckstack')
    }
    expect(bad({ colour: 'purple' })).toBeNull()
    expect(bad({ x: 99999 })).toBeNull()
    expect(bad({ kind: 'frame' })).toBeNull()
    expect(bad({})).not.toBeNull()
  })

  it('clears a board', () => {
    saveBoard('duckstack', data)
    clearBoard('duckstack')
    expect(loadBoard('duckstack')).toBeNull()
  })

  it('opens an empty board when nothing is saved, and the saved one when there is', () => {
    expect(docOf(openBoardForProject('duckstack')).items).toEqual([])
    saveBoard('duckstack', data)
    expect(docOf(openBoardForProject('duckstack')).items).toEqual(data.items)
  })

  it('keeps how the workspace is arranged with the notes', () => {
    const start = openBoard()
    const moved = reduceBoard(start, { type: 'resize', id: 'board', value: 16 })
    const doc = docOf(moved)
    saveBoard('duckstack', { items: doc.items, layout: doc.layout, tools: doc.tools, expanded: doc.expanded, hidden: doc.hidden })
    expect(docOf(openBoardForProject('duckstack')).layout.find((placement) => placement.id === 'board')?.w).toBe(16)
  })
})


describe('boardStore with every kind of thing', () => {
  const everything: BoardItem[] = [
    { id: 'f', kind: 'frame', x: 100, y: 100, w: 800, h: 600, title: 'Offers', colour: 'sky' },
    { id: 'n', kind: 'note', x: 200, y: 200, w: 200, h: 180, text: 'A note', colour: 'pink', author: 'ai' },
    { id: 's', kind: 'shape', shape: 'diamond', x: 500, y: 200, w: 220, h: 180, text: 'Decide', colour: 'white' },
    { id: 't', kind: 'text', x: 100, y: 20, w: 240, h: 60, text: 'Heading', size: 'title' },
    { id: 'c', kind: 'connector', from: { item: 'n' }, to: { item: 's' }, style: 'elbow', head: 'both', text: 'then' },
    { id: 'd', kind: 'connector', from: { item: 's' }, to: { x: 1200, y: 900 }, style: 'straight', head: 'end', text: '' },
  ]

  it('saves and loads all of them, and opens a board that is the same as the one saved', () => {
    const state = openBoard(everything)
    const doc = docOf(state)
    expect(saveBoard('duckstack', { items: doc.items, layout: doc.layout, tools: doc.tools, expanded: doc.expanded, hidden: doc.hidden })).not.toBeNull()
    const saved = loadBoard('duckstack')!
    expect(saved.items).toHaveLength(6)
    // read back with its fields in another order, it is still the same board
    expect(isBoardUnsaved(docOf(openBoardForProject('duckstack')), saved)).toBe(false)
    expect(isBoardUnsaved(doc, saved)).toBe(false)
  })

  it('still reads a save from before there were shapes, text, frames and arrows', () => {
    window.localStorage.setItem('droplet-project-duckstack-board', JSON.stringify({ ...data, savedAt: 'x' }))
    expect(loadBoard('duckstack')?.items).toEqual(data.items)
  })

  it('refuses a shape of a kind that does not exist, a frame in a colour that does not, and an arrow with an end that is neither', () => {
    const bad = (item: object) => {
      window.localStorage.setItem('droplet-project-duckstack-board', JSON.stringify({ items: [item], layout: BOARD_LAYOUT, savedAt: 'x' }))
      return loadBoard('duckstack')
    }
    expect(bad({ ...everything[2], shape: 'star' })).toBeNull()
    expect(bad({ ...everything[0], colour: 'pink' })).toBeNull()
    expect(bad({ ...everything[3], size: 'huge' })).toBeNull()
    expect(bad({ ...everything[4], from: { nowhere: 1 } })).toBeNull()
    expect(bad({ ...everything[4], style: 'curvy' })).toBeNull()
    expect(bad({ ...everything[5], to: { x: 99999, y: 0 } })).toBeNull()
    expect(bad(everything[5])).not.toBeNull()
  })

  it('opens without an arrow whose thing is gone, since the arrow would have nowhere to go', () => {
    const state = openBoard(everything.filter((item) => item.id !== 's'))
    expect(docOf(state).items.map((item) => item.id)).toEqual(['f', 'n', 't'])
  })
})

describe('boardStore with hints and groups', () => {
  it('saves and loads them, and a thing without them is as it was', () => {
    const items: BoardItem[] = [
      { id: 'a', kind: 'note', x: 100, y: 100, w: 200, h: 180, text: '', hint: 'Who is it for?', group: 'customer_problem:1', colour: 'yellow', author: 'you' },
      { id: 'f', kind: 'frame', x: 0, y: 0, w: 400, h: 300, title: 'Who?', colour: 'lilac', group: 'customer_problem:1' },
      { id: 'c', kind: 'connector', from: { item: 'f' }, to: { item: 'a' }, style: 'straight', head: 'end', text: '', group: 'customer_problem:1' },
      { id: 'plain', kind: 'note', x: 900, y: 900, w: 200, h: 180, text: 'mine', colour: 'sky', author: 'you' },
    ]
    const state = openBoard(items)
    const doc = docOf(state)
    saveBoard('duckstack', { items: doc.items, layout: doc.layout, tools: doc.tools, expanded: doc.expanded, hidden: doc.hidden })
    const loaded = loadBoard('duckstack')!
    expect(loaded.items.find((item) => item.id === 'a')).toMatchObject({ hint: 'Who is it for?', group: 'customer_problem:1' })
    expect(loaded.items.find((item) => item.id === 'plain')).not.toHaveProperty('hint')
    expect(isBoardUnsaved(docOf(openBoardForProject('duckstack')), loaded)).toBe(false)
  })

  it('refuses a hint or a group that is too long', () => {
    const note = { id: 'a', kind: 'note', x: 1, y: 1, w: 200, h: 180, text: '', colour: 'yellow', author: 'you' }
    window.localStorage.setItem('droplet-project-duckstack-board', JSON.stringify({ items: [{ ...note, hint: 'h'.repeat(121) }], layout: BOARD_LAYOUT, savedAt: 'x' }))
    expect(loadBoard('duckstack')).toBeNull()
    window.localStorage.setItem('droplet-project-duckstack-board', JSON.stringify({ items: [{ ...note, group: 'g'.repeat(81) }], layout: BOARD_LAYOUT, savedAt: 'x' }))
    expect(loadBoard('duckstack')).toBeNull()
  })
})

describe('boardStore with a summary', () => {
  const summary = { decided: ['The name is Kindred Gifting'], open: ['Who pays first'], next: ['Talk to two firms'], by: 'droplet' as const, edited: true, writtenAt: '2026-10-05T10:00:00' }

  it('saves and loads it with the board, and opens a board with it, the same as it was saved', () => {
    const doc = docOf(openBoard(data.items, null, summary))
    saveBoard('duckstack', { items: doc.items, summary: doc.summary, layout: doc.layout, tools: doc.tools, expanded: doc.expanded, hidden: doc.hidden })
    const loaded = loadBoard('duckstack')!
    expect(loaded.summary).toEqual(summary)
    const reopened = docOf(openBoardForProject('duckstack'))
    expect(reopened.summary).toEqual(summary)
    expect(isBoardUnsaved(reopened, loaded)).toBe(false)
  })

  it('still reads a save from before there was a summary, and opens it with none', () => {
    saveBoard('duckstack', data)
    expect(loadBoard('duckstack')).not.toBeNull()
    expect(docOf(openBoardForProject('duckstack')).summary).toBeNull()
  })

  it('refuses a summary with an empty line, too many lines, or a stranger as its author', () => {
    const bad = (over: object) => {
      window.localStorage.setItem('droplet-project-duckstack-board', JSON.stringify({ ...data, summary: { ...summary, ...over }, savedAt: 'x' }))
      return loadBoard('duckstack')
    }
    expect(bad({ decided: [''] })).toBeNull()
    expect(bad({ open: Array.from({ length: 9 }, () => 'x') })).toBeNull()
    expect(bad({ next: ['x'.repeat(161)] })).toBeNull()
    expect(bad({ by: 'someone' })).toBeNull()
    expect(bad({})).not.toBeNull()
  })
})
