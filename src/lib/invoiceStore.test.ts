import { beforeEach, describe, expect, it } from 'vitest'
import { emptyBusiness, newContent } from './invoice.ts'
import { INVOICE_LAYOUT, invoiceDocOf } from './invoiceState.ts'
import { clearInvoice, duplicateInvoice, loadInvoice, openInvoiceForProject, openNewInvoice, openSavedInvoice, saveArrangement } from './invoiceStore.ts'
import { saveMemory } from './memoryStore.ts'
import { emptyMemory, markExported, withBusiness, withInvoice } from './projectMemory.ts'

const arrangement = { layout: INVOICE_LAYOUT }

beforeEach(() => window.localStorage.clear())

describe('the saved arrangement', () => {
  it('saves and loads per project', async () => {
    await saveArrangement('duckstack', arrangement)
    expect(await loadInvoice('duckstack')).toMatchObject(arrangement)
    expect(await loadInvoice('typography')).toBeNull()
  })

  it('keeps the order of the tools, which tools are windows, and what is hidden', async () => {
    await saveArrangement('duckstack', { ...arrangement, tools: ['vat', 'total'], expanded: ['client'], hidden: ['terms'] })
    expect(await loadInvoice('duckstack')).toMatchObject({ tools: ['vat', 'total'], expanded: ['client'], hidden: ['terms'] })
  })

  it('clears it', async () => {
    await saveArrangement('duckstack', arrangement)
    await clearInvoice('duckstack')
    expect(await loadInvoice('duckstack')).toBeNull()
  })

  it('rejects what is not an arrangement, instead of loading it', async () => {
    const put = (value: unknown) => window.localStorage.setItem('droplet-project-duckstack-invoice', JSON.stringify(value))
    put({ layout: [{ id: 'x', col: 0, row: 0, w: 99 }], savedAt: 'x' })
    expect(await loadInvoice('duckstack')).toBeNull()
    window.localStorage.setItem('droplet-project-duckstack-invoice', 'not json')
    expect(await loadInvoice('duckstack')).toBeNull()
  })

  it('still reads an invoice saved before a project had a memory', async () => {
    window.localStorage.setItem('droplet-project-duckstack-invoice', JSON.stringify({ content: newContent('2026-10-04', 'INV-0042'), layout: INVOICE_LAYOUT, savedAt: 'x' }))
    expect((await loadInvoice('duckstack'))?.content?.details.number).toBe('INV-0042')
    expect(invoiceDocOf(await openInvoiceForProject('duckstack', '2026-11-01')).content.details.number).toBe('INV-0042')
  })
})

describe('opening the invoice workspace', () => {
  const business = { ...emptyBusiness(), name: 'Kindred Gifting', address: '12 Jacaranda Street' }

  it('is a new invoice dated today, numbered INV-0001, when nothing is remembered', async () => {
    const doc = invoiceDocOf(await openInvoiceForProject('duckstack', '2026-11-01'))
    expect(doc.content.details).toMatchObject({ issueDate: '2026-11-01', number: 'INV-0001' })
    expect(doc.content.business.name).toBe('')
  })

  it('has the remembered business on it already, and the next number after the invoices that exist', async () => {
    let memory = withBusiness(emptyMemory(), business, 'x')
    memory = withInvoice(memory, 'i1', { ...newContent('2026-10-04', 'INV-0007'), business }, '2026-10-04T10:00')
    memory = markExported(memory, 'i1', '2026-10-04T11:00')
    await saveMemory('duckstack', memory)
    const doc = invoiceDocOf(await openInvoiceForProject('duckstack', '2026-11-01'))
    expect(doc.content.business).toEqual(business)
    expect(doc.content.details.number).toBe('INV-0008')
    expect(doc.content.details.issueDate).toBe('2026-11-01')
  })

  it('picks up an invoice that was confirmed and not yet exported, with the same id, so its number stays', async () => {
    const content = { ...newContent('2026-10-04', 'INV-0007'), business }
    await saveMemory('duckstack', withInvoice(emptyMemory(), 'i1', content, '2026-10-04T10:00'))
    const doc = invoiceDocOf(await openInvoiceForProject('duckstack', '2026-11-01'))
    expect(doc.invoiceId).toBe('i1')
    expect(doc.content).toEqual(content)
  })

  it('starts another invoice, keeps the arrangement given, and does not touch the one that was open', async () => {
    await saveMemory('duckstack', withInvoice(emptyMemory(), 'i1', newContent('2026-10-04', 'INV-0007'), '2026-10-04T10:00'))
    const state = await openNewInvoice('duckstack', { ...arrangement, tools: ['vat'], expanded: ['client'] }, '2026-11-01')
    const doc = invoiceDocOf(state)
    expect(doc.invoiceId).not.toBe('i1')
    expect(doc.content.details.number).toBe('INV-0008')
    expect(doc.tools[0]).toBe('vat')
    expect(doc.expanded).toEqual(['client'])
  })

  it('opens a saved invoice by id, and none that does not exist', async () => {
    await saveMemory('duckstack', withInvoice(emptyMemory(), 'i1', newContent('2026-10-04', 'INV-0007'), '2026-10-04T10:00'))
    expect(invoiceDocOf((await openSavedInvoice('duckstack', 'i1', arrangement))!).content.details.number).toBe('INV-0007')
    expect(invoiceDocOf((await openSavedInvoice('duckstack', 'i1', arrangement))!).invoiceId).toBe('i1')
    expect(await openSavedInvoice('duckstack', 'ghost', arrangement)).toBeNull()
  })

  it('duplicates an invoice as a new one with the next number and today\'s date', async () => {
    const content = { ...newContent('2026-10-04', 'INV-0007'), business }
    await saveMemory('duckstack', withInvoice(emptyMemory(), 'i1', { ...content, details: { ...content.details, notes: 'Thank you.' } }, '2026-10-04T10:00'))
    const doc = invoiceDocOf((await duplicateInvoice('duckstack', 'i1', arrangement, '2026-11-01'))!)
    expect(doc.invoiceId).not.toBe('i1')
    expect(doc.content.details).toMatchObject({ number: 'INV-0008', issueDate: '2026-11-01', notes: 'Thank you.' })
    expect(doc.content.business).toEqual(business)
    expect(await duplicateInvoice('duckstack', 'ghost', arrangement)).toBeNull()
  })
})
