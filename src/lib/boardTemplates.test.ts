import { describe, expect, it } from 'vitest'
import { BOARD_H, BOARD_W, GRID, intersects } from './boardGeometry.ts'
import { frameOf } from './boardFrames.ts'
import { docOf, openBoard, reduceBoard, type BoardState } from './boardState.ts'
import { TEMPLATES, TEMPLATE_IDS, TITLE_SPACE, groupFor, instantiateTemplate, itemsInGroup, originOfGroup, placeTemplate, templateById, templateOfGroup, type TemplateDef } from './boardTemplates.ts'
import { isConnector, isFrame, isNode, isRectItem, rectOf, type BoardItem, type NoteItem } from './boardTypes.ts'

const counter = () => {
  let n = 0
  return () => `id-${++n}`
}
const put = (template: TemplateDef, x = 200, y = 200) => instantiateTemplate(template, { x, y }, counter(), groupFor(template.id, 'one'))

describe('the set of templates', () => {
  it('has the seven that were planned, once each, each with a name and a line on what it is for', () => {
    expect(TEMPLATES.map((template) => template.id)).toEqual([...TEMPLATE_IDS])
    expect(new Set(TEMPLATES.map((template) => template.name)).size).toBe(TEMPLATES.length)
    for (const template of TEMPLATES) {
      expect(template.name.length).toBeGreaterThan(2)
      expect(template.summary.length).toBeGreaterThan(10)
    }
  })

  it('can be found by id', () => {
    expect(templateById('name_ideas')?.name).toBe('Name ideas')
    expect(templateById('nothing')).toBeUndefined()
  })
})

describe.each(TEMPLATES)('the $name template', (template) => {
  const nodes = template.items.filter(isNode)
  const frames = template.items.filter(isFrame)

  it('has things with ids of their own', () => {
    const ids = template.items.map((item) => item.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('starts at its own corner, with room for the titles above its frames, and fits the board with room to spare', () => {
    const rects = template.items.filter(isRectItem).map(rectOf)
    expect(Math.min(...rects.map((rect) => rect.x))).toBe(0)
    expect(Math.min(...rects.map((rect) => rect.y))).toBe(TITLE_SPACE)
    expect(template.size.w).toBe(Math.max(...rects.map((rect) => rect.x + rect.w)))
    expect(template.size.h).toBe(Math.max(...rects.map((rect) => rect.y + rect.h)))
    expect(template.size.w).toBeLessThanOrEqual(BOARD_W / 1.5)
    expect(template.size.h).toBeLessThanOrEqual(BOARD_H / 2)
  })

  it('is on the grid, so what is added to it lines up', () => {
    for (const item of template.items.filter(isRectItem)) for (const value of [item.x, item.y, item.w, item.h]) expect(value % GRID).toBe(0)
  })

  it('is opened by the board without losing anything: every thing and every arrow is valid', () => {
    const opened = docOf(openBoard(put(template)))
    expect(opened.items).toHaveLength(template.items.length)
  })

  it('has nothing on top of anything else of its own kind: things are clear of each other and frames of frames', () => {
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) expect(intersects(rectOf(nodes[i]), rectOf(nodes[j]))).toBe(false)
    for (let i = 0; i < frames.length; i++) for (let j = i + 1; j < frames.length; j++) expect(intersects(rectOf(frames[i]), rectOf(frames[j]))).toBe(false)
  })

  it('puts every note in a frame, so a frame takes its notes when it moves', () => {
    for (const note of template.items.filter((item): item is NoteItem => item.kind === 'note')) expect(frameOf(template.items, note), note.id).not.toBeNull()
  })

  it('has prompts, not words: every note and shape is empty, with a hint that is short enough to read', () => {
    for (const item of template.items) {
      if (item.kind !== 'note' && item.kind !== 'shape') continue
      expect(item.text).toBe('')
      expect(item.hint?.length ?? 0).toBeGreaterThan(5)
      expect(item.hint!.length).toBeLessThanOrEqual(120)
    }
  })

  it('has arrows that are on things in the template, and joins no thing to itself', () => {
    const ids = new Set(template.items.filter(isRectItem).map((item) => item.id))
    for (const item of template.items.filter(isConnector)) {
      for (const end of [item.from, item.to]) expect('item' in end && ids.has(end.item)).toBe(true)
      expect(JSON.stringify(item.from)).not.toBe(JSON.stringify(item.to))
    }
  })

  it('has a title for every frame, and words nobody has to guess at', () => {
    for (const frame of frames) expect(frame.title.trim().length).toBeGreaterThan(2)
  })
})

describe('instantiateTemplate', () => {
  const template = templateById('customer_problem')!

  it('puts it where it is told, with every rectangle moved by the same amount', () => {
    const placed = put(template, 400, 300)
    template.items.filter(isRectItem).forEach((original, index) => {
      const item = placed[index]
      expect(isRectItem(item) && item.x - original.x).toBe(400)
      expect(isRectItem(item) && item.y - original.y).toBe(300)
    })
  })

  it('gives everything a new id and the group, and no id is repeated', () => {
    const placed = put(template)
    expect(new Set(placed.map((item) => item.id)).size).toBe(template.items.length)
    expect(placed.every((item) => item.group === groupFor(template.id, 'one'))).toBe(true)
    expect(placed.some((item) => template.items.some((original) => original.id === item.id))).toBe(false)
  })

  it('points every arrow at the new ids', () => {
    const placed = put(template)
    const ids = new Set(placed.map((item) => item.id))
    for (const arrow of placed.filter(isConnector)) for (const end of [arrow.from, arrow.to]) expect('item' in end && ids.has(end.item)).toBe(true)
  })

  it('keeps all of it inside the board when it is told to go near the edge', () => {
    const placed = put(template, BOARD_W - 100, BOARD_H - 100)
    for (const item of placed.filter(isRectItem)) {
      expect(item.x + item.w).toBeLessThanOrEqual(BOARD_W)
      expect(item.y + item.h).toBeLessThanOrEqual(BOARD_H)
    }
    // all of it moved together, so it is the same shape
    expect(docOf(openBoard(placed)).items).toHaveLength(template.items.length)
  })

  it('does not change the template', () => {
    const before = JSON.stringify(template.items)
    put(template)
    expect(JSON.stringify(template.items)).toBe(before)
  })

  it('carries the hints of the prompts', () => {
    const notes = put(template).filter((item): item is NoteItem => item.kind === 'note')
    expect(notes.every((note) => note.text === '' && !!note.hint)).toBe(true)
  })
})

describe('group', () => {
  it('names the template a group came from', () => {
    expect(templateOfGroup(groupFor('pros_cons', 'abc'))?.id).toBe('pros_cons')
    expect(templateOfGroup('made-up:abc')).toBeUndefined()
    expect(templateOfGroup('')).toBeUndefined()
  })

  it('finds what one use of a template put on the board, and no more', () => {
    const items = [...put(templateById('name_ideas')!), { id: 'mine', kind: 'note', x: 0, y: 0, w: 200, h: 180, text: '', colour: 'yellow', author: 'you' } as BoardItem]
    expect(itemsInGroup(items, groupFor('name_ideas', 'one'))).toHaveLength(templateById('name_ideas')!.items.length)
  })

  it('remembers where a template began, from what is left of it, and follows it when it is moved', () => {
    const template = templateById('brain_dump')!
    const items = put(template, 600, 500)
    expect(originOfGroup(items, groupFor(template.id, 'one'))).toEqual({ x: 600, y: 500 })
    const state = openBoard(items)
    const frame = docOf(state).items.find(isFrame)!
    const moved = reduceBoard(state, { type: 'move', ids: [frame.id], dx: 200, dy: 100 })
    expect(originOfGroup(docOf(moved).items, groupFor(template.id, 'one'))).toEqual({ x: 800, y: 600 })
  })

  it('has no origin for a group with nothing in it', () => {
    expect(originOfGroup([], 'x')).toBeNull()
  })
})

describe('placeTemplate', () => {
  const template = templateById('brain_dump')!
  const middle = { x: 2400, y: 1600 }

  it('goes centred on the point when the board is empty', () => {
    const { origin, clear } = placeTemplate(template, [], middle)
    expect(clear).toBe(true)
    expect(Math.abs(origin.x + template.size.w / 2 - middle.x)).toBeLessThanOrEqual(80)
    expect(Math.abs(origin.y + template.size.h / 2 - middle.y)).toBeLessThanOrEqual(80)
  })

  it('goes to the nearest clear place when something is where it would go, with room round it', () => {
    const blocker = { id: 'x', kind: 'note', x: 2300, y: 1500, w: 200, h: 180, text: '', colour: 'yellow', author: 'you' } as BoardItem
    const { origin, clear } = placeTemplate(template, [blocker], middle)
    expect(clear).toBe(true)
    const rect = { x: origin.x, y: origin.y, ...template.size }
    expect(intersects(rect, rectOf(blocker as NoteItem))).toBe(false)
    // and not by a long way
    expect(Math.hypot(origin.x + template.size.w / 2 - middle.x, origin.y + template.size.h / 2 - middle.y)).toBeLessThan(1400)
  })

  it('leaves a gap round what is there, so that a title does not run into a frame above it', () => {
    const above = { id: 'x', kind: 'frame', x: 1000, y: 1000, w: 1400, h: 400, title: 'Above', colour: 'white' } as BoardItem
    const { origin } = placeTemplate(template, [above], middle)
    const rect = { x: origin.x, y: origin.y, ...template.size }
    const pad = { x: 1000 - 60, y: 1000 - 60, w: 1400 + 120, h: 400 + 120 }
    expect(intersects(rect, pad)).toBe(false)
  })

  it('stays on the board near the edge', () => {
    const { origin } = placeTemplate(template, [], { x: 0, y: 0 })
    expect(origin.x).toBeGreaterThanOrEqual(0)
    expect(origin.y).toBeGreaterThanOrEqual(0)
    const far = placeTemplate(template, [], { x: BOARD_W, y: BOARD_H })
    expect(far.origin.x + template.size.w).toBeLessThanOrEqual(BOARD_W)
    expect(far.origin.y + template.size.h).toBeLessThanOrEqual(BOARD_H)
  })

  it('goes over what is there, near the point, when there is no clear place, and says so', () => {
    const wall = [{ id: 'w', kind: 'frame', x: 0, y: 0, w: BOARD_W, h: BOARD_H, title: 'All', colour: 'white' } as BoardItem]
    const { origin, clear } = placeTemplate(template, wall, middle)
    expect(clear).toBe(false)
    expect(Math.abs(origin.x + template.size.w / 2 - middle.x)).toBeLessThanOrEqual(GRID)
  })

  it('finds a place for the biggest template among others that were put in the corners', () => {
    const big = templateById('business_model')!
    let items: BoardItem[] = []
    for (const [id, near] of [['brain_dump', { x: 0, y: 0 }], ['customer_problem', { x: BOARD_W, y: BOARD_H }], ['pros_cons', { x: BOARD_W, y: 0 }]] as const) {
      const other = templateById(id)!
      const { origin } = placeTemplate(other, items, near)
      items = [...items, ...instantiateTemplate(other, origin, counter(), groupFor(other.id, id))]
    }
    const { origin, clear } = placeTemplate(big, items, middle)
    expect(clear).toBe(true)
    const rect = { x: origin.x, y: origin.y, ...big.size }
    expect(items.filter(isRectItem).some((item) => intersects(rect, rectOf(item)))).toBe(false)
  })

  it('puts several templates on the board without any on top of another', () => {
    let items: BoardItem[] = []
    const placedRects = []
    for (const template of TEMPLATES.filter((other) => ['brain_dump', 'customer_problem', 'offer_comparison', 'name_ideas'].includes(other.id))) {
      const { origin, clear } = placeTemplate(template, items, middle)
      expect(clear).toBe(true)
      placedRects.push({ x: origin.x, y: origin.y, ...template.size })
      items = [...items, ...instantiateTemplate(template, origin, counter(), groupFor(template.id, `i${placedRects.length}`))]
    }
    for (let i = 0; i < placedRects.length; i++) for (let j = i + 1; j < placedRects.length; j++) expect(intersects(placedRects[i], placedRects[j])).toBe(false)
  })

  it('says it is not clear once the board has no room left, rather than refusing', () => {
    let items: BoardItem[] = []
    let last = true
    for (let i = 0; i < 12 && last; i++) {
      const template = templateById('business_model')!
      const placed = placeTemplate(template, items, middle)
      last = placed.clear
      items = [...items, ...instantiateTemplate(template, placed.origin, counter(), groupFor(template.id, `i${i}`))]
    }
    // however many fit, it ends by saying there is no clear place, and still gives a place
    expect(last).toBe(false)
  })
})

// ---- Fully editable: a template is nothing but ordinary things ----

describe('editing a template', () => {
  const template = templateById('customer_problem')!
  const start = (): BoardState => {
    const state = openBoard()
    return reduceBoard(state, { type: 'add_items', items: put(template, 400, 300) })
  }
  const items = (state: BoardState) => docOf(state).items

  it('moves a frame together with the prompts in it, and the arrows between the frames follow', () => {
    const state = start()
    const first = items(state).find((item) => isFrame(item) && item.title === 'Who is it for?')!
    const inside = items(state).filter((item): item is NoteItem => item.kind === 'note' && frameOf(items(state), item)?.id === first.id)
    expect(inside).toHaveLength(2)
    const moved = reduceBoard(state, { type: 'move', ids: [first.id], dx: 200, dy: 100 })
    for (const note of inside) {
      const now = items(moved).find((item) => item.id === note.id) as NoteItem
      expect([now.x - note.x, now.y - note.y]).toEqual([200, 100])
    }
    expect(items(moved).filter(isConnector)).toHaveLength(2)
  })

  it('writes in a prompt, which is then a note like any other', () => {
    const state = start()
    const prompt = items(state).find((item): item is NoteItem => item.kind === 'note')!
    const written = reduceBoard(state, { type: 'set_text', id: prompt.id, text: 'Megan, 25, Pretoria' })
    expect(items(written).find((item) => item.id === prompt.id)).toMatchObject({ text: 'Megan, 25, Pretoria', hint: prompt.hint })
  })

  it('resizes, recolours, retitles, reorders and deletes any part of it', () => {
    let state = start()
    const frame = items(state).find(isFrame)!
    const prompt = items(state).find((item): item is NoteItem => item.kind === 'note')!
    state = reduceBoard(state, { type: 'resize_item', id: frame.id, w: 800, h: 700 })
    state = reduceBoard(state, { type: 'set_title', id: frame.id, title: 'My customer' })
    state = reduceBoard(state, { type: 'set_colour', ids: [frame.id, prompt.id], colour: 'mint' })
    state = reduceBoard(state, { type: 'reorder', ids: [prompt.id], to: 'front' })
    state = reduceBoard(state, { type: 'delete', ids: [prompt.id] })
    expect(items(state).find((item) => item.id === frame.id)).toMatchObject({ w: 800, h: 700, title: 'My customer', colour: 'mint' })
    expect(items(state).some((item) => item.id === prompt.id)).toBe(false)
  })

  it('deletes a whole frame without taking its prompts, unless asked', () => {
    const state = start()
    const frame = items(state).find(isFrame)!
    const count = items(state).length
    const kept = reduceBoard(state, { type: 'delete', ids: [frame.id] })
    // the frame goes, and with it the arrows that were on it
    expect(items(kept).length).toBeLessThan(count)
    expect(items(kept).filter((item) => item.kind === 'note')).toHaveLength(6)
  })

  it('is put on the board as one step, and one undo takes all of it off', () => {
    const state = start()
    expect(state.history.past).toHaveLength(1)
    expect(items(reduceBoard(state, { type: 'undo' }))).toHaveLength(0)
  })

  it('can have things added to it, and drawn between its things, as on any board', () => {
    let state = start()
    const [a, b] = items(state).filter((item) => item.kind === 'note')
    state = reduceBoard(state, { type: 'add_connector', id: 'extra', from: { item: a.id }, to: { item: b.id } })
    expect(items(state).some((item) => item.id === 'extra')).toBe(true)
  })
})
