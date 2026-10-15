import { MAX_BLOCKS, MIN_BLOCKS, canRedoState, canUndoState, docOf, isUnsaved, openWorkspace, reduce, selectedBlock, type WorkspaceAction, type WorkspaceState } from './workspaceState.ts'
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
  it('starts with the first colour selected and nothing to undo', () => {
    const state = fresh()
    expect(state.selectedId).toBe(1)
    expect(docOf(state).blocks).toEqual(starter())
    expect(canUndoState(state)).toBe(false)
  })

  it('starts on Custom, so a saved palette is not scrambled by changing one of its colours, and a new palette drops any rule', () => {
    expect(fresh().harmony).toBe('custom')
    const ruled = run(fresh(), { type: 'use_harmony', harmony: 'triad' })
    expect(ruled.harmony).toBe('triad')
    const replaced = run(ruled, { type: 'set_palette', blocks: [{ id: 1, hex: '#B5543A' }, { id: 2, hex: '#F7EFE6' }] })
    expect(replaced.harmony).toBe('custom')
    expect(run(fresh(), { type: 'set_base', id: 1, hex: '#E03A1F' }).history.present.blocks.slice(1)).toEqual(starter().slice(1))
  })

  it('has no arrangement: the frame is fixed, so the document holds the colours and the reasons only', () => {
    expect(Object.keys(docOf(fresh())).sort()).toEqual(['blocks', 'reasons'])
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
    let state = run(fresh(), { type: 'toggle_keep', id: 4 }, { type: 'set_harmony', harmony: 'analogous' }, { type: 'generate' })
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

describe('history', () => {
  it('undoes and redoes, and a batch is a single step', () => {
    const batch: WorkspaceAction = { type: 'batch', actions: [{ type: 'set_hex', id: 1, hex: '#B5543A' }, { type: 'set_role', id: 1, role: 'primary' }] }
    let state = run(fresh(), batch)
    expect(state.history.past).toHaveLength(1)
    expect(docOf(state).blocks[0]).toMatchObject({ hex: '#B5543A', role: 'primary' })
    state = run(state, { type: 'undo' })
    expect(docOf(state).blocks[0]).toEqual({ id: 1, hex: '#1F8FE0' })
    expect(canRedoState(state)).toBe(true)
    state = run(state, { type: 'redo' })
    expect(docOf(state).blocks[0].role).toBe('primary')
  })

  it('does not record a change that changes nothing', () => {
    const state = fresh()
    expect(reduce(state, { type: 'set_role', id: 1, role: null })).toBe(state)
    expect(reduce(state, { type: 'batch', actions: [{ type: 'select', id: 1 }] })).toBe(state)
  })

  it('falls back to the first colour when undo removes the selected one', () => {
    const state = run(fresh(), { type: 'add_block', hex: '#B5543A' }, { type: 'undo' })
    expect(state.selectedId).toBe(1)
    expect(selectedBlock(state).id).toBe(1)
  })
})

describe('isUnsaved', () => {
  const saved = (over: Partial<PaletteSave> = {}): PaletteSave => ({ blocks: starter(), savedAt: 'x', ...over })

  it('is unsaved with nothing saved, and saved when everything matches', () => {
    expect(isUnsaved(docOf(fresh()), null)).toBe(true)
    expect(isUnsaved(docOf(fresh()), saved())).toBe(false)
  })

  it('notices a change to the colours, and ignores the arrangement an older save holds', () => {
    expect(isUnsaved(docOf(run(fresh(), { type: 'set_hex', id: 1, hex: '#000000' })), saved())).toBe(true)
    expect(isUnsaved(docOf(fresh()), saved({ hidden: ['role'], expanded: ['picker'], tools: ['role'], layout: [{ id: 'canvas', col: 0, row: 4, w: 12 }] }))).toBe(false)
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
    let state = openWorkspace(starterBlocks())
    state = reduce(state, { type: 'set_role', id: docOf(state).blocks[0].id, role: 'primary' })
    const doc = docOf(state)
    await savePalette('p', { blocks: doc.blocks })
    expect(isUnsaved(doc, await loadPalette('p'))).toBe(false)
  })
})

describe('keeping a colour in mind', () => {
  it('stars a colour and takes the star off, as one step each', () => {
    const starred = reduce(fresh(), { type: 'toggle_star', id: 2 })
    expect(docOf(starred).blocks[1].starred).toBe(true)
    expect(docOf(starred).blocks[0].starred).toBeUndefined()
    expect(canUndoState(starred)).toBe(true)
    const cleared = reduce(starred, { type: 'toggle_star', id: 2 })
    expect('starred' in docOf(cleared).blocks[1]).toBe(false)
  })

  it('can be set outright, does nothing when it is already so or the colour is not there, and stays with the colour when its hex changes', () => {
    const base = fresh()
    expect(reduce(base, { type: 'toggle_star', id: 2, starred: false })).toBe(base)
    expect(reduce(base, { type: 'toggle_star', id: 99 })).toBe(base)
    const starred = reduce(base, { type: 'toggle_star', id: 2, starred: true })
    expect(reduce(starred, { type: 'toggle_star', id: 2, starred: true })).toBe(starred)
    expect(docOf(reduce(starred, { type: 'set_hex', id: 2, hex: '#123456' })).blocks[1]).toMatchObject({ hex: '#123456', starred: true })
  })
})

describe('harmonies and the base colour', () => {
  const ids = (state: WorkspaceState) => docOf(state).blocks.map((b) => b.id)

  it('chooses a rule and works the other colours out from the selected one in one undo step, leaving the kept ones', () => {
    const start = run(fresh(), { type: 'toggle_keep', id: 4 })
    const state = run(start, { type: 'use_harmony', harmony: 'split_complementary' })
    expect(state.harmony).toBe('split_complementary')
    expect(hexes(state)[0]).toBe('#1F8FE0')
    expect(hexes(state)[3]).toBe('#0E1A2B')
    expect(hexes(state)[1]).not.toBe('#0B4F8A')
    // keeping a colour and choosing a rule are two steps; choosing the rule is one
    expect(state.history.past).toHaveLength(start.history.past.length + 1)
    expect(hexes(run(state, { type: 'undo' }))).toEqual(hexes(start))
  })

  it('keeps the tones it has when a rule is chosen again, unless it is told which arrangement to use', () => {
    const once = run(fresh(), { type: 'use_harmony', harmony: 'triad' })
    expect(once.variation).toBe(0)
    const other = run(fresh(), { type: 'use_harmony', harmony: 'triad', variation: 3 })
    expect(other.variation).toBe(3)
    expect(hexes(other)).not.toEqual(hexes(once))
  })

  it('works from the colour named, and selects it', () => {
    const state = run(fresh(), { type: 'use_harmony', harmony: 'square', fromId: 3 })
    expect(state.selectedId).toBe(3)
    expect(hexes(state)[2]).toBe('#CFE9FB')
  })

  it('changes only the rule when Custom is chosen, and when every other colour is kept', () => {
    const custom = run(fresh(), { type: 'use_harmony', harmony: 'custom' })
    expect(custom.harmony).toBe('custom')
    expect(hexes(custom)).toEqual(hexes(fresh()))
    const locked = openWorkspace(starter().map((b) => (b.id === 1 ? b : { ...b, locked: true })))
    expect(hexes(run(locked, { type: 'use_harmony', harmony: 'triad' }))).toEqual(hexes(locked))
  })

  it('moves the others by the rule when the base moves, and the ones that are kept stay', () => {
    const ruled = run(fresh(), { type: 'toggle_keep', id: 4 }, { type: 'use_harmony', harmony: 'analogous' })
    const moved = run(ruled, { type: 'set_base', id: 1, hex: '#E03A1F' })
    expect(hexes(moved)[0]).toBe('#E03A1F')
    expect(hexes(moved)[3]).toBe('#0E1A2B')
    expect(hexes(moved)[1]).not.toBe(hexes(ruled)[1])
    expect(ids(moved)).toEqual([1, 2, 3, 4])
  })

  it('moves a colour alone in Custom', () => {
    const custom = run(fresh(), { type: 'use_harmony', harmony: 'custom' })
    const moved = run(custom, { type: 'set_base', id: 1, hex: '#E03A1F' })
    expect(hexes(moved)).toEqual(['#E03A1F', ...hexes(custom).slice(1)])
  })

  it('merges a drag of the base into one undo step, and does nothing for a colour that is not there or does not change', () => {
    let state = run(fresh(), { type: 'use_harmony', harmony: 'triad' })
    const before = state.history.past.length
    state = run(state, { type: 'set_base', id: 1, hex: '#2090E1' }, { type: 'set_base', id: 1, hex: '#2191E2' }, { type: 'set_base', id: 1, hex: '#2292E3' })
    expect(state.history.past).toHaveLength(before + 1)
    expect(reduce(state, { type: 'set_base', id: 99, hex: '#000000' })).toBe(state)
    expect(reduce(state, { type: 'set_base', id: 1, hex: '#2292E3' })).toBe(state)
  })

  it('does nothing for Generate in Custom', () => {
    const custom = run(fresh(), { type: 'use_harmony', harmony: 'custom' })
    expect(reduce(custom, { type: 'generate' })).toBe(custom)
  })
})
