import { DEFAULT_LAYOUT, DEFAULT_TOOLS, isExpanded, normaliseExpanded, normaliseTools, shownWindows, toolbarTools, MAX_BLOCKS, MIN_BLOCKS, canRedoState, canUndoState, docOf, isUnsaved, isVisible, layoutIsDefault, openWorkspace, reduce, selectedBlock, type WorkspaceAction, type WorkspaceState } from './workspaceState.ts'
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

  it('uses the project\'s saved layout, expanded tools and hidden components, and keeps a saved panel width', () => {
    const saved: PaletteSave = {
      blocks: starter(),
      layout: [
        { id: 'canvas', col: 0, row: 10, w: 15 },
        { id: 'picker', col: 0, row: 0, w: 3 },
      ],
      expanded: ['picker'],
      hidden: ['preview'],
      savedAt: new Date().toISOString(),
    }
    const doc = docOf(openWorkspace(starter(), saved))
    expect(doc.layout.find((p) => p.id === 'canvas')?.w).toBe(15)
    expect(doc.expanded).toEqual(['picker'])
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

describe('layout and components', () => {
  it('takes a new layout from a drag', () => {
    const layout = DEFAULT_LAYOUT.map((p) => (p.id === 'canvas' ? { ...p, row: 40 } : p))
    expect(docOf(run(fresh(), { type: 'layout', layout })).layout).toEqual(layout)
  })

  it('resizes a window to any column count, within limits, and ignores a tool in the toolbar', () => {
    const state = run(fresh(), { type: 'resize', id: 'canvas', value: 13 })
    expect(docOf(state).layout.find((p) => p.id === 'canvas')?.w).toBe(13)
    expect(docOf(run(state, { type: 'resize', id: 'canvas', value: 2 })).layout.find((p) => p.id === 'canvas')?.w).toBe(6)
    expect(docOf(run(state, { type: 'resize', id: 'canvas', value: 40 })).layout.find((p) => p.id === 'canvas')?.w).toBe(24)
    expect(reduce(state, { type: 'resize', id: 'picker', value: 12 }).history).toBe(state.history)
    expect(reduce(state, { type: 'resize', id: 'ghost', value: 1 }).history).toBe(state.history)
    // once a tool is a window it has a width
    const out = run(state, { type: 'expand_tool', id: 'picker' }, { type: 'resize', id: 'picker', value: 12 })
    expect(docOf(out).layout.find((p) => p.id === 'picker')?.w).toBe(12)
  })

  it('hides and shows a component, but never the canvas', () => {
    let state = run(fresh(), { type: 'hide', component: 'preview' }, { type: 'hide', component: 'canvas' })
    expect(isVisible(docOf(state), 'preview')).toBe(false)
    expect(isVisible(docOf(state), 'canvas')).toBe(true)
    state = run(state, { type: 'show', component: 'preview', reason: 'To see it on a real document.' })
    expect(isVisible(docOf(state), 'preview')).toBe(true)
    expect(docOf(state).reasons.preview).toBe('To see it on a real document.')
  })

  it('resets positions and brings tools back to the toolbar, but not what is hidden', () => {
    const layout = DEFAULT_LAYOUT.map((p) => (p.id === 'canvas' ? { ...p, row: 40 } : p))
    let state = run(fresh(), { type: 'layout', layout }, { type: 'expand_tool', id: 'picker' }, { type: 'hide', component: 'role' })
    expect(layoutIsDefault(docOf(state))).toBe(false)
    state = run(state, { type: 'reset_layout' })
    expect(layoutIsDefault(docOf(state))).toBe(true)
    expect(docOf(state).hidden).toEqual(['role'])
  })
})

describe('the toolbar', () => {
  it('starts in the default order', () => {
    expect(docOf(fresh()).tools).toEqual(DEFAULT_TOOLS)
    expect(toolbarTools(docOf(fresh()))).toEqual(['picker', 'role', 'generate'])
  })

  it('moves a tool before another, or to the end, and ignores moves that change nothing', () => {
    let state = run(fresh(), { type: 'move_tool', id: 'generate', before: 'picker' })
    expect(docOf(state).tools).toEqual(['generate', 'picker', 'role'])
    state = run(state, { type: 'move_tool', id: 'generate', before: null })
    expect(docOf(state).tools).toEqual(['picker', 'role', 'generate'])
    const same = fresh()
    expect(reduce(same, { type: 'move_tool', id: 'picker', before: 'role' })).toBe(same)
    expect(reduce(same, { type: 'move_tool', id: 'picker', before: 'picker' })).toBe(same)
    expect(reduce(same, { type: 'move_tool', id: 'canvas', before: 'picker' })).toBe(same)
    expect(reduce(same, { type: 'move_tool', id: 'picker', before: 'ghost' })).toBe(same)
  })

  it('keeps a hidden tool in its place in the order', () => {
    const state = run(fresh(), { type: 'move_tool', id: 'generate', before: 'role' }, { type: 'hide', component: 'role' })
    expect(toolbarTools(docOf(state))).toEqual(['picker', 'generate'])
    expect(docOf(run(state, { type: 'show', component: 'role' })).tools).toEqual(['picker', 'generate', 'role'])
  })

  it('is one undo step, and reset puts the order back', () => {
    const moved = run(fresh(), { type: 'move_tool', id: 'role', before: 'picker' })
    expect(docOf(run(moved, { type: 'undo' })).tools).toEqual(DEFAULT_TOOLS)
    expect(layoutIsDefault(docOf(moved))).toBe(false)
    expect(layoutIsDefault(docOf(run(moved, { type: 'reset_layout' })))).toBe(true)
  })

  it('opens in the saved order, and notices when it differs from the save', () => {
    const saved: PaletteSave = { blocks: starter(), layout: DEFAULT_LAYOUT, tools: ['generate', 'role', 'picker'], savedAt: 'x' }
    expect(docOf(openWorkspace(starter(), saved)).tools).toEqual(['generate', 'role', 'picker'])
    expect(isUnsaved(docOf(openWorkspace(starter(), saved)), saved)).toBe(false)
    expect(isUnsaved(docOf(fresh()), saved)).toBe(true)
  })

  it('completes an order that is missing tools or holds ones that do not exist', () => {
    expect(normaliseTools(undefined)).toEqual(DEFAULT_TOOLS)
    expect(normaliseTools(['generate', 'ghost', 'generate'])).toEqual(['generate', 'picker', 'role'])
  })
})

describe('a tool dragged out of the toolbar', () => {
  it('becomes a window, and leaves the toolbar', () => {
    const state = run(fresh(), { type: 'expand_tool', id: 'picker' })
    expect(isExpanded(docOf(state), 'picker')).toBe(true)
    expect(toolbarTools(docOf(state))).toEqual(['role', 'generate'])
    expect(shownWindows(docOf(state))).toEqual(['picker', 'canvas', 'preview'].sort((a, b) => ['picker', 'role', 'generate', 'canvas', 'preview'].indexOf(a) - ['picker', 'role', 'generate', 'canvas', 'preview'].indexOf(b)))
  })

  it('lands in the layout it was sent with, and ignores a panel, a tool that is already a window, or a stranger', () => {
    const layout = DEFAULT_LAYOUT.map((p) => (p.id === 'picker' ? { ...p, col: 5, row: 12 } : p))
    const state = run(fresh(), { type: 'expand_tool', id: 'picker', layout })
    expect(docOf(state).layout.find((p) => p.id === 'picker')).toMatchObject({ col: 5, row: 12 })
    expect(reduce(state, { type: 'expand_tool', id: 'picker' })).toBe(state)
    const same = fresh()
    expect(reduce(same, { type: 'expand_tool', id: 'canvas' })).toBe(same)
    expect(reduce(same, { type: 'expand_tool', id: 'ghost' })).toBe(same)
  })

  it('goes back to the toolbar where it is dropped, or where it was if no place is given', () => {
    const out = run(fresh(), { type: 'expand_tool', id: 'role' })
    expect(toolbarTools(docOf(run(out, { type: 'collapse_tool', id: 'role' })))).toEqual(['picker', 'role', 'generate'])
    expect(toolbarTools(docOf(run(out, { type: 'collapse_tool', id: 'role', before: 'picker' })))).toEqual(['role', 'picker', 'generate'])
    expect(toolbarTools(docOf(run(out, { type: 'collapse_tool', id: 'role', before: null })))).toEqual(['picker', 'generate', 'role'])
    const same = fresh()
    expect(reduce(same, { type: 'collapse_tool', id: 'role' })).toBe(same)
  })

  it('is one undo step each way', () => {
    const out = run(fresh(), { type: 'expand_tool', id: 'picker' })
    expect(docOf(run(out, { type: 'undo' })).expanded).toEqual([])
  })

  it('keeps a hidden tool that is a window hidden, and brings it back as a window when shown', () => {
    const state = run(fresh(), { type: 'expand_tool', id: 'picker' }, { type: 'hide', component: 'picker' })
    expect(shownWindows(docOf(state))).not.toContain('picker')
    expect(shownWindows(docOf(run(state, { type: 'show', component: 'picker' })))).toContain('picker')
  })

  it('completes an expanded list that holds strangers or repeats', () => {
    expect(normaliseExpanded(['role', 'ghost', 'role', 'canvas'])).toEqual(['role'])
    expect(normaliseExpanded(undefined)).toEqual([])
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

  it('notices a change to colours, layout, expanded tools or hidden components', () => {
    expect(isUnsaved(docOf(run(fresh(), { type: 'set_hex', id: 1, hex: '#000000' })), saved())).toBe(true)
    expect(isUnsaved(docOf(run(fresh(), { type: 'resize', id: 'canvas', value: 12 })), saved())).toBe(true)
    expect(isUnsaved(docOf(run(fresh(), { type: 'expand_tool', id: 'picker' })), saved())).toBe(true)
    expect(isUnsaved(docOf(run(fresh(), { type: 'hide', component: 'role' })), saved())).toBe(true)
    expect(isUnsaved(docOf(run(fresh(), { type: 'hide', component: 'role' })), saved({ hidden: ['role'] }))).toBe(false)
  })
})

describe('sameBlocks', () => {
  it('is true for the same colours, whatever order their fields were written in', async () => {
    const { sameBlocks } = await import('./workspaceState.ts')
    const a = [{ id: 1, hex: '#1F8FE0', name: 'Blue', note: 'n', role: 'primary' }]
    const b = [{ id: 1, hex: '#1F8FE0', role: 'primary', name: 'Blue', note: 'n' }]
    expect(sameBlocks(a, b)).toBe(true)
  })

  it('is false when a colour, its role, its name or whether it is kept differs, or a colour is added', async () => {
    const { sameBlocks } = await import('./workspaceState.ts')
    const a = [{ id: 1, hex: '#1F8FE0' }]
    expect(sameBlocks(a, [{ id: 1, hex: '#1F8FE1' }])).toBe(false)
    expect(sameBlocks(a, [{ id: 1, hex: '#1F8FE0', role: 'accent' }])).toBe(false)
    expect(sameBlocks(a, [{ id: 1, hex: '#1F8FE0', locked: true }])).toBe(false)
    expect(sameBlocks(a, [{ id: 1, hex: '#1F8FE0', name: 'x' }])).toBe(false)
    expect(sameBlocks(a, [...a, { id: 2, hex: '#000000' }])).toBe(false)
  })

  it('does not call a palette that was saved with roles, and read back, unsaved', async () => {
    const { starterBlocks } = await import('../compose/fallback.ts')
    const { loadPalette, savePalette } = await import('./projectStore.ts')
    const { docOf, isUnsaved, openWorkspace, reduce } = await import('./workspaceState.ts')
    window.localStorage.clear()
    let state = openWorkspace(starterBlocks(), null)
    state = reduce(state, { type: 'set_role', id: docOf(state).blocks[0].id, role: 'primary' })
    const doc = docOf(state)
    await savePalette('p', { blocks: doc.blocks, layout: doc.layout, tools: doc.tools, expanded: doc.expanded, hidden: doc.hidden })
    expect(isUnsaved(doc, await loadPalette('p'))).toBe(false)
  })
})
