import { DEFAULT_LAYOUT, MAX_BLOCKS, MIN_BLOCKS, canRedoState, canUndoState, docOf, isUnsaved, isVisible, layoutIsDefault, openWorkspace, reduce, selectedBlock, type WorkspaceAction, type WorkspaceState } from './workspaceState.ts'
import type { PaletteBlock } from './palette.ts'
import type { PaletteSave } from './projectStore.ts'

const starter = (): PaletteBlock[] => [
  { id: 1, hex: '#1F8FE0' },
  { id: 2, hex: '#0B4F8A' },
  { id: 3, hex: '#CFE9FB' },
  { id: 4, hex: '#0E1A2B' },
]
const fresh = () => openWorkspace(starter())
const run = (state: WorkspaceState, ...actions: WorkspaceAction[]) => actions.reduce(reduce, state)
const hexes = (state: WorkspaceState) => docOf(state).blocks.map((b) => b.hex)

describe('openWorkspace', () => {
  it('starts with the first colour selected, the default layout and nothing hidden', () => {
    const state = fresh()
    expect(state.selectedId).toBe(1)
    expect(docOf(state).layout).toEqual(DEFAULT_LAYOUT)
    expect(docOf(state).hidden).toEqual([])
    expect(canUndoState(state)).toBe(false)
  })

  it('uses the project\'s saved layout, sizes and hidden components, and snaps saved panel widths', () => {
    const saved: PaletteSave = {
      blocks: starter(),
      layout: [
        { id: 'canvas', col: 0, row: 10, w: 15 },
        { id: 'picker', col: 0, row: 0, w: 3 },
      ],
      sizes: { picker: 1 },
      hidden: ['preview'],
      savedAt: new Date().toISOString(),
    }
    const doc = docOf(openWorkspace(starter(), saved))
    expect(doc.layout.find((p) => p.id === 'canvas')?.w).toBe(16)
    expect(doc.sizes).toEqual({ picker: 1 })
    expect(doc.hidden).toEqual(['preview'])
  })
})

describe('colours', () => {
  it('selects a colour, ignoring one that does not exist', () => {
    expect(run(fresh(), { type: 'select', id: 3 }).selectedId).toBe(3)
    const state = fresh()
    expect(reduce(state, { type: 'select', id: 99 })).toBe(state)
  })

  it('changes a colour, drops its composer note, and merges quick edits into one undo step', () => {
    let state = openWorkspace([{ id: 1, hex: '#1F8FE0', name: 'Sky', note: 'Friendly.' }, ...starter().slice(1)])
    state = run(state, { type: 'set_hex', id: 1, hex: '#2090E1' }, { type: 'set_hex', id: 1, hex: '#2191E2' }, { type: 'set_hex', id: 1, hex: '#2292E3' })
    expect(docOf(state).blocks[0]).toEqual({ id: 1, hex: '#2292E3' })
    expect(state.history.past).toHaveLength(1)
    expect(hexes(run(state, { type: 'undo' }))[0]).toBe('#1F8FE0')
  })

  it('adds a colour, selects it, and stops at the maximum', () => {
    let state = run(fresh(), { type: 'add_block', hex: '#B5543A', name: 'Clay', role: 'accent' })
    expect(docOf(state).blocks[4]).toMatchObject({ id: 5, hex: '#B5543A', name: 'Clay', role: 'accent' })
    expect(state.selectedId).toBe(5)
    for (let i = 0; i < 10; i += 1) state = run(state, { type: 'add_block' })
    expect(docOf(state).blocks).toHaveLength(MAX_BLOCKS)
  })

  it('suggests a new colour from the selected one when none is given', () => {
    const state = run(fresh(), { type: 'add_block' })
    expect(docOf(state).blocks[4].hex).toMatch(/^#[0-9A-F]{6}$/)
    expect(docOf(state).blocks[4].hex).not.toBe('#1F8FE0')
  })

  it('removes a colour, moves the selection to the one that takes its place, and stops at the minimum', () => {
    let state = run(fresh(), { type: 'select', id: 2 }, { type: 'remove_block', id: 2 })
    expect(hexes(state)).toEqual(['#1F8FE0', '#CFE9FB', '#0E1A2B'])
    expect(state.selectedId).toBe(3)
    state = run(state, { type: 'remove_block', id: 3 }, { type: 'remove_block', id: 1 }, { type: 'remove_block', id: 4 })
    expect(docOf(state).blocks).toHaveLength(MIN_BLOCKS)
  })

  it('gives a role to one colour at a time, and clears it', () => {
    let state = run(fresh(), { type: 'set_role', id: 1, role: 'primary' }, { type: 'set_role', id: 2, role: 'primary' })
    expect(docOf(state).blocks.map((b) => b.role)).toEqual([undefined, 'primary', undefined, undefined])
    state = run(state, { type: 'set_role', id: 2, role: null })
    expect(docOf(state).blocks[1].role).toBeUndefined()
  })

  it('keeps and releases a colour', () => {
    let state = run(fresh(), { type: 'toggle_keep', id: 4 })
    expect(docOf(state).blocks[3].locked).toBe(true)
    state = run(state, { type: 'toggle_keep', id: 4, keep: true })
    expect(state.history.past).toHaveLength(1)
    state = run(state, { type: 'toggle_keep', id: 4, keep: false })
    expect('locked' in docOf(state).blocks[3]).toBe(false)
  })

  it('replaces the whole palette, selects the first colour and records the reason', () => {
    const state = run(fresh(), { type: 'select', id: 3 }, {
      type: 'set_palette',
      blocks: [{ id: 9, hex: '#F7EFE6', name: 'Cream' }, { id: 8, hex: '#3B2A22' }, { id: 7, hex: '#B5543A' }],
      reason: 'The colours you asked for.',
      businessName: 'Kindred Gifting',
    })
    expect(docOf(state).blocks.map((b) => b.id)).toEqual([1, 2, 3])
    expect(state.selectedId).toBe(1)
    expect(docOf(state).reasons.canvas).toBe('The colours you asked for.')
    expect(docOf(state).businessName).toBe('Kindred Gifting')
  })
})

describe('generate', () => {
  it('fills the colours that are not the starting colour or kept, and the next press differs', () => {
    let state = run(fresh(), { type: 'toggle_keep', id: 4 }, { type: 'generate' })
    const first = hexes(state)
    expect(first[0]).toBe('#1F8FE0')
    expect(first[3]).toBe('#0E1A2B')
    expect(first[1]).not.toBe('#0B4F8A')
    expect(state.variation).toBe(1)
    state = run(state, { type: 'generate' })
    expect(hexes(state)).not.toEqual(first)
  })

  it('uses the harmony that is chosen, and can start from another colour', () => {
    const state = run(fresh(), { type: 'set_harmony', harmony: 'triad' }, { type: 'generate', fromId: 3 })
    expect(state.harmony).toBe('triad')
    expect(state.selectedId).toBe(3)
    expect(hexes(state)[2]).toBe('#CFE9FB')
  })

  it('does nothing when every other colour is kept', () => {
    const locked = openWorkspace(starter().map((b) => (b.id === 1 ? b : { ...b, locked: true })))
    expect(reduce(locked, { type: 'generate' })).toBe(locked)
  })
})

describe('layout, sizes and components', () => {
  it('takes a new layout from a drag', () => {
    const layout = DEFAULT_LAYOUT.map((p) => (p.id === 'canvas' ? { ...p, row: 40 } : p))
    expect(docOf(run(fresh(), { type: 'layout', layout })).layout).toEqual(layout)
  })

  it('resizes a panel to a snap width and a toolbar to a version, and clears a toolbar back to the default', () => {
    let state = run(fresh(), { type: 'resize', id: 'canvas', value: 13 }, { type: 'resize', id: 'picker', value: 1 })
    expect(docOf(state).layout.find((p) => p.id === 'canvas')?.w).toBe(12)
    expect(docOf(state).sizes).toEqual({ picker: 1 })
    state = run(state, { type: 'resize', id: 'picker', value: 0 })
    expect(docOf(state).sizes).toEqual({})
    expect(reduce(state, { type: 'resize', id: 'ghost', value: 1 }).history).toBe(state.history)
  })

  it('hides and shows a component, but never the canvas', () => {
    let state = run(fresh(), { type: 'hide', component: 'preview' }, { type: 'hide', component: 'canvas' })
    expect(isVisible(docOf(state), 'preview')).toBe(false)
    expect(isVisible(docOf(state), 'canvas')).toBe(true)
    state = run(state, { type: 'show', component: 'preview', reason: 'To see it on a real document.' })
    expect(isVisible(docOf(state), 'preview')).toBe(true)
    expect(docOf(state).reasons.preview).toBe('To see it on a real document.')
  })

  it('resets positions and sizes, but not what is hidden', () => {
    const layout = DEFAULT_LAYOUT.map((p) => (p.id === 'canvas' ? { ...p, row: 40 } : p))
    let state = run(fresh(), { type: 'layout', layout }, { type: 'resize', id: 'picker', value: 1 }, { type: 'hide', component: 'role' })
    expect(layoutIsDefault(docOf(state))).toBe(false)
    state = run(state, { type: 'reset_layout' })
    expect(layoutIsDefault(docOf(state))).toBe(true)
    expect(docOf(state).hidden).toEqual(['role'])
  })
})

describe('history', () => {
  it('undoes and redoes, and a batch is a single step', () => {
    const batch: WorkspaceAction = { type: 'batch', actions: [{ type: 'set_hex', id: 1, hex: '#B5543A' }, { type: 'set_role', id: 1, role: 'primary' }, { type: 'hide', component: 'preview' }] }
    let state = run(fresh(), batch)
    expect(state.history.past).toHaveLength(1)
    expect(docOf(state).blocks[0]).toMatchObject({ hex: '#B5543A', role: 'primary' })
    state = run(state, { type: 'undo' })
    expect(docOf(state).blocks[0]).toEqual({ id: 1, hex: '#1F8FE0' })
    expect(docOf(state).hidden).toEqual([])
    expect(canRedoState(state)).toBe(true)
    state = run(state, { type: 'redo' })
    expect(docOf(state).blocks[0].role).toBe('primary')
  })

  it('does not record a change that changes nothing', () => {
    const state = fresh()
    expect(reduce(state, { type: 'set_role', id: 1, role: null })).toBe(state)
    expect(reduce(state, { type: 'show', component: 'preview' })).toBe(state)
    expect(reduce(state, { type: 'batch', actions: [{ type: 'select', id: 1 }] })).toBe(state)
  })

  it('falls back to the first colour when undo removes the selected one', () => {
    const state = run(fresh(), { type: 'add_block', hex: '#B5543A' }, { type: 'undo' })
    expect(state.selectedId).toBe(1)
    expect(selectedBlock(state).id).toBe(1)
  })
})

describe('isUnsaved', () => {
  const saved = (over: Partial<PaletteSave> = {}): PaletteSave => ({ blocks: starter(), layout: DEFAULT_LAYOUT, savedAt: 'x', ...over })

  it('is unsaved with nothing saved, and saved when everything matches', () => {
    expect(isUnsaved(docOf(fresh()), null)).toBe(true)
    expect(isUnsaved(docOf(fresh()), saved())).toBe(false)
  })

  it('notices a change to colours, layout, sizes or hidden components', () => {
    expect(isUnsaved(docOf(run(fresh(), { type: 'set_hex', id: 1, hex: '#000000' })), saved())).toBe(true)
    expect(isUnsaved(docOf(run(fresh(), { type: 'resize', id: 'canvas', value: 12 })), saved())).toBe(true)
    expect(isUnsaved(docOf(run(fresh(), { type: 'resize', id: 'picker', value: 1 })), saved())).toBe(true)
    expect(isUnsaved(docOf(run(fresh(), { type: 'hide', component: 'role' })), saved())).toBe(true)
    expect(isUnsaved(docOf(run(fresh(), { type: 'hide', component: 'role' })), saved({ hidden: ['role'] }))).toBe(false)
  })
})
