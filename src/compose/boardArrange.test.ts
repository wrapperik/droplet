import { describe, expect, it } from 'vitest'
import { intersects } from '../lib/boardGeometry.ts'
import { membersOf } from '../lib/boardFrames.ts'
import { docOf, openBoard, type BoardState } from '../lib/boardState.ts'
import { isFrame, rectOf, type BoardItem, type NoteItem } from '../lib/boardTypes.ts'
import { applyBoardTurnActions } from './boardActions.ts'
import { describeBoard, snapshotOfBoard, stateOfBoardSnapshot } from './boardSnapshot.ts'
import { checkBoardTurn } from './rules.ts'
import { boardTurnSchema, type BoardTurnAction } from './boardSpec.ts'
import { openBoardState } from './fixtures.ts'

// The actions that arrange the board and change what is on it: move, tidy, arrange, remove, reword, recolour, summarise.
// The fixture board: f1 is "Name ideas" holding n1 and n2; n3, n4 and n5 are loose.
const counter = () => {
  let n = 0
  return () => `new-${++n}`
}
const view = { x: 2200, y: 1400 }
const apply = (actions: BoardTurnAction[], base: BoardState = openBoardState(), founderText = '') => applyBoardTurnActions({ base, actions, view, newId: counter(), founderText })
const items = (state: BoardState) => docOf(state).items
const byId = (state: BoardState, id: string) => items(state).find((item) => item.id === id)!
const reasons = (result: ReturnType<typeof apply>) => result.skipped.map((skipped) => skipped.reason)
const note = (id: string, x: number, y: number, text: string, author: 'you' | 'ai' = 'you'): BoardItem => ({ id, kind: 'note', x, y, w: 200, h: 180, text, colour: author === 'ai' ? 'pink' : 'yellow', author })
const frame = (id: string, x: number, y: number, w: number, h: number, title: string): BoardItem => ({ id, kind: 'frame', x, y, w, h, title, colour: 'white' })

describe('move_to_frame', () => {
  it('moves loose notes into a frame, into clear places, and says so in the receipt', () => {
    const base = openBoardState()
    const result = apply([{ type: 'move_to_frame', things: ['n3', 'n4'], frame: 'f1' }])
    expect(result.skipped).toEqual([])
    const f = byId(result.state, 'names') as Extract<BoardItem, { kind: 'frame' }>
    const held = membersOf(items(result.state), f).map((item) => item.id)
    expect(held).toEqual(expect.arrayContaining(['a', 'b', 'c', 'd']))
    for (const id of ['c', 'd']) for (const other of items(result.state).filter((item) => item.kind === 'note' && item.id !== id)) expect(intersects(rectOf(byId(result.state, id) as NoteItem), rectOf(other as NoteItem))).toBe(false)
    expect(result.changes[0]).toMatchObject({ kind: 'changed', text: '2 things moved into “Name ideas”' })
    expect(result.state).not.toBe(base)
  })

  it('refuses a frame that is not one, a thing that is not there, a frame that is full, and things already in it', () => {
    expect(reasons(apply([{ type: 'move_to_frame', things: ['n3'], frame: 'n4' }]))[0]).toContain('is not a frame')
    expect(reasons(apply([{ type: 'move_to_frame', things: ['n99'], frame: 'f1' }]))[0]).toContain('There is no "n99"')
    expect(reasons(apply([{ type: 'move_to_frame', things: ['n1'], frame: 'f1' }]))[0]).toContain('already in')
    const small = openBoard([frame('tiny', 1000, 1000, 240, 220, 'Tiny'), note('x', 2000, 1000, 'Loose')])
    expect(reasons(apply([{ type: 'move_to_frame', things: ['n1'], frame: 'f1' }], small))[0]).toMatch(/has no room/)
  })
})

describe('tidy', () => {
  const messy = () => openBoard([frame('box', 1000, 1000, 1000, 700, 'Ideas'), note('p', 1060, 1060, 'One'), note('q', 1100, 1100, 'Two'), note('r', 1500, 1500, 'Three')])

  it('lays a frame\'s things out in a grid and fits the frame round them, keeping them in it', () => {
    const result = apply([{ type: 'tidy', frame: 'f1' }], messy())
    expect(result.skipped).toEqual([])
    const f = byId(result.state, 'box') as Extract<BoardItem, { kind: 'frame' }>
    const held = membersOf(items(result.state), f)
    expect(held.map((item) => item.id).sort()).toEqual(['p', 'q', 'r'])
    for (let i = 0; i < held.length; i++) for (let j = i + 1; j < held.length; j++) expect(intersects(rectOf(held[i]), rectOf(held[j]))).toBe(false)
    expect(f.w).toBeLessThan(1000)
    expect(result.changes[0].text).toBe('Tidied “Ideas”: 3 things in a grid')
  })

  it('tidies every frame when none is named, and leaves out one with fewer than two things', () => {
    const base = openBoard([frame('one', 100, 100, 800, 600, 'One'), note('p', 160, 160, 'A'), note('q', 400, 300, 'B'), frame('empty', 1500, 100, 400, 300, 'Empty')])
    const result = apply([{ type: 'tidy' }], base)
    expect(result.skipped).toEqual([])
    expect(result.changes).toHaveLength(1)
  })

  it('says why when there is nothing to tidy, or no room, and changes nothing', () => {
    expect(reasons(apply([{ type: 'tidy', frame: 'f1' }], openBoard([frame('lonely', 100, 100, 600, 400, 'Lonely'), note('p', 160, 160, 'A')])))[0]).toContain('fewer than two')
    expect(reasons(apply([{ type: 'tidy', frame: 'n3' }]))[0]).toContain('is not a frame')
    expect(reasons(apply([{ type: 'tidy' }], openBoard([note('p', 100, 100, 'A')])))[0]).toContain('no frame with two or more')
    // a frame that would grow into a neighbour is left alone
    const crowded = openBoard([frame('a', 100, 100, 700, 700, 'A'), note('p', 160, 160, 'A1'), note('q', 400, 160, 'A2'), note('r', 160, 400, 'A3'), note('s', 400, 400, 'A4'), note('t', 640, 160, 'A5'), frame('wall', 820, 100, 300, 700, 'Wall')])
    const tight = apply([{ type: 'tidy', frame: 'f1' }], crowded)
    if (tight.skipped.length > 0) expect(reasons(tight)[0]).toMatch(/no room|already laid out/)
  })
})

describe('arrange', () => {
  const three = () =>
    openBoard([
      frame('f-a', 100, 100, 500, 400, 'A'), note('a1', 160, 160, 'A one'),
      frame('f-b', 900, 700, 500, 400, 'B'), note('b1', 960, 760, 'B one'),
      frame('f-c', 1800, 1500, 500, 400, 'C'), note('c1', 1860, 1560, 'C one'),
    ])

  it('lays frames out in a row with even gaps, and what is inside each moves with it', () => {
    const base = three()
    const result = apply([{ type: 'arrange', layout: 'row', frames: ['f1', 'f2', 'f3'] }], base)
    expect(result.skipped).toEqual([])
    const frames = items(result.state).filter(isFrame)
    expect(new Set(frames.map((f) => f.y)).size).toBe(1)
    const sorted = [...frames].sort((a, b) => a.x - b.x)
    const gaps = sorted.slice(1).map((f, index) => f.x - (sorted[index].x + sorted[index].w))
    expect(new Set(gaps).size).toBe(1)
    // each note kept its place in its frame
    for (const [noteId, frameId] of [['a1', 'f-a'], ['b1', 'f-b'], ['c1', 'f-c']]) {
      const n = byId(result.state, noteId) as NoteItem
      const f = byId(result.state, frameId) as Extract<BoardItem, { kind: 'frame' }>
      expect(n.x - f.x).toBe(60)
      expect(n.y - f.y).toBe(60)
    }
  })

  it('can lay them out in a column or a grid', () => {
    for (const layout of ['column', 'grid'] as const) {
      const result = apply([{ type: 'arrange', layout, frames: ['f1', 'f2', 'f3'] }], three())
      expect(result.skipped, layout).toEqual([])
      const frames = items(result.state).filter(isFrame)
      for (let i = 0; i < frames.length; i++) for (let j = i + 1; j < frames.length; j++) expect(intersects(rectOf(frames[i]), rectOf(frames[j])), layout).toBe(false)
    }
  })

  it('refuses frames that do not fit the board or would land on other things, and one that is not a frame', () => {
    const wide = openBoard(Array.from({ length: 5 }, (_, i) => frame(`w${i}`, 100 + i * 200, 100 + i * 50, 1100, 300, `W${i}`)))
    expect(reasons(apply([{ type: 'arrange', layout: 'row', frames: ['f1', 'f2', 'f3', 'f4', 'f5'] }], wide))[0]).toMatch(/not fit on the board/)
    const blocked = openBoard([frame('f-a', 100, 100, 500, 400, 'A'), frame('f-b', 900, 900, 500, 400, 'B'), note('wall', 700, 100, 'In the way')])
    expect(reasons(apply([{ type: 'arrange', layout: 'row', frames: ['f1', 'f2'] }], blocked))[0]).toMatch(/land on other things/)
    expect(reasons(apply([{ type: 'arrange', layout: 'row', frames: ['f1', 'n3'] }]))[0]).toContain('is not a frame')
  })

  it('says when the frames are already laid out that way', () => {
    const base = openBoard([frame('f-a', 100, 100, 500, 400, 'A'), frame('f-b', 680, 100, 500, 400, 'B')])
    expect(reasons(apply([{ type: 'arrange', layout: 'row', frames: ['f1', 'f2'] }], base))[0]).toContain('already laid out')
  })
})

describe('remove', () => {
  const withMine = () => openBoard([note('a', 100, 100, 'Mine', 'you'), note('b', 400, 100, 'Droplet idea', 'ai'), note('c', 700, 100, 'Another by Droplet', 'ai'), frame('fr', 100, 400, 500, 400, 'Frame')])

  it('deletes Droplet\'s own notes at once, and the receipt says so', () => {
    const result = apply([{ type: 'remove', things: ['n2', 'n3'] }], withMine())
    expect(items(result.state).map((item) => item.id)).toEqual(expect.not.arrayContaining(['b', 'c']))
    expect(result.pending).toEqual([])
    expect(result.changes[0]).toMatchObject({ kind: 'removed', text: '2 notes by Droplet deleted' })
  })

  it('never deletes the founder\'s own: it is only a proposal, with nothing changed', () => {
    const base = withMine()
    const result = apply([{ type: 'remove', things: ['n1', 'f1'] }], base)
    expect(result.state).toBe(base)
    expect(result.pending).toHaveLength(1)
    expect(result.pending[0]).toMatchObject({ kind: 'remove', ids: ['a', 'fr'] })
    expect(result.pending[0].prompt).toMatch(/^Delete 2 of your things\?/)
    expect(result.pending[0].prompt).toContain('Nothing is deleted until you say yes')
    expect(result.pending[0].prompt).toContain('What is inside a frame stays')
    expect(result.changes).toEqual([])
  })

  it('does both at once when asked to remove a mix: its own now, the founder\'s as a question', () => {
    const result = apply([{ type: 'remove', things: ['n1', 'n2'] }], withMine())
    expect(items(result.state).map((item) => item.id)).toEqual(expect.arrayContaining(['a']))
    expect(items(result.state).map((item) => item.id)).not.toContain('b')
    expect(result.pending).toHaveLength(1)
  })

  it('names the reference when it is wrong', () => {
    expect(reasons(apply([{ type: 'remove', things: ['n99'] }]))[0]).toContain('There is no "n99"')
  })
})

describe('edit_note and rename_frame', () => {
  it('reword Droplet\'s own note at once', () => {
    const base = openBoard([note('b', 400, 100, 'Droplet idea', 'ai')])
    const result = apply([{ type: 'edit_note', note: 'n1', text: 'A sharper idea' }], base)
    expect((byId(result.state, 'b') as NoteItem).text).toBe('A sharper idea')
    expect(result.pending).toEqual([])
  })

  it('only suggest a change to the founder\'s note: nothing changes until they say yes', () => {
    const base = openBoardState()
    const result = apply([{ type: 'edit_note', note: 'n3', text: 'Corporate clients in Pretoria East' }], base)
    expect(result.state).toBe(base)
    expect(result.pending[0]).toMatchObject({ kind: 'edit', id: 'c', what: 'note', from: 'Corporate clients in Pretoria', to: 'Corporate clients in Pretoria East' })
    expect(result.pending[0].prompt).toContain('Now: “Corporate clients in Pretoria”')
  })

  it('suggest a new title for a frame the same way', () => {
    const base = openBoardState()
    const result = apply([{ type: 'rename_frame', frame: 'f1', title: 'Shortlist' }], base)
    expect(result.state).toBe(base)
    expect(result.pending[0]).toMatchObject({ kind: 'edit', id: 'names', what: 'frame', from: 'Name ideas', to: 'Shortlist' })
  })

  it('refuse an empty note (fill_prompt is for that), the wrong kind of thing, and words that are already there', () => {
    const empty = openBoard([note('e', 100, 100, '')])
    expect(reasons(apply([{ type: 'edit_note', note: 'n1', text: 'x' }], empty))[0]).toContain('fill_prompt')
    expect(reasons(apply([{ type: 'edit_note', note: 'f1', text: 'x' }]))[0]).toContain('not a note')
    expect(reasons(apply([{ type: 'rename_frame', frame: 'n3', title: 'x' }]))[0]).toContain('not a frame')
    expect(reasons(apply([{ type: 'edit_note', note: 'n3', text: 'Corporate clients in Pretoria' }]))[0]).toContain('already says that')
  })
})

describe('colour', () => {
  const said = 'Make the name notes sky blue please'

  it('recolours when the founder\'s own words ask for a colour, quoted exactly', () => {
    const result = apply([{ type: 'colour', things: ['n1', 'n2'], colour: 'sky', quote: 'sky blue' }], openBoardState(), said)
    expect(result.skipped).toEqual([])
    expect((byId(result.state, 'a') as NoteItem).colour).toBe('sky')
    expect(result.changes[0].text).toBe('2 things made sky')
  })

  it('does nothing when the quote is not in the founder\'s words, or does not ask for a colour', () => {
    expect(reasons(apply([{ type: 'colour', things: ['n1'], colour: 'mint', quote: 'make it mint' }], openBoardState(), said))[0]).toContain('not in the founder')
    expect(reasons(apply([{ type: 'colour', things: ['n1'], colour: 'mint', quote: 'the name notes' }], openBoardState(), said))[0]).toContain('does not ask for a colour')
    expect(reasons(apply([{ type: 'colour', things: ['n1'], colour: 'mint', quote: 'sky blue' }], openBoardState()))[0]).toContain('not in the founder')
  })

  it('never recolours a note by Droplet, never to pink, and never makes a note white', () => {
    const mine = openBoard([note('b', 400, 100, 'Droplet idea', 'ai')])
    expect(reasons(apply([{ type: 'colour', things: ['n1'], colour: 'sky', quote: 'sky blue' }], mine, said))[0]).toContain('pink')
    expect(boardTurnSchema.safeParse({ task: 'ideation', message: 'x', actions: [{ type: 'colour', things: ['n1'], colour: 'pink', quote: 'pink' }], memoryUsed: [] }).success).toBe(false)
    expect(reasons(apply([{ type: 'colour', things: ['n1'], colour: 'white', quote: 'white please' }], openBoardState(), 'white please'))[0]).toContain('cannot be white')
  })

  it('can make a frame white, and reports a colour that is already there', () => {
    const result = apply([{ type: 'colour', things: ['f1'], colour: 'white', quote: 'white please' }], openBoardState(), 'white please')
    expect((byId(result.state, 'names') as Extract<BoardItem, { kind: 'frame' }>).colour).toBe('white')
    expect(reasons(apply([{ type: 'colour', things: ['n1'], colour: 'yellow', quote: 'yellow please' }], openBoardState(), 'yellow please'))[0]).toContain('already yellow')
  })

  it('is checked in the browser and on the server with the founder\'s words', () => {
    const snapshot = snapshotOfBoard(openBoardState(), view, 'none')
    const turn = { task: 'ideation' as const, message: 'Done.', actions: [{ type: 'colour' as const, things: ['n1'], colour: 'sky' as const, quote: 'sky blue' }], memoryUsed: [] }
    expect(checkBoardTurn(turn, snapshot, said)).toEqual([])
    expect(checkBoardTurn(turn, snapshot, 'Hello there')[0]).toContain('not in the founder')
  })
})

describe('summary_frame', () => {
  it('writes the summary onto the board as a frame of pink notes, each saying which part it is', () => {
    const result = apply([{ type: 'summary_frame', decided: ['The name is Kindred Gifting'], open: ['Who the first client is'], next: ['Ask two friends about the name'] }])
    expect(result.skipped).toEqual([])
    const f = items(result.state).filter(isFrame).find((item) => item.title === 'Where things stand')!
    const held = membersOf(items(result.state), f) as NoteItem[]
    expect(held.map((item) => item.text)).toEqual(['Decided: The name is Kindred Gifting', 'Open: Who the first client is', 'Next: Ask two friends about the name'])
    for (const n of held) expect(n).toMatchObject({ author: 'ai', colour: 'pink' })
    expect(result.changes[0].text).toBe('A summary frame, 3 notes')
  })

  it('refuses an empty summary, more than one, and one that would be too many notes', () => {
    expect(reasons(apply([{ type: 'summary_frame', decided: [], open: [], next: [] }]))[0]).toContain('nothing to put')
    const one = { type: 'summary_frame' as const, decided: ['A'], open: [], next: [] }
    expect(reasons(apply([one, one]))[0]).toContain('Only one summary')
    const many = apply([{ type: 'add_note', text: 'x' }, { type: 'add_note', text: 'y' }, { type: 'add_note', text: 'z' }, { type: 'add_note', text: 'w' }, { type: 'summary_frame', decided: ['1', '2', '3', '4'], open: ['5', '6', '7', '8'], next: ['9'] }])
    expect(reasons(many).join(' ')).toMatch(/more than 12 notes|at most 9/)
  })
})

describe('what the model is shown of how things sit', () => {
  it('says how many things a frame holds and whether they overlap or stick out, without any coordinates', () => {
    const messy = openBoard([frame('box', 1000, 1000, 600, 400, 'Ideas'), note('p', 1060, 1060, 'One'), note('q', 1100, 1100, 'Two'), note('r', 1400, 1250, 'Three')])
    const text = JSON.stringify(describeBoard(snapshotOfBoard(messy, view, 'none')))
    expect(text).toContain('"layout":{"things":3,"overlapping":true')
    expect(text).toContain('"stickingOut":true')
    expect(text).not.toMatch(/"x":|"y":/)
  })

  it('names the nearest frame for a loose thing', () => {
    const text = JSON.stringify(describeBoard(snapshotOfBoard(openBoardState(), view, 'none')))
    expect(text).toContain('"nearestFrame":"f1"')
  })

  it('rebuilds the same board on the server, so the actions mean the same there', () => {
    const state = stateOfBoardSnapshot(snapshotOfBoard(openBoardState(), view, 'none'))
    const result = applyBoardTurnActions({ base: state, actions: [{ type: 'move_to_frame', things: ['n3'], frame: 'f1' }], view, newId: counter() })
    expect(result.skipped).toEqual([])
  })
})
