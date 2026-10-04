import { describe, expect, it } from 'vitest'
import { starterBlocks } from '../compose/fallback.ts'
import { newContent } from './invoice.ts'
import { invoiceDocOf, openInvoiceWorkspace, reduceInvoice } from './invoiceState.ts'
import { invoiceHasChanges, paletteHasChanges } from './leaveCheck.ts'
import { withInvoice } from './projectMemory.ts'
import { docOf, openWorkspace, reduce } from './workspaceState.ts'

const noMemory = { business: null, clients: [], invoices: [] }

describe('paletteHasChanges', () => {
  it('has none when nobody has touched the starter palette, though nothing is saved', () => {
    expect(paletteHasChanges(openWorkspace(starterBlocks(), null), null)).toBe(false)
  })

  it('has changes once a colour is changed, and none again once the change is taken back', () => {
    const start = openWorkspace(starterBlocks(), null)
    const id = docOf(start).blocks[0].id
    const changed = reduce(start, { type: 'set_hex', id, hex: '#123456' })
    expect(paletteHasChanges(changed, null)).toBe(true)
    expect(paletteHasChanges(reduce(changed, { type: 'undo' }), null)).toBe(false)
  })

  it('does not count opening a window as work to lose, when nothing is saved', () => {
    const start = openWorkspace(starterBlocks(), null)
    expect(paletteHasChanges(reduce(start, { type: 'reset_layout' }), null)).toBe(false)
  })

  it('compares with what was saved when something is', () => {
    const start = openWorkspace(starterBlocks(), null)
    const doc = docOf(start)
    const saved = { blocks: doc.blocks, layout: doc.layout, tools: doc.tools, expanded: doc.expanded, hidden: doc.hidden, savedAt: 'x' }
    expect(paletteHasChanges(openWorkspace(doc.blocks, saved), saved)).toBe(false)
    const changed = reduce(start, { type: 'set_hex', id: doc.blocks[0].id, hex: '#123456' })
    expect(paletteHasChanges(changed, saved)).toBe(true)
  })
})

describe('invoiceHasChanges', () => {
  it('has none for an invoice nobody has touched, though nothing is saved', () => {
    expect(invoiceHasChanges(openInvoiceWorkspace(newContent('2026-10-04')), noMemory, null)).toBe(false)
  })

  it('has changes once something is typed on it', () => {
    const state = reduceInvoice(openInvoiceWorkspace(newContent('2026-10-04')), { type: 'set_client', patch: { name: 'Pretoria Print Works' } })
    expect(invoiceHasChanges(state, noMemory, null)).toBe(true)
  })

  it('does not count a window opened from the toolbar as work to lose, when nothing is saved', () => {
    const state = reduceInvoice(openInvoiceWorkspace(newContent('2026-10-04')), { type: 'expand_tool', id: 'client' })
    expect(invoiceHasChanges(state, noMemory, null)).toBe(false)
  })

  it('compares with the saved invoice when there is one', () => {
    const opened = openInvoiceWorkspace(newContent('2026-10-04'))
    const doc = invoiceDocOf(opened)
    const memory = withInvoice(noMemory, doc.invoiceId, doc.content, '2026-10-04T10:00:00')
    const arrangement = { layout: doc.layout, tools: doc.tools, expanded: doc.expanded, hidden: doc.hidden, savedAt: 'x' }
    expect(invoiceHasChanges(opened, memory, arrangement)).toBe(false)
    expect(invoiceHasChanges(reduceInvoice(opened, { type: 'set_client', patch: { name: 'Someone' } }), memory, arrangement)).toBe(true)
  })
})
