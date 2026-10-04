import { describe, expect, it } from 'vitest'
import { emptyBusiness, emptyClient, newContent } from './invoice.ts'
import {
  businessStatus,
  clientStatus,
  emptyMemory,
  findClient,
  forgetBusiness,
  forgetClient,
  forgetInvoice,
  isRevisedSinceExport,
  latestDraft,
  markExported,
  nextInvoiceNumber,
  numbersInUse,
  savedInvoice,
  withBusiness,
  withClient,
  withInvoice,
} from './projectMemory.ts'

const business = { ...emptyBusiness(), name: 'Kindred Gifting', address: '12 Jacaranda Street' }
const client = { ...emptyClient(), name: 'Pretoria Print Works', address: '5 Church Square' }
const invoice = (number: string) => ({ ...newContent('2026-10-04', number), business, client })

describe('the business', () => {
  it('has nothing to confirm without a name, is new until remembered, and is the same once it is', () => {
    expect(businessStatus(emptyMemory(), emptyBusiness())).toBe('none')
    expect(businessStatus(emptyMemory(), business)).toBe('new')
    const remembered = withBusiness(emptyMemory(), business, '2026-10-04T10:00')
    expect(businessStatus(remembered, business)).toBe('same')
    expect(businessStatus(remembered, { ...business, email: 'hello@kindred.example' })).toBe('updated')
    expect(remembered.business?.confirmedAt).toBe('2026-10-04T10:00')
  })

  it('does not count spaces around what was typed as a change', () => {
    const remembered = withBusiness(emptyMemory(), business, 'x')
    expect(businessStatus(remembered, { ...business, name: ' Kindred Gifting ' })).toBe('same')
  })

  it('can be forgotten', () => {
    expect(forgetBusiness(withBusiness(emptyMemory(), business, 'x')).business).toBeNull()
  })
})

describe('clients', () => {
  it('are new until remembered, found by name without minding capitals or spaces, and the same once they are', () => {
    expect(clientStatus(emptyMemory(), emptyClient())).toBe('none')
    expect(clientStatus(emptyMemory(), client)).toBe('new')
    const remembered = withClient(emptyMemory(), client, 'x', 'c1')
    expect(clientStatus(remembered, client)).toBe('same')
    expect(clientStatus(remembered, { ...client, email: 'a@b.example' })).toBe('updated')
    expect(findClient(remembered, '  pretoria PRINT works ')?.id).toBe('c1')
    expect(findClient(remembered, '')).toBeUndefined()
    expect(findClient(remembered, 'Someone else')).toBeUndefined()
  })

  it('are never remembered twice: a client with a known name replaces what was remembered', () => {
    const once = withClient(emptyMemory(), client, 'a', 'c1')
    const twice = withClient(once, { ...client, email: 'a@b.example' }, 'b', 'c2')
    expect(twice.clients).toHaveLength(1)
    expect(twice.clients[0]).toMatchObject({ id: 'c1', confirmedAt: 'b', client: { email: 'a@b.example' } })
    expect(withClient(twice, { ...client, name: 'Thandi' }, 'c', 'c3').clients.map((saved) => saved.id)).toEqual(['c1', 'c3'])
  })

  it('can be forgotten one at a time', () => {
    const memory = withClient(withClient(emptyMemory(), client, 'x', 'c1'), { ...client, name: 'Thandi' }, 'x', 'c2')
    expect(forgetClient(memory, 'c1').clients.map((saved) => saved.id)).toEqual(['c2'])
    expect(forgetClient(memory, 'nope').clients).toHaveLength(2)
  })
})

describe('invoices', () => {
  it('are kept as confirmed, and a revision keeps the id and counts up', () => {
    const first = withInvoice(emptyMemory(), 'i1', invoice('INV-0001'), '2026-10-04T10:00')
    expect(savedInvoice(first, 'i1')).toMatchObject({ revision: 1, updatedAt: '2026-10-04T10:00' })
    const second = withInvoice(first, 'i1', { ...invoice('INV-0001'), vatRegistered: true }, '2026-10-05T09:00')
    expect(second.invoices).toHaveLength(1)
    expect(savedInvoice(second, 'i1')).toMatchObject({ revision: 2, updatedAt: '2026-10-05T09:00' })
    expect(savedInvoice(second, 'i1')?.content.details.number).toBe('INV-0001')
    expect(savedInvoice(second, 'i1')?.content.vatRegistered).toBe(true)
  })

  it('are marked exported, and are revised once they change after that', () => {
    const memory = withInvoice(emptyMemory(), 'i1', invoice('INV-0001'), '2026-10-04T10:00')
    const exported = markExported(memory, 'i1', '2026-10-04T11:00')
    expect(isRevisedSinceExport(savedInvoice(exported, 'i1')!)).toBe(false)
    const revised = withInvoice(exported, 'i1', { ...invoice('INV-0001'), vatRegistered: true }, '2026-10-05T09:00')
    expect(isRevisedSinceExport(savedInvoice(revised, 'i1')!)).toBe(true)
    expect(isRevisedSinceExport(savedInvoice(memory, 'i1')!)).toBe(false)
    expect(markExported(memory, 'ghost', 'x')).toBe(memory)
  })

  it('can be forgotten', () => {
    const memory = withInvoice(withInvoice(emptyMemory(), 'i1', invoice('INV-0001'), 'a'), 'i2', invoice('INV-0002'), 'b')
    expect(forgetInvoice(memory, 'i1').invoices.map((saved) => saved.id)).toEqual(['i2'])
  })

  it('pick up where the founder left off: the latest that has not been exported', () => {
    expect(latestDraft(emptyMemory())).toBeUndefined()
    let memory = withInvoice(emptyMemory(), 'i1', invoice('INV-0001'), '2026-10-01T10:00')
    memory = withInvoice(memory, 'i2', invoice('INV-0002'), '2026-10-02T10:00')
    memory = withInvoice(memory, 'i3', invoice('INV-0003'), '2026-10-03T10:00')
    expect(latestDraft(memory)?.id).toBe('i3')
    memory = markExported(memory, 'i3', '2026-10-03T11:00')
    expect(latestDraft(memory)?.id).toBe('i2')
    memory = markExported(markExported(memory, 'i2', 'x'), 'i1', 'x')
    expect(latestDraft(memory)).toBeUndefined()
  })
})

describe('numbering', () => {
  const memoryOf = (...numbers: string[]) =>
    numbers.reduce((memory, number, index) => withInvoice(memory, `i${index}`, invoice(number), `2026-10-0${index + 1}T10:00`), emptyMemory())

  it('starts at INV-0001', () => {
    expect(nextInvoiceNumber(emptyMemory())).toBe('INV-0001')
  })

  it('goes on from the highest number, keeping the founder\'s own style', () => {
    expect(nextInvoiceNumber(memoryOf('INV-0001'))).toBe('INV-0002')
    expect(nextInvoiceNumber(memoryOf('INV-0001', 'INV-0002', 'INV-0003'))).toBe('INV-0004')
    expect(nextInvoiceNumber(memoryOf('2026/12'))).toBe('2026/13')
  })

  it('goes on from the highest even when a lower one was confirmed last', () => {
    expect(nextInvoiceNumber(memoryOf('INV-0007', 'INV-0003'))).toBe('INV-0008')
  })

  it('is never a number that is already used, even in another style', () => {
    expect(nextInvoiceNumber(memoryOf('INV-0002', 'INV-0003', 'INV-0001'))).toBe('INV-0004')
    expect(nextInvoiceNumber(memoryOf('A-1', 'INV-0002'))).toBe('INV-0003')
  })

  it('lists the numbers in use by the other invoices', () => {
    const memory = memoryOf('INV-0001', 'INV-0002', '')
    expect(numbersInUse(memory)).toEqual(['INV-0001', 'INV-0002'])
    expect(numbersInUse(memory, 'i0')).toEqual(['INV-0002'])
  })
})
