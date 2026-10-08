import { DEFAULT_LAYOUT, docOf, openWorkspace, shownWindows, toolbarTools, type WorkspaceState } from '../lib/workspaceState.ts'
import { applyTurnActions, type ApplyEnv } from './applyActions.ts'
import { openSnapshot } from './fixtures.ts'
import type { PaletteAction as TurnAction } from './spec.ts'

const blocks = () => [
  { id: 1, hex: '#1F8FE0' },
  { id: 2, hex: '#0B4F8A' },
  { id: 3, hex: '#CFE9FB' },
  { id: 4, hex: '#0E1A2B' },
]
const drawn = openSnapshot().layout
const env: ApplyEnv = { layout: drawn, heights: { picker: 9, role: 9, generate: 9, canvas: 29, preview: 30 } }
const open = (b: ReturnType<typeof blocks>) => openWorkspace(b)
const fresh = () => openWorkspace(blocks())

const apply = (actions: TurnAction[], base: WorkspaceState | null = fresh()) => applyTurnActions({ base, open, actions, env })
const reasons = (actions: TurnAction[], base?: WorkspaceState | null) => apply(actions, base).skipped.map((s) => s.reason)
// For a workspace that has already changed, the environment is what is drawn for that workspace.
const applyOn = (base: WorkspaceState, actions: TurnAction[]) =>
  applyTurnActions({
    base,
    open,
    actions,
    env: { layout: docOf(base).layout.filter((p) => shownWindows(docOf(base)).includes(p.id)), heights: { picker: 40, role: 30, generate: 30, canvas: 29, preview: 50 } },
  })
const hexes = (state: WorkspaceState | null) => docOf(state!).blocks.map((b) => b.hex)

describe('colours', () => {
  it('changes the colour with the number the model gave, counting from 1', () => {
    const result = apply([{ type: 'set_colour', index: 2, hex: '#2b3a55', name: 'Navy', rationale: 'Steady.' }])
    expect(result.skipped).toEqual([])
    expect(hexes(result.state)[1]).toBe('#2B3A55')
    expect(docOf(result.state!).blocks[1]).toMatchObject({ name: 'Navy', note: 'Steady.' })
  })

  it('works out each number against the palette as it is at that step', () => {
    const result = apply([
      { type: 'add_colour', hex: '#B5543A', name: 'Clay' },
      { type: 'set_role', index: 5, role: 'accent' },
      { type: 'remove_colour', index: 1 },
      { type: 'set_colour', index: 1, hex: '#123456' },
    ])
    expect(result.skipped).toEqual([])
    // colour 1 (blue) was removed, so "colour 1" now means the old colour 2
    expect(hexes(result.state)).toEqual(['#123456', '#CFE9FB', '#0E1A2B', '#B5543A'])
    expect(docOf(result.state!).blocks[3].role).toBe('accent')
  })

  it('refuses a number that is not in the palette, and says what the numbers are', () => {
    const [reason] = reasons([{ type: 'set_colour', index: 7, hex: '#123456' }])
    expect(reason).toMatch(/no colour 7/)
    expect(reason).toMatch(/1 to 4/)
  })

  it('refuses to go past eight colours or below two', () => {
    const full = openWorkspace(Array.from({ length: 8 }, (_, i) => ({ id: i + 1, hex: ['#FFFFFF', '#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF'][i] })))
    expect(reasons([{ type: 'add_colour', hex: '#808080' }], full)[0]).toMatch(/already has 8/)
    const two = openWorkspace(blocks().slice(2))
    expect(reasons([{ type: 'remove_colour', index: 1 }], two)[0]).toMatch(/only 2 colours/)
  })

  it('gives a role and clears it, and keeps or releases a colour', () => {
    const result = apply([{ type: 'set_role', index: 1, role: 'primary' }, { type: 'keep_colour', index: 4, keep: true }, { type: 'set_role', index: 1, role: 'none' }])
    expect(docOf(result.state!).blocks[0].role).toBeUndefined()
    expect(docOf(result.state!).blocks[3].locked).toBe(true)
  })

  it('selects a colour', () => {
    expect(apply([{ type: 'select_colour', index: 3 }]).state?.selectedId).toBe(3)
  })

  it('generates from the selected colour or the one named, with the harmony asked for', () => {
    const result = apply([{ type: 'generate', harmony: 'triad', from: 3 }])
    expect(result.state?.harmony).toBe('triad')
    expect(result.state?.selectedId).toBe(3)
    expect(hexes(result.state)[2]).toBe('#CFE9FB')
    expect(hexes(result.state)[0]).not.toBe('#1F8FE0')
  })

  it('refuses to generate when every other colour is kept', () => {
    const locked = openWorkspace(blocks().map((b) => (b.id === 1 ? b : { ...b, locked: true })))
    expect(reasons([{ type: 'generate', harmony: 'analogous' }], locked)[0]).toMatch(/nothing for Generate to fill in/)
  })
})

describe('components and layout', () => {
  it('hides and shows a component', () => {
    const hidden = apply([{ type: 'hide_component', component: 'preview' }]).state!
    expect(docOf(hidden).hidden).toEqual(['preview'])
    const shown = apply([{ type: 'show_component', component: 'preview', reason: 'To check it on paper.' }], hidden).state!
    expect(docOf(shown).hidden).toEqual([])
    expect(docOf(shown).reasons.preview).toBe('To check it on paper.')
  })

  it('moves a component above another by working out where a person would drop it', () => {
    const result = apply([{ type: 'move_component', component: 'preview', relativeTo: 'canvas', placement: 'above' }])
    expect(result.skipped).toEqual([])
    const layout = docOf(result.state!).layout
    expect(layout.find((p) => p.id === 'preview')!.row).toBeLessThan(layout.find((p) => p.id === 'canvas')!.row)
    expect(layout.map((p) => p.id).sort()).toEqual(['canvas', 'generate', 'picker', 'preview', 'role'])
  })

  it('refuses to put something beside a full-width panel, and says to make it narrower first', () => {
    const [reason] = reasons([{ type: 'move_component', component: 'preview', relativeTo: 'canvas', placement: 'right_of' }])
    expect(reason).toMatch(/no room right of "canvas"/)
    expect(reason).toMatch(/resize_component/)
  })

  it('allows it once the panel has been made narrower earlier in the same turn', () => {
    const result = apply([
      { type: 'resize_component', component: 'canvas', size: 'half' },
      { type: 'move_component', component: 'preview', relativeTo: 'canvas', placement: 'right_of' },
    ])
    expect(result.skipped).toEqual([])
    const layout = docOf(result.state!).layout
    const canvas = layout.find((p) => p.id === 'canvas')!
    const preview = layout.find((p) => p.id === 'preview')!
    expect(canvas.w).toBe(12)
    expect(preview.col).toBeGreaterThanOrEqual(canvas.col + canvas.w)
    expect(preview.row).toBeLessThan(canvas.row + 1)
  })

  it('will not move or resize a component that is not on screen, and will after it is shown', () => {
    const hidden = apply([{ type: 'hide_component', component: 'preview' }]).state!
    const hiddenEnv: ApplyEnv = { ...env, layout: drawn.filter((p) => p.id !== 'preview') }
    const refused = applyTurnActions({ base: hidden, open, env: hiddenEnv, actions: [{ type: 'move_component', component: 'preview', relativeTo: 'canvas', placement: 'below' }] })
    expect(refused.skipped[0].reason).toMatch(/not on screen/)
    const allowed = applyTurnActions({
      base: hidden,
      open,
      env: hiddenEnv,
      actions: [{ type: 'show_component', component: 'preview' }, { type: 'resize_component', component: 'preview', size: 'half' }],
    })
    expect(allowed.skipped).toEqual([])
  })

  it('reorders the toolbar by putting a tool left of or right of another, and says when it is already there', () => {
    const left = apply([{ type: 'move_component', component: 'generate', relativeTo: 'picker', placement: 'left_of' }])
    expect(left.skipped).toEqual([])
    expect(docOf(left.state!).tools).toEqual(['generate', 'picker', 'role'])
    const right = apply([{ type: 'move_component', component: 'picker', relativeTo: 'role', placement: 'right_of' }])
    expect(docOf(right.state!).tools).toEqual(['role', 'picker', 'generate'])
    expect(reasons([{ type: 'move_component', component: 'role', relativeTo: 'picker', placement: 'right_of' }])[0]).toMatch(/already right of "picker"/)
  })

  it('will not put a tool above or below another, or a tool and a window against each other', () => {
    expect(reasons([{ type: 'move_component', component: 'role', relativeTo: 'picker', placement: 'above' }])[0]).toMatch(/side by side/)
    expect(reasons([{ type: 'move_component', component: 'picker', relativeTo: 'canvas', placement: 'left_of' }])[0]).toMatch(/tool.*window/)
    expect(reasons([{ type: 'move_component', component: 'canvas', relativeTo: 'picker', placement: 'below' }])[0]).toMatch(/tool.*window/)
  })

  it('skips a hidden tool in the order, so a tool goes next to one that is on screen', () => {
    const hidden = apply([{ type: 'hide_component', component: 'role' }]).state!
    const moved = apply([{ type: 'move_component', component: 'generate', relativeTo: 'picker', placement: 'right_of' }], hidden)
    expect(moved.skipped[0].reason).toMatch(/already right of/)
    expect(reasons([{ type: 'move_component', component: 'generate', relativeTo: 'role', placement: 'left_of' }], hidden)[0]).toMatch(/not on screen/)
  })

  it('refuses to place a component relative to itself', () => {
    expect(reasons([{ type: 'move_component', component: 'canvas', relativeTo: 'canvas', placement: 'below' }])[0]).toMatch(/relative to itself/)
  })

  it('resizes a window to a width, and says a tool in the toolbar has only one size', () => {
    const state = apply([{ type: 'resize_component', component: 'canvas', size: 'two_thirds' }]).state!
    expect(docOf(state).layout.find((p) => p.id === 'canvas')?.w).toBe(16)
    expect(reasons([{ type: 'resize_component', component: 'picker', size: 'half' }])[0]).toMatch(/one size.*expand_tool/)
  })

  it('turns a tool into a window and back, and a window can then be resized and placed like any other', () => {
    const out = apply([{ type: 'expand_tool', component: 'picker' }]).state!
    expect(docOf(out).expanded).toEqual(['picker'])
    expect(toolbarTools(docOf(out))).toEqual(['role', 'generate'])
    const resized = applyOn(out, [{ type: 'resize_component', component: 'picker', size: 'half' }, { type: 'move_component', component: 'picker', relativeTo: 'canvas', placement: 'below' }])
    expect(resized.skipped).toEqual([])
    expect(docOf(resized.state!).layout.find((p) => p.id === 'picker')?.w).toBe(12)
    const back = applyOn(out, [{ type: 'collapse_tool', component: 'picker' }]).state!
    expect(docOf(back).expanded).toEqual([])
    expect(toolbarTools(docOf(back))).toEqual(['picker', 'role', 'generate'])
  })

  it('says when a tool is already a window or already in the toolbar, and keeps tools and windows apart for moves', () => {
    const out = apply([{ type: 'expand_tool', component: 'picker' }]).state!
    const why = (actions: TurnAction[]) => applyOn(out, actions).skipped.map((skipped) => skipped.reason)
    expect(why([{ type: 'expand_tool', component: 'picker' }])[0]).toMatch(/already a window/)
    expect(why([{ type: 'collapse_tool', component: 'role' }])[0]).toMatch(/already in the toolbar/)
    expect(why([{ type: 'move_component', component: 'picker', relativeTo: 'role', placement: 'left_of' }])[0]).toMatch(/tool.*window/)
    expect(why([{ type: 'move_component', component: 'role', relativeTo: 'generate', placement: 'right_of' }])).toEqual([])
  })

  it('resets the layout, bringing every tool back to the toolbar', () => {
    const moved = apply([{ type: 'expand_tool', component: 'picker' }, { type: 'resize_component', component: 'canvas', size: 'half' }]).state!
    const reset = apply([{ type: 'reset_layout' }], moved).state!
    expect(docOf(reset).layout).toEqual(DEFAULT_LAYOUT)
    expect(docOf(reset).expanded).toEqual([])
  })
})

describe('the whole turn', () => {
  it('is one step in the history, so one undo takes back everything the AI did', () => {
    const base = fresh()
    const result = apply([{ type: 'set_colour', index: 1, hex: '#B5543A' }, { type: 'set_role', index: 1, role: 'primary' }, { type: 'hide_component', component: 'role' }])
    expect(result.state!.history.past).toHaveLength(1)
    const undone = applyTurnActions({ base: result.state, open, env, actions: [{ type: 'undo' }] }).state!
    expect(docOf(undone)).toEqual(docOf(base))
  })

  it('undoes and redoes on its own, and refuses when there is nothing to undo or redo or it is mixed with others', () => {
    const changed = apply([{ type: 'set_colour', index: 1, hex: '#B5543A' }]).state!
    expect(hexes(applyTurnActions({ base: changed, open, env, actions: [{ type: 'undo' }] }).state)[0]).toBe('#1F8FE0')
    expect(reasons([{ type: 'undo' }])[0]).toMatch(/nothing to undo/)
    expect(reasons([{ type: 'redo' }])[0]).toMatch(/nothing to redo/)
    expect(reasons([{ type: 'select_colour', index: 2 }, { type: 'undo' }], changed)[0]).toMatch(/on their own/)
  })

  it('reports the export as something for the app to do, not a change to the workspace', () => {
    const result = apply([{ type: 'export_brand_sheet' }])
    expect(result.effects).toEqual(['export'])
    expect(result.state?.history.past).toHaveLength(0)
  })

  it('refuses a turn that leaves a palette nothing can be read on, and changes nothing', () => {
    const base = fresh()
    const result = apply([
      { type: 'set_colour', index: 1, hex: '#808080' },
      { type: 'set_colour', index: 2, hex: '#858585' },
      { type: 'set_colour', index: 3, hex: '#8A8A8A' },
      { type: 'set_colour', index: 4, hex: '#7D7D7D' },
    ])
    expect(result.skipped[0].reason).toMatch(/After these changes.*No two colours reach/)
    expect(hexes(result.state)).toEqual(hexes(base))
  })

  it('refuses a duplicate colour or a role used twice', () => {
    expect(reasons([{ type: 'set_colour', index: 2, hex: '#1F8FE0' }])[0]).toMatch(/more than once/)
  })
})

describe('opening a workspace', () => {
  it('opens one from a set_palette action, with a clean history and the reason recorded', () => {
    const result = apply(
      [{ type: 'set_palette', colours: [{ hex: '#F7EFE6', name: 'Cream', rationale: 'Soft.', role: 'background' }, { hex: '#3B2A22', name: 'Cocoa', rationale: 'Dark.', role: 'text' }, { hex: '#B5543A', name: 'Clay', rationale: 'Warm.' }], reason: 'Your colours.', businessName: 'Kindred' }],
      null,
    )
    expect(result.opened).toBe(true)
    expect(result.skipped).toEqual([])
    expect(docOf(result.state!).blocks).toHaveLength(3)
    expect(docOf(result.state!).reasons.canvas).toBe('Your colours.')
    expect(docOf(result.state!).businessName).toBe('Kindred')
    expect(result.state!.history.past).toHaveLength(0)
  })

  it('does nothing with other actions when no workspace is open', () => {
    const result = apply([{ type: 'set_colour', index: 1, hex: '#123456' }], null)
    expect(result.state).toBeNull()
    expect(result.skipped[0].reason).toMatch(/Start with a set_palette/)
  })

  it('refuses a palette that breaks the rules before opening anything', () => {
    const grey = [{ hex: '#7A7A7A', name: 'A', rationale: 'x' }, { hex: '#808080', name: 'B', rationale: 'x' }, { hex: '#858585', name: 'C', rationale: 'x' }]
    const result = apply([{ type: 'set_palette', colours: grey, reason: 'x' }], null)
    expect(result.opened).toBe(false)
    expect(result.state).toBeNull()
    expect(result.skipped[0].reason).toMatch(/No two colours reach/)
  })

  it('replaces the palette of a workspace that is open, as a step that can be undone', () => {
    const result = apply([{ type: 'set_palette', colours: [{ hex: '#F7EFE6', name: 'Cream', rationale: 'Soft.' }, { hex: '#3B2A22', name: 'Cocoa', rationale: 'Dark.' }, { hex: '#B5543A', name: 'Clay', rationale: 'Warm.' }], reason: 'x' }])
    expect(result.opened).toBe(false)
    expect(docOf(result.state!).blocks).toHaveLength(3)
    expect(result.state!.history.past).toHaveLength(1)
  })
})

describe('the changes it reports, for the receipt', () => {
  const texts = (actions: TurnAction[], base?: WorkspaceState | null) => apply(actions, base).changes.map((change) => change.text)

  it('says a colour was made darker or lighter, worked out from the colours and not from anything the model said', () => {
    expect(texts([{ type: 'set_colour', index: 1, hex: '#0A4A7A' }])).toEqual(['Colour 1 made darker (#0A4A7A)'])
    expect(texts([{ type: 'set_colour', index: 3, hex: '#E8F4FD' }])).toEqual(['Colour 3 made lighter (#E8F4FD)'])
    expect(texts([{ type: 'set_colour', index: 1, hex: '#1F8FE1' }])).toEqual(['Colour 1 changed to #1F8FE1'])
  })

  it('says what was added and removed, marked as such, and points at the colour', () => {
    const added = apply([{ type: 'add_colour', hex: '#E9A23B', name: 'Amber' }])
    expect(added.changes).toEqual([{ kind: 'added', text: 'Colour 5 added: Amber, #E9A23B', focus: [{ kind: 'block', id: 5, how: 'added' }] }])
    const removed = apply([{ type: 'remove_colour', index: 2 }])
    expect(removed.changes).toEqual([{ kind: 'removed', text: 'Colour 2 removed (#0B4F8A)', focus: [{ kind: 'block', id: 2, how: 'removed' }] }])
  })

  it('says a whole palette is new, with its colours', () => {
    const colours = [
      { hex: '#FBF3E6', name: 'Wax cream', rationale: 'x' },
      { hex: '#3A2540', name: 'Smoky plum', rationale: 'x' },
      { hex: '#8A4F7D', name: 'Dusk mauve', rationale: 'x' },
    ]
    const result = applyTurnActions({ base: null, open, actions: [{ type: 'set_palette', colours, reason: 'x' }], env })
    expect(result.changes.map((change) => change.text)).toEqual(['A new palette of 3 colours: Wax cream, Smoky plum, Dusk mauve'])
    expect(result.changes[0].focus).toHaveLength(3)
  })

  it('says roles, keeps, and what Generate filled in', () => {
    expect(texts([{ type: 'set_role', index: 2, role: 'primary' }])).toEqual(['Colour 2 is now the primary colour'])
    expect(texts([{ type: 'set_role', index: 2, role: 'none' }])).toEqual(['Cleared the role of colour 2'])
    expect(texts([{ type: 'keep_colour', index: 3, keep: true }])).toEqual(['Colour 3 will be kept when Generate fills in the others'])
    const generated = apply([{ type: 'generate', harmony: 'triad', from: 1 }])
    expect(generated.changes[0].text).toMatch(/^Generated 3 colours from a triad harmony$/)
    expect(generated.changes[0].focus.map((target) => target.id)).toEqual([2, 3, 4])
  })

  it('says what was done to the layout, in words', () => {
    expect(texts([{ type: 'hide_component', component: 'preview' }])).toEqual(['Hid the sample invoice'])
    expect(texts([{ type: 'resize_component', component: 'canvas', size: 'half' }])).toEqual(['Made the palette half width'])
    expect(texts([{ type: 'expand_tool', component: 'role' }])).toEqual(['Made the role tool a window'])
    expect(texts([{ type: 'reset_layout' }])).toEqual(['Reset the layout'])
  })

  it('reports a line for each action, in the order they were applied, and none for one that was left out', () => {
    const result = apply([
      { type: 'set_colour', index: 1, hex: '#0A4A7A' },
      { type: 'set_colour', index: 9, hex: '#0A4A7A' },
      { type: 'set_role', index: 1, role: 'accent' },
    ])
    expect(result.changes.map((change) => change.text)).toEqual(['Colour 1 made darker (#0A4A7A)', 'Colour 1 is now the accent colour'])
    expect(result.skipped).toHaveLength(1)
  })

  it('reports no change when nothing was done, and the turn that undoes as taking back', () => {
    expect(apply([{ type: 'set_colour', index: 9, hex: '#123456' }]).changes).toEqual([])
    const done = apply([{ type: 'set_colour', index: 1, hex: '#0A4A7A' }]).state!
    expect(applyOn(done, [{ type: 'undo' }]).changes.map((change) => change.text)).toEqual(['Took back the last change'])
  })
})
