import { describe, expect, it } from 'vitest'
import {
  arrangementIsDefault,
  arrangementUnsaved,
  clampPanelWidth,
  isArrangementAction,
  normaliseExpanded,
  normaliseTools,
  openArrangement,
  reduceArrangement,
  shownWindows,
  toolbarTools,
  type ArrangementSpec,
} from './arrangement.ts'

// A made-up task, to show the arrangement does not depend on the palette: one window and two tools.
const spec: ArrangementSpec = {
  components: [
    { id: 'page', label: 'Page', kind: 'panel', hideable: false },
    { id: 'notes', label: 'Notes', kind: 'panel', hideable: true },
    { id: 'a', label: 'A', kind: 'toolbar', hideable: true },
    { id: 'b', label: 'B', kind: 'toolbar', hideable: true },
  ],
  layout: [
    { id: 'page', col: 0, row: 0, w: 14 },
    { id: 'notes', col: 14, row: 0, w: 10 },
    { id: 'a', col: 0, row: 30, w: 8 },
    { id: 'b', col: 8, row: 30, w: 8 },
  ],
  windowSizes: { page: { w: 14, heightPx: 300 }, notes: { w: 10, heightPx: 200 }, a: { w: 8, heightPx: 200 }, b: { w: 8, heightPx: 200 } },
}
const open = () => openArrangement(spec)

describe('openArrangement', () => {
  it('starts with the spec layout, every tool in the toolbar and nothing hidden', () => {
    const a = open()
    expect(a.layout).toEqual(spec.layout)
    expect(toolbarTools(a)).toEqual(['a', 'b'])
    expect(shownWindows(spec, a)).toEqual(['page', 'notes'])
    expect(arrangementIsDefault(spec, a)).toBe(true)
  })

  it('ignores a saved layout, tool order, pulled-out tools and hidden parts', () => {
    const a = openArrangement(spec, {
      layout: [{ id: 'page', col: 2, row: 4, w: 3 }, { id: 'ghost', col: 0, row: 0, w: 4 }],
      tools: ['b', 'ghost'],
      expanded: ['a', 'page'],
      hidden: ['notes', 'b'],
    })
    expect(a.layout).toEqual(spec.layout)
    expect(a.tools).toEqual(['a', 'b'])
    expect(a.expanded).toEqual([])
    expect(a.hidden).toEqual([])
    expect(arrangementIsDefault(spec, a)).toBe(true)
  })

  it('opens a save that has no layout with the defaults', () => {
    expect(openArrangement(spec, { hidden: ['notes'] }).layout).toEqual(spec.layout)
  })

  it('still hides what the spec hides by default', () => {
    expect(openArrangement({ ...spec, defaultHidden: ['notes'] }, { hidden: [] }).hidden).toEqual(['notes'])
  })

  it('completes an order and an expanded list', () => {
    expect(normaliseTools(spec, ['b'])).toEqual(['b', 'a'])
    expect(normaliseExpanded(spec, ['b', 'b', 'page', 'ghost'])).toEqual(['b'])
    expect(clampPanelWidth(40)).toBe(24)
  })
})

describe('reduceArrangement', () => {
  it('returns the very same object when nothing changes', () => {
    const a = open()
    expect(reduceArrangement(spec, a, { type: 'move_tool', id: 'a', before: 'b' })).toBe(a)
    expect(reduceArrangement(spec, a, { type: 'expand_tool', id: 'page' })).toBe(a)
    expect(reduceArrangement(spec, a, { type: 'collapse_tool', id: 'a' })).toBe(a)
    expect(reduceArrangement(spec, a, { type: 'resize', id: 'a', value: 12 })).toBe(a)
    expect(reduceArrangement(spec, a, { type: 'hide', component: 'page' })).toBe(a)
    expect(reduceArrangement(spec, a, { type: 'show', component: 'notes' })).toBe(a)
  })

  it('turns a tool into a window and back, in the place it is dropped', () => {
    const out = reduceArrangement(spec, open(), { type: 'expand_tool', id: 'a' })
    expect(toolbarTools(out)).toEqual(['b'])
    expect(shownWindows(spec, out)).toEqual(['page', 'notes', 'a'])
    expect(toolbarTools(reduceArrangement(spec, out, { type: 'collapse_tool', id: 'a', before: 'b' }))).toEqual(['a', 'b'])
    expect(toolbarTools(reduceArrangement(spec, out, { type: 'collapse_tool', id: 'a', before: null }))).toEqual(['b', 'a'])
  })

  it('hides a window and a tool, shows them again, and resets everything but what is hidden', () => {
    let a = reduceArrangement(spec, open(), { type: 'hide', component: 'notes' })
    a = reduceArrangement(spec, a, { type: 'hide', component: 'b' })
    expect(shownWindows(spec, a)).toEqual(['page'])
    expect(toolbarTools(a)).toEqual(['a'])
    a = reduceArrangement(spec, a, { type: 'expand_tool', id: 'a' })
    a = reduceArrangement(spec, a, { type: 'resize', id: 'page', value: 20 })
    expect(arrangementIsDefault(spec, a)).toBe(false)
    a = reduceArrangement(spec, a, { type: 'reset_layout' })
    expect(a.expanded).toEqual([])
    expect(a.hidden).toEqual(['notes', 'b'])
    expect(reduceArrangement(spec, a, { type: 'show', component: 'b', reason: 'Because.' }).reasons.b).toBe('Because.')
  })

  it('recognises its own actions', () => {
    expect(isArrangementAction({ type: 'move_tool' })).toBe(true)
    expect(isArrangementAction({ type: 'set_hex' })).toBe(false)
  })
})

describe('arrangementUnsaved', () => {
  it('never counts the arrangement, because a saved one is not applied when a workspace opens', () => {
    const a = open()
    const saved = { layout: a.layout, tools: ['b', 'a'], expanded: ['a'], hidden: ['notes'] }
    expect(arrangementUnsaved(spec, a, saved)).toBe(false)
    expect(arrangementUnsaved(spec, reduceArrangement(spec, a, { type: 'move_tool', id: 'a', before: null }), saved)).toBe(false)
    expect(arrangementUnsaved(spec, reduceArrangement(spec, a, { type: 'hide', component: 'notes' }), {})).toBe(false)
  })
})
