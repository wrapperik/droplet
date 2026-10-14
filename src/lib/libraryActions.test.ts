import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyBusiness, emptyClient, newContent, type InvoiceContent } from './invoice.ts'
import { loadBoard, saveBoard } from './boardStore.ts'
import { exportLibraryItem, forgetLibraryItem } from './libraryActions.ts'
import { loadMemory, saveMemory } from './memoryStore.ts'
import { emptyMemory, withBusiness, withClient, withFact, withIdea, withInvoice } from './projectMemory.ts'
import { loadPalette, savePalette } from './projectStore.ts'

const exports = vi.hoisted(() => ({
  brandSheet: vi.fn(async (..._args: unknown[]) => true),
  board: vi.fn(async (..._args: unknown[]) => true),
  invoice: vi.fn(async (..._args: unknown[]) => true),
}))
vi.mock('./exportSheet.ts', () => ({ exportBrandSheet: exports.brandSheet }))
vi.mock('./boardExport.ts', async (original) => ({ ...(await original<typeof import('./boardExport.ts')>()), exportBoard: exports.board }))
vi.mock('./exportInvoice.ts', () => ({ exportInvoice: exports.invoice }))

const PROJECT = 'kindred'
const note = { id: 'a', kind: 'note' as const, x: 0, y: 0, w: 200, h: 180, text: 'Hampers', colour: 'yellow' as const, author: 'you' as const }
const business = { ...emptyBusiness(), name: 'Kindred Gifting', address: '12 Jacaranda Street' }
const client = { ...emptyClient(), name: 'Pretoria Print Works', address: '5 Church Square' }
const complete = (number: string): InvoiceContent => ({ ...newContent('2026-10-04', number), business, client, lines: [{ id: 1, description: 'Gift boxes', quantity: 12, unitCents: 45_000 }] })

beforeEach(() => {
  window.localStorage.clear()
  Object.values(exports).forEach((mock) => mock.mockClear().mockResolvedValue(true))
})

describe('exporting the palette', () => {
  it('says there is nothing to export when no palette is saved', async () => {
    expect(await exportLibraryItem(PROJECT, 'Kindred', { kind: 'brand' })).toEqual({ ok: false, reason: 'No palette is saved yet.' })
    expect(exports.brandSheet).not.toHaveBeenCalled()
  })

  it('makes the brand sheet from what is saved, and records when', async () => {
    await savePalette(PROJECT, { blocks: [{ id: 1, hex: '#0E1A2B' }, { id: 2, hex: '#F4F8FB' }], layout: [] })
    expect((await exportLibraryItem(PROJECT, 'Kindred', { kind: 'brand' })).ok).toBe(true)
    expect(exports.brandSheet).toHaveBeenCalledWith([{ id: 1, hex: '#0E1A2B' }, { id: 2, hex: '#F4F8FB' }], 'Kindred')
    expect((await loadPalette(PROJECT))?.exportedAt).toBeTruthy()
  })

  it('does not record an export that failed', async () => {
    await savePalette(PROJECT, { blocks: [{ id: 1, hex: '#0E1A2B' }, { id: 2, hex: '#F4F8FB' }], layout: [] })
    exports.brandSheet.mockResolvedValue(false)
    expect(await exportLibraryItem(PROJECT, 'Kindred', { kind: 'brand' })).toEqual({ ok: false, reason: 'The brand sheet could not be made.' })
    expect((await loadPalette(PROJECT))?.exportedAt).toBeUndefined()
  })

  it('keeps the date of the export when the palette is saved again', async () => {
    const blocks = [{ id: 1, hex: '#0E1A2B' }, { id: 2, hex: '#F4F8FB' }]
    await savePalette(PROJECT, { blocks, layout: [] })
    await exportLibraryItem(PROJECT, 'Kindred', { kind: 'brand' })
    const exportedAt = (await loadPalette(PROJECT))?.exportedAt
    await savePalette(PROJECT, { blocks: [...blocks, { id: 3, hex: '#0B4F8A' }], layout: [] })
    expect((await loadPalette(PROJECT))?.exportedAt).toBe(exportedAt)
  })
})

describe('exporting the board', () => {
  it('needs something saved on it', async () => {
    expect(await exportLibraryItem(PROJECT, 'Kindred', { kind: 'ideas', format: 'pdf' })).toEqual({ ok: false, reason: 'No board is saved yet.' })
    await saveBoard(PROJECT, { items: [], layout: [] })
    expect(await exportLibraryItem(PROJECT, 'Kindred', { kind: 'ideas', format: 'pdf' })).toEqual({ ok: false, reason: 'Put something on the board first.' })
    expect(exports.board).not.toHaveBeenCalled()
  })

  it('makes the file in the format asked for, from what is saved, and records when', async () => {
    await saveBoard(PROJECT, { items: [note], layout: [] })
    expect(await exportLibraryItem(PROJECT, 'Kindred', { kind: 'ideas', format: 'png' })).toEqual({ ok: true, text: 'The board was downloaded as a PNG.' })
    expect(exports.board).toHaveBeenCalledWith('png', { items: [note], projectName: 'Kindred' })
    expect((await loadBoard(PROJECT))?.exportedAt).toBeTruthy()
  })

  it('keeps the date of the export when the board is saved again', async () => {
    await saveBoard(PROJECT, { items: [note], layout: [] })
    await exportLibraryItem(PROJECT, 'Kindred', { kind: 'ideas', format: 'pdf' })
    const exportedAt = (await loadBoard(PROJECT))?.exportedAt
    await saveBoard(PROJECT, { items: [note, { ...note, id: 'b' }], layout: [] })
    expect((await loadBoard(PROJECT))?.exportedAt).toBe(exportedAt)
  })
})

describe('exporting an invoice', () => {
  const saveInvoice = async (content: InvoiceContent) => saveMemory(PROJECT, withInvoice(emptyMemory(), 'i1', content, '2026-10-04T08:00:00.000Z'))

  it('is refused when a required detail is missing, and names what is missing', async () => {
    await saveInvoice({ ...complete('INV-0001'), client: emptyClient() })
    const result = await exportLibraryItem(PROJECT, 'Kindred', { kind: 'invoice', id: 'i1' })
    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toMatch(/not ready to export.*client/i)
    expect(exports.invoice).not.toHaveBeenCalled()
    expect((await loadMemory(PROJECT)).invoices[0].exportedAt).toBeUndefined()
  })

  it('says so for an invoice that is no longer saved', async () => {
    expect(await exportLibraryItem(PROJECT, 'Kindred', { kind: 'invoice', id: 'gone' })).toEqual({ ok: false, reason: 'That invoice is not saved any more.' })
  })

  it('makes the PDF from what is saved, in the saved palette, and marks it exported', async () => {
    await savePalette(PROJECT, { blocks: [{ id: 1, hex: '#0E1A2B', role: 'text' }, { id: 2, hex: '#F4F8FB', role: 'background' }], layout: [] })
    await saveInvoice(complete('INV-0001'))
    expect(await exportLibraryItem(PROJECT, 'Kindred', { kind: 'invoice', id: 'i1' })).toEqual({ ok: true, text: 'The invoice was downloaded.' })
    const [content, roles] = exports.invoice.mock.calls[0] as [InvoiceContent, { text: { hex: string } }]
    expect(content.details.number).toBe('INV-0001')
    expect(roles.text.hex).toBe('#0E1A2B')
    expect((await loadMemory(PROJECT)).invoices[0].exportedAt).toBeTruthy()
  })

  it('gives the export the project\'s logo, or none', async () => {
    await saveInvoice(complete('INV-0001'))
    await exportLibraryItem(PROJECT, 'Kindred', { kind: 'invoice', id: 'i1' })
    expect(exports.invoice.mock.calls[0][2]).toBeNull()
    const { importLogo } = await import('./logoStore.ts')
    await importLogo(PROJECT, new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1])], 'k.png', { type: 'image/png' }))
    await exportLibraryItem(PROJECT, 'Kindred', { kind: 'invoice', id: 'i1' })
    expect((exports.invoice.mock.calls[1][2] as { name: string }).name).toBe('k.png')
  })

  it('does not mark an invoice exported when the file could not be made', async () => {
    await saveInvoice(complete('INV-0001'))
    exports.invoice.mockResolvedValue(false)
    expect((await exportLibraryItem(PROJECT, 'Kindred', { kind: 'invoice', id: 'i1' })).ok).toBe(false)
    expect((await loadMemory(PROJECT)).invoices[0].exportedAt).toBeUndefined()
  })
})

describe('forgetting', () => {
  const remembered = () => {
    let memory = withBusiness(emptyMemory(), business, 'x')
    memory = withClient(memory, client, 'x', 'c1')
    memory = withInvoice(memory, 'i1', complete('INV-0001'), 'x')
    memory = withInvoice(memory, 'i2', complete('INV-0002'), 'y')
    memory = withIdea(memory, 'name', 'Kindred Gifting', 'x')
    memory = withFact(memory, 'business.offer', 'Gift boxes', 'x')
    return memory
  }

  it('forgets one invoice and keeps the others', async () => {
    await saveMemory(PROJECT, remembered())
    expect(await forgetLibraryItem(PROJECT, { kind: 'invoice', id: 'i1' })).toBe(true)
    expect((await loadMemory(PROJECT)).invoices.map((invoice) => invoice.id)).toEqual(['i2'])
  })

  it('forgets one client', async () => {
    await saveMemory(PROJECT, remembered())
    await forgetLibraryItem(PROJECT, { kind: 'client', id: 'c1' })
    expect((await loadMemory(PROJECT)).clients).toEqual([])
  })

  it('forgets the name and the offer, but not the business details on invoices', async () => {
    await saveMemory(PROJECT, remembered())
    await forgetLibraryItem(PROJECT, { kind: 'idea' })
    const memory = await loadMemory(PROJECT)
    expect(memory.idea).toBeUndefined()
    expect(memory.facts?.['business.offer']).toBeUndefined()
    expect(memory.business?.details.name).toBe('Kindred Gifting')
  })
})
