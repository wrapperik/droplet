import { beforeEach, describe, expect, it } from 'vitest'
import { clearBoard, loadBoard, openBoardForProject, saveBoard } from './boardStore.ts'
import { BOARD_LAYOUT, docOf, isBoardUnsaved, openBoard, reduceBoard, type BoardItem } from './boardState.ts'

const data = {
  items: [{ id: 'a', kind: 'note' as const, x: 100, y: 100, w: 200, h: 180, text: 'Hello', colour: 'yellow' as const, author: 'you' as const }],
  layout: BOARD_LAYOUT,
}

beforeEach(() => window.localStorage.clear())

describe('boardStore', () => {
  it('saves and loads a board per project', async () => {
    expect(await saveBoard('duckstack', data)).not.toBeNull()
    expect((await loadBoard('duckstack'))?.items).toEqual(data.items)
    expect(await loadBoard('other')).toBeNull()
  })

  it('reads nothing from storage that is not a board', async () => {
    window.localStorage.setItem('droplet-project-duckstack-board', '{not json')
    expect(await loadBoard('duckstack')).toBeNull()
    window.localStorage.setItem('droplet-project-duckstack-board', JSON.stringify({ items: 'no' }))
    expect(await loadBoard('duckstack')).toBeNull()
  })

  it('refuses a note with a colour that does not exist, or one far off the board', async () => {
    const bad = async (note: object) => {
      window.localStorage.setItem('droplet-project-duckstack-board', JSON.stringify({ ...data, items: [{ ...data.items[0], ...note }], savedAt: 'x' }))
      return await loadBoard('duckstack')
    }
    expect(await bad({ colour: 'purple' })).toBeNull()
    expect(await bad({ x: 99999 })).toBeNull()
    expect(await bad({ kind: 'frame' })).toBeNull()
    expect(await bad({})).not.toBeNull()
  })

  it('clears a board', async () => {
    await saveBoard('duckstack', data)
    await clearBoard('duckstack')
    expect(await loadBoard('duckstack')).toBeNull()
  })

  it('opens an empty board when nothing is saved, and the saved one when there is', async () => {
    expect(docOf(await openBoardForProject('duckstack')).items).toEqual([])
    await saveBoard('duckstack', data)
    expect(docOf(await openBoardForProject('duckstack')).items).toEqual(data.items)
  })

  it('opens with the default arrangement, whatever arrangement an older save holds', async () => {
    const start = openBoard()
    const moved = reduceBoard(start, { type: 'resize', id: 'board', value: 16 })
    const doc = docOf(moved)
    await saveBoard('duckstack', { items: doc.items, layout: doc.layout, tools: doc.tools, expanded: ['select'], hidden: ['select'] })
    const opened = docOf(await openBoardForProject('duckstack'))
    expect(opened.layout).toEqual(docOf(openBoard()).layout)
    expect(opened.expanded).toEqual([])
    expect(opened.hidden).toEqual(docOf(openBoard()).hidden)
  })

  it('reads a save that has no layout', async () => {
    window.localStorage.setItem('droplet-project-duckstack-board', JSON.stringify({ items: [], savedAt: 'x' }))
    expect(await loadBoard('duckstack')).toMatchObject({ items: [] })
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

  it('saves and loads all of them, and opens a board that is the same as the one saved', async () => {
    const state = openBoard(everything)
    const doc = docOf(state)
    expect(await saveBoard('duckstack', { items: doc.items, layout: doc.layout, tools: doc.tools, expanded: doc.expanded, hidden: doc.hidden })).not.toBeNull()
    const saved = (await loadBoard('duckstack'))!
    expect(saved.items).toHaveLength(6)
    // read back with its fields in another order, it is still the same board
    expect(isBoardUnsaved(docOf(await openBoardForProject('duckstack')), saved)).toBe(false)
    expect(isBoardUnsaved(doc, saved)).toBe(false)
  })

  it('still reads a save from before there were shapes, text, frames and arrows', async () => {
    window.localStorage.setItem('droplet-project-duckstack-board', JSON.stringify({ ...data, savedAt: 'x' }))
    expect((await loadBoard('duckstack'))?.items).toEqual(data.items)
  })

  it('refuses a shape of a kind that does not exist, a frame in a colour that does not, and an arrow with an end that is neither', async () => {
    const bad = async (item: object) => {
      window.localStorage.setItem('droplet-project-duckstack-board', JSON.stringify({ items: [item], layout: BOARD_LAYOUT, savedAt: 'x' }))
      return await loadBoard('duckstack')
    }
    expect(await bad({ ...everything[2], shape: 'star' })).toBeNull()
    expect(await bad({ ...everything[0], colour: 'pink' })).toBeNull()
    expect(await bad({ ...everything[3], size: 'huge' })).toBeNull()
    expect(await bad({ ...everything[4], from: { nowhere: 1 } })).toBeNull()
    expect(await bad({ ...everything[4], style: 'curvy' })).toBeNull()
    expect(await bad({ ...everything[5], to: { x: 99999, y: 0 } })).toBeNull()
    expect(await bad(everything[5])).not.toBeNull()
  })

  it('opens without an arrow whose thing is gone, since the arrow would have nowhere to go', () => {
    const state = openBoard(everything.filter((item) => item.id !== 's'))
    expect(docOf(state).items.map((item) => item.id)).toEqual(['f', 'n', 't'])
  })
})

describe('boardStore with hints and groups', () => {
  it('saves and loads them, and a thing without them is as it was', async () => {
    const items: BoardItem[] = [
      { id: 'a', kind: 'note', x: 100, y: 100, w: 200, h: 180, text: '', hint: 'Who is it for?', group: 'customer_problem:1', colour: 'yellow', author: 'you' },
      { id: 'f', kind: 'frame', x: 0, y: 0, w: 400, h: 300, title: 'Who?', colour: 'lilac', group: 'customer_problem:1' },
      { id: 'c', kind: 'connector', from: { item: 'f' }, to: { item: 'a' }, style: 'straight', head: 'end', text: '', group: 'customer_problem:1' },
      { id: 'plain', kind: 'note', x: 900, y: 900, w: 200, h: 180, text: 'mine', colour: 'sky', author: 'you' },
    ]
    const state = openBoard(items)
    const doc = docOf(state)
    await saveBoard('duckstack', { items: doc.items, layout: doc.layout, tools: doc.tools, expanded: doc.expanded, hidden: doc.hidden })
    const loaded = (await loadBoard('duckstack'))!
    expect(loaded.items.find((item) => item.id === 'a')).toMatchObject({ hint: 'Who is it for?', group: 'customer_problem:1' })
    expect(loaded.items.find((item) => item.id === 'plain')).not.toHaveProperty('hint')
    expect(isBoardUnsaved(docOf(await openBoardForProject('duckstack')), loaded)).toBe(false)
  })

  it('refuses a hint or a group that is too long', async () => {
    const note = { id: 'a', kind: 'note', x: 1, y: 1, w: 200, h: 180, text: '', colour: 'yellow', author: 'you' }
    window.localStorage.setItem('droplet-project-duckstack-board', JSON.stringify({ items: [{ ...note, hint: 'h'.repeat(121) }], layout: BOARD_LAYOUT, savedAt: 'x' }))
    expect(await loadBoard('duckstack')).toBeNull()
    window.localStorage.setItem('droplet-project-duckstack-board', JSON.stringify({ items: [{ ...note, group: 'g'.repeat(81) }], layout: BOARD_LAYOUT, savedAt: 'x' }))
    expect(await loadBoard('duckstack')).toBeNull()
  })
})

describe('a save from when the board had a summary', () => {
  it('still opens: the summary and its window are ignored, and nothing else is lost', async () => {
    const doc = docOf(openBoard(data.items))
    window.localStorage.setItem(
      'droplet-project-duckstack-board',
      JSON.stringify({
        items: doc.items,
        summary: { decided: ['A name'], open: [], next: [], by: 'droplet', edited: false, writtenAt: '2026-10-05T10:00:00' },
        layout: [...doc.layout, { id: 'summary', col: 0, row: 22, w: 12 }],
        tools: doc.tools,
        expanded: [],
        hidden: ['summary'],
        savedAt: 'x',
      }),
    )
    const loaded = await loadBoard('duckstack')
    expect(loaded).not.toBeNull()
    const reopened = docOf(await openBoardForProject('duckstack'))
    expect(reopened.items).toEqual(doc.items)
    expect(reopened).not.toHaveProperty('summary')
  })
})
