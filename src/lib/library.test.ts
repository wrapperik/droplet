import { describe, expect, it } from 'vitest'
import { snapshotOfLibrary } from '../compose/librarySnapshot.ts'
import type { BoardSave } from './boardSave.ts'
import { emptyBusiness, emptyClient, newContent, type InvoiceContent } from './invoice.ts'
import { findInvoice, libraryOf, LIBRARY_SECTIONS, type BrandItem, type BusinessItem, type DetailsItem, type IdeasItem, type InvoiceItem, type Library } from './library.ts'
import type { ProjectMemory } from './memorySave.ts'
import type { PaletteSave } from './paletteSave.ts'
import { emptyMemory, markExported, withBusiness, withClient, withFact, withIdea, withInvoice } from './projectMemory.ts'

const palette = (text = '#0E1A2B', background = '#F4F8FB'): PaletteSave => ({
  blocks: [
    { id: 1, hex: text, role: 'text' },
    { id: 2, hex: background, role: 'background' },
    { id: 3, hex: '#0B4F8A', role: 'primary' },
  ],
  layout: [],
  savedAt: '2026-10-05T09:00:00.000Z',
})

const note = (id: string, text: string) => ({ id, kind: 'note' as const, x: 0, y: 0, w: 200, h: 180, text, colour: 'yellow' as const, author: 'you' as const })
const board = (): BoardSave => ({
  items: [note('a', 'Gift boxes'), note('b', 'Hampers'), { id: 'f', kind: 'frame', x: 0, y: 0, w: 480, h: 360, title: 'Offers', colour: 'white' }],
  layout: [],
  savedAt: '2026-10-06T09:00:00.000Z',
})

const business = { ...emptyBusiness(), name: 'Kindred Gifting', address: '12 Jacaranda Street', email: 'hello@kindred.example', bankName: 'Capitec', accountNumber: '1234567890' }
const client = { ...emptyClient(), name: 'Pretoria Print Works', address: '5 Church Square' }
const complete = (number: string): InvoiceContent => ({
  ...newContent('2026-10-04', number),
  business,
  client,
  lines: [{ id: 1, description: 'Gift boxes', quantity: 12, unitCents: 45_000 }],
})

const withInvoices = (): ProjectMemory => {
  let memory = withBusiness(emptyMemory(), business, '2026-10-01T08:00:00.000Z')
  memory = withClient(memory, client, '2026-10-01T08:00:00.000Z', 'c1')
  memory = withInvoice(memory, 'i1', complete('INV-0001'), '2026-10-02T08:00:00.000Z')
  memory = withInvoice(memory, 'i2', complete('INV-0002'), '2026-10-03T08:00:00.000Z')
  return memory
}

const itemsOf = <T extends { section: string }>(library: Library, section: T['section']) => library.items.filter((item): item is Extract<typeof item, T> => item.section === section) as unknown as T[]

describe('an empty project', () => {
  const library = libraryOf({ palette: null, board: null, memory: emptyMemory(), notes: {} })

  it('lists every section, in the order the founder meets them', () => {
    expect(library.sections.map((section) => section.id)).toEqual([...LIBRARY_SECTIONS])
  })

  it('holds only the logo, which is outstanding and made outside Droplet', () => {
    expect(library.items.map((item) => item.section)).toEqual(['logo'])
    expect(library.items[0]).toMatchObject({ status: 'outstanding', statusLabel: 'Made outside Droplet', file: null, actions: ['handoff', 'make_brief'] })
  })

  it('shows the logo as resolved, with its file, once one is brought back', () => {
    const logo = { kind: 'png' as const, name: 'kindred.png', size: 12, dataUrl: 'data:image/png;base64,AAAA', savedAt: '2026-10-15T09:00:00.000Z' }
    const withLogo = libraryOf({ palette: null, board: null, memory: emptyMemory(), notes: {}, logo })
    expect(withLogo.items[0]).toMatchObject({ section: 'logo', status: 'resolved', date: logo.savedAt, file: { name: 'kindred.png', kind: 'png' }, actions: ['handoff'] })
    expect((withLogo.items[0] as { statusLabel: string }).statusLabel).toMatch(/^Added /)
  })

  it('does not tell the composer about the logo file', () => {
    const logo = { kind: 'png' as const, name: 'kindred.png', size: 12, dataUrl: 'data:image/png;base64,AAAA', savedAt: '2026-10-15T09:00:00.000Z' }
    const snapshot = JSON.stringify(snapshotOfLibrary(libraryOf({ palette: null, board: null, memory: emptyMemory(), notes: {}, logo })))
    expect(snapshot).not.toMatch(/kindred\.png|base64/)
  })

  it('says what each empty section is for and offers to open the workspace that makes it', () => {
    const empty = (id: string) => library.sections.find((section) => section.id === id)!.empty
    expect(empty('brand')).toMatchObject({ action: 'open_brand', actionLabel: 'Build the brand' })
    expect(empty('ideas')).toMatchObject({ action: 'open_board' })
    expect(empty('invoices')).toMatchObject({ action: 'open_invoice' })
    for (const id of ['business', 'brand', 'ideas', 'invoices', 'clients', 'details']) expect(empty(id).text, id).not.toBe('')
  })
})

describe('a full project', () => {
  const memory = withIdea(withIdea(withInvoices(), 'name', 'Kindred Gifting', '2026-10-05T10:00:00.000Z'), 'offer', 'Curated corporate gift boxes', '2026-10-05T10:00:00.000Z')
  const library = libraryOf({
    palette: palette(),
    board: board(),
    memory: withFact(memory, 'brand.values', 'Warm, local, considered', '2026-10-05T11:00:00.000Z'),
    notes: { board: { index: [{}, {}], indexedAt: '2026-10-06T10:00:00.000Z', digest: { text: 'x' } } },
  })

  it('shows the business with its name, offer and the facts that are neither', () => {
    const [business] = itemsOf<BusinessItem>(library, 'business')
    expect(business).toMatchObject({ name: 'Kindred Gifting', offer: 'Curated corporate gift boxes', status: 'resolved', actions: ['change', 'forget'] })
    expect(business.facts).toEqual([{ key: 'brand.values', label: 'Brand values', value: 'Warm, local, considered' }])
  })

  it('shows the palette with its colours, the text-on-background contrast worked out in code, and its actions', () => {
    const [brand] = itemsOf<BrandItem>(library, 'brand')
    expect(brand.swatches.map((swatch) => swatch.hex)).toEqual(['#0E1A2B', '#F4F8FB', '#0B4F8A'])
    expect(brand.contrast).toMatchObject({ text: '#0E1A2B', background: '#F4F8FB', passes: true, verdict: 'Passes AAA' })
    expect(brand.contrast.ratio).toBe('16.4:1')
    expect(brand.actions).toEqual(['open', 'export', 'copy_hex'])
    expect(brand.exportedAt).toBeNull()
  })

  it('says plainly when the palette fails contrast', () => {
    const [brand] = itemsOf<BrandItem>(libraryOf({ palette: palette('#9CC9F0', '#F4F8FB'), board: null, memory: emptyMemory(), notes: {} }), 'brand')
    expect(brand.contrast).toMatchObject({ passes: false, verdict: 'Fails AA' })
  })

  it('shows the board with what is on it', () => {
    const [ideas] = itemsOf<IdeasItem>(library, 'ideas')
    expect(ideas).toMatchObject({ notes: 2, frames: 1, other: 0, actions: ['open', 'export_png', 'export_pdf'] })
  })

  it('has no ideas for a board with nothing on it', () => {
    expect(itemsOf<IdeasItem>(libraryOf({ palette: null, board: { ...board(), items: [] }, memory: emptyMemory(), notes: {} }), 'ideas')).toEqual([])
  })

  it('lists the invoices newest first with their number, client and total worked out from the lines', () => {
    const invoices = itemsOf<InvoiceItem>(library, 'invoices')
    expect(invoices.map((invoice) => invoice.number)).toEqual(['INV-0002', 'INV-0001'])
    expect(invoices[0]).toMatchObject({ client: 'Pretoria Print Works', kind: 'invoice', ready: true, actions: ['open', 'copy', 'export', 'forget'] })
    // 12 boxes at R450, not registered for VAT.
    expect(invoices[0].total.replace(/\s/g, ' ')).toContain('5')
    expect(invoices[0].total).toMatch(/5.?400/)
  })

  it('shows the clients and whether their address is filled in', () => {
    const [saved] = library.items.filter((item) => item.section === 'clients')
    expect(saved).toMatchObject({ title: 'Pretoria Print Works', statusLabel: 'Address filled in', actions: ['new_invoice', 'forget'] })
  })

  it('shows which business details are filled in and never what they say', () => {
    const [details] = itemsOf<DetailsItem>(library, 'details')
    expect(details.filled).toEqual([
      { label: 'Address', filled: true },
      { label: 'Email or phone', filled: true },
      { label: 'VAT number', filled: false },
      { label: 'Bank details', filled: true },
    ])
    expect(JSON.stringify(details)).not.toContain('Jacaranda')
    expect(JSON.stringify(details)).not.toContain('1234567890')
  })

  it('summarises the notes by workspace', () => {
    const notes = library.items.find((item) => item.section === 'notes')
    expect(notes).toMatchObject({ workspaces: [{ id: 'board', title: 'Business idea board', lines: 2, digest: true }] })
  })

  it('has an item id that is the same each time for the same thing', () => {
    const again = libraryOf({ palette: palette(), board: board(), memory: withInvoices(), notes: {} })
    expect(again.items.filter((item) => item.section === 'invoices').map((item) => item.id)).toEqual(['invoice:i2', 'invoice:i1'])
  })
})

describe('where an invoice stands', () => {
  const statusOf = (memory: ProjectMemory) => itemsOf<InvoiceItem>(libraryOf({ palette: null, board: null, memory, notes: {} }), 'invoices')[0]

  it('is not exported yet until it has been exported, and outstanding until then', () => {
    expect(statusOf(withInvoices())).toMatchObject({ statusLabel: 'Not exported yet', status: 'outstanding', changedSinceExport: false })
  })

  it('is exported on the date, and resolved, once it has been', () => {
    const exported = markExported(withInvoices(), 'i2', '2026-10-04T12:00:00.000Z')
    expect(statusOf(exported)).toMatchObject({ statusLabel: 'Exported 4 Oct', status: 'resolved', exportedAt: '2026-10-04T12:00:00.000Z' })
  })

  it('has changed since export when it was confirmed again afterwards, and is outstanding again', () => {
    const exported = markExported(withInvoices(), 'i2', '2026-10-04T12:00:00.000Z')
    const changed = withInvoice(exported, 'i2', { ...complete('INV-0002'), lines: [{ id: 1, description: 'Gift boxes', quantity: 14, unitCents: 45_000 }] }, '2026-10-05T12:00:00.000Z')
    expect(statusOf(changed)).toMatchObject({ statusLabel: 'Changed since export', status: 'outstanding', changedSinceExport: true })
  })

  it('is not ready to export while a required detail is missing', () => {
    const missing = withInvoice(emptyMemory(), 'i9', { ...complete('INV-0009'), client: emptyClient() }, '2026-10-05T12:00:00.000Z')
    expect(statusOf(missing).ready).toBe(false)
  })

  it('is a quote when it says so', () => {
    const quote = withInvoice(emptyMemory(), 'q1', { ...complete('Q-0001'), details: { ...complete('Q-0001').details, kind: 'quote' } }, '2026-10-05T12:00:00.000Z')
    expect(statusOf(quote).title).toBe('Quote Q-0001')
  })
})

describe('finding an invoice by what the founder calls it', () => {
  const invoices = [
    { number: 'INV-0003', client: 'Pretoria Print Works' },
    { number: 'INV-0002', client: 'Bloem Bakery' },
    { number: 'INV-0001', client: 'Pretoria Print Works' },
  ]
  it('takes the last, latest or newest as the first in the list, and the first or oldest as the last', () => {
    expect(findInvoice(invoices, 'the last invoice')?.number).toBe('INV-0003')
    expect(findInvoice(invoices, undefined)?.number).toBe('INV-0003')
    expect(findInvoice(invoices, 'latest')?.number).toBe('INV-0003')
    expect(findInvoice(invoices, 'the oldest one')?.number).toBe('INV-0001')
  })
  it('finds a number however it is written', () => {
    expect(findInvoice(invoices, 'inv-0002')?.number).toBe('INV-0002')
    expect(findInvoice(invoices, 'INV 0002')?.number).toBe('INV-0002')
  })
  it('finds a client by name, and their latest if they have several', () => {
    expect(findInvoice(invoices, 'Bloem Bakery')?.number).toBe('INV-0002')
    expect(findInvoice(invoices, 'pretoria print works')?.number).toBe('INV-0003')
  })
  it('finds nothing for what is not there, or for an empty list', () => {
    expect(findInvoice(invoices, 'INV-0099')).toBeNull()
    expect(findInvoice([], 'last')).toBeNull()
  })
})

describe('what the composer is told', () => {
  it('is counts, names and statuses, with no amount, address, contact or bank detail', () => {
    const library = libraryOf({ palette: palette(), board: board(), memory: markExported(withInvoices(), 'i1', '2026-10-04T12:00:00.000Z'), notes: {} })
    const snapshot = snapshotOfLibrary(library)
    expect(snapshot).toEqual({
      brand: true,
      ideas: { notes: 2, frames: 1 },
      invoices: [
        { number: 'INV-0002', client: 'Pretoria Print Works', status: 'Not exported yet', ready: true },
        { number: 'INV-0001', client: 'Pretoria Print Works', status: 'Exported 4 Oct', ready: true },
      ],
    })
    const text = JSON.stringify(snapshot)
    for (const secret of ['Jacaranda', 'Church Square', '1234567890', 'hello@kindred', 'Capitec', '5400', 'Gift boxes']) expect(text).not.toContain(secret)
  })

  it('says nothing is saved for an empty project', () => {
    expect(snapshotOfLibrary(libraryOf({ palette: null, board: null, memory: emptyMemory(), notes: {} }))).toEqual({ brand: false, ideas: null, invoices: [] })
  })
})

describe('the palettes the founder named', () => {
  const named = (id: string, name: string, savedAt: string, hex = '#B5543A') => ({ id, name, savedAt, blocks: [{ id: 1, hex: '#0E1A2B', role: 'text' as const }, { id: 2, hex: '#F4F8FB', role: 'background' as const }, { id: 3, hex, role: 'primary' as const }] })
  const withNamed = (): PaletteSave => ({ ...palette(), palettes: [named('a', 'Spring', '2026-10-06T09:00:00.000Z'), named('b', 'Summer', '2026-10-08T09:00:00.000Z', '#F0A030')] })

  it('lists them under the working palette, newest first, each with Open and Forget', () => {
    const items = itemsOf<BrandItem>(libraryOf({ palette: withNamed(), board: null, memory: emptyMemory(), notes: {} }), 'brand')
    expect(items.map((item) => item.title)).toEqual(['Colour palette', 'Summer', 'Spring'])
    expect(items[0].paletteId).toBeUndefined()
    expect(items[0].actions).toEqual(['open', 'export', 'copy_hex'])
    expect(items[1]).toMatchObject({ id: 'palette:b', paletteId: 'b', actions: ['open', 'forget'], status: 'resolved', statusLabel: 'Kept 8 October 2026' })
    expect(items[1].swatches.map((swatch) => swatch.hex)).toEqual(['#0E1A2B', '#F4F8FB', '#F0A030'])
    expect(items[1].contrast).toMatchObject({ passes: true })
  })

  it('has none to list for a palette saved before they existed', () => {
    expect(itemsOf<BrandItem>(libraryOf({ palette: palette(), board: null, memory: emptyMemory(), notes: {} }), 'brand')).toHaveLength(1)
  })

  it('does not change what the composer is told about the library', () => {
    expect(snapshotOfLibrary(libraryOf({ palette: withNamed(), board: null, memory: emptyMemory(), notes: {} }))).toEqual({ brand: true, ideas: null, invoices: [] })
  })
})
