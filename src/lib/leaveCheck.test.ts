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
    expect(paletteHasChanges(openWorkspace(starterBlocks()), null)).toBe(false)
  })

  it('has changes once a colour is changed, and none again once the change is taken back', () => {
    const start = openWorkspace(starterBlocks())
    const id = docOf(start).blocks[0].id
    const changed = reduce(start, { type: 'set_hex', id, hex: '#123456' })
    expect(paletteHasChanges(changed, null)).toBe(true)
    expect(paletteHasChanges(reduce(changed, { type: 'undo' }), null)).toBe(false)
  })

  it('compares with what was saved when something is', () => {
    const start = openWorkspace(starterBlocks())
    const doc = docOf(start)
    const saved = { blocks: doc.blocks, savedAt: 'x' }
    expect(paletteHasChanges(openWorkspace(doc.blocks), saved)).toBe(false)
    const changed = reduce(start, { type: 'set_hex', id: doc.blocks[0].id, hex: '#123456' })
    expect(paletteHasChanges(changed, saved)).toBe(true)
  })
})

describe('invoiceHasChanges', () => {
  it('has none for an invoice nobody has touched, though nothing is saved', () => {
    expect(invoiceHasChanges(openInvoiceWorkspace(newContent('2026-10-04')), noMemory)).toBe(false)
  })

  it('has changes once something is typed on it', () => {
    const state = reduceInvoice(openInvoiceWorkspace(newContent('2026-10-04')), { type: 'set_client', patch: { name: 'Pretoria Print Works' } })
    expect(invoiceHasChanges(state, noMemory)).toBe(true)
  })

  it('compares with the saved invoice when there is one', () => {
    const opened = openInvoiceWorkspace(newContent('2026-10-04'))
    const doc = invoiceDocOf(opened)
    const memory = withInvoice(noMemory, doc.invoiceId, doc.content, '2026-10-04T10:00:00')
    expect(invoiceHasChanges(opened, memory)).toBe(false)
    expect(invoiceHasChanges(reduceInvoice(opened, { type: 'set_client', patch: { name: 'Someone' } }), memory)).toBe(true)
  })
})
