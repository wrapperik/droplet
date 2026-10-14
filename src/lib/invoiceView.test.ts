import { describe, expect, it } from 'vitest'
import { newContent, type InvoiceContent } from './invoice.ts'
import { invoiceView, logoSlotOf, quantityText } from './invoiceView.ts'

const plain = (text: string) => text.replace(/[\s ]/g, ' ')

const complete = (): InvoiceContent => ({
  details: { kind: 'invoice', number: 'INV-0007', issueDate: '2026-10-04', terms: '14', customDueDate: '', notes: 'Thank you.' },
  business: {
    name: 'Kindred Gifting',
    address: '12 Jacaranda Street\nPretoria East',
    email: 'hello@kindred.example',
    phone: '082 000 0000',
    vatNumber: '4123456789',
    accountHolder: 'Kindred Gifting',
    bankName: 'FNB',
    accountNumber: '62000000000',
    branchCode: '250655',
  },
  client: { name: 'Pretoria Print Works', contact: 'Thandi', address: '5 Church Square\nPretoria', email: '', vatNumber: '', reference: 'PO 88' },
  lines: [
    { id: 1, description: 'Gift box, small', quantity: 12, unitCents: 45000 },
    { id: 2, description: 'Delivery', quantity: 1, unitCents: 25000 },
  ],
  vatRegistered: true,
})

describe('invoiceView', () => {
  it('reads a complete invoice in full', () => {
    const view = invoiceView(complete())
    expect(view.title).toBe('Tax invoice')
    expect(view.number.text).toBe('INV-0007')
    expect(view.issued.text).toBe('4 October 2026')
    expect(view.dueLabel).toBe('Due')
    expect(view.due.text).toBe('18 October 2026')
    expect(view.reference).toBe('PO 88')
    expect(view.from.map((part) => part.text)).toEqual(['Kindred Gifting', '12 Jacaranda Street', 'Pretoria East', 'hello@kindred.example', '082 000 0000', 'VAT number 4123456789'])
    expect(view.to.map((part) => part.text)).toEqual(['Pretoria Print Works', 'Thandi', '5 Church Square', 'Pretoria'])
    expect(view.lines).toHaveLength(2)
    expect(plain(view.lines[0].amount.text)).toBe('R 5 400,00')
    expect(plain(view.subtotal)).toBe('R 5 650,00')
    expect(view.vat?.label).toBe('VAT (15%)')
    expect(plain(view.vat!.amount)).toBe('R 847,50')
    expect(view.totalLabel).toBe('Total due')
    expect(plain(view.total)).toBe('R 6 497,50')
    expect(view.payment).toEqual(['Pay by EFT', 'Account holder: Kindred Gifting', 'Bank: FNB', 'Account number: 62000000000', 'Branch code: 250655', 'Reference: INV-0007'])
    expect(view.notes).toBe('Thank you.')
    expect(view.lines.every((line) => !line.incomplete)).toBe(true)
  })

  it('is a plain invoice with no VAT for a business that is not registered', () => {
    const view = invoiceView({ ...complete(), vatRegistered: false })
    expect(view.title).toBe('Invoice')
    expect(view.vat).toBeNull()
    expect(plain(view.total)).toBe('R 5 650,00')
  })

  it('is a quote with its own words', () => {
    const view = invoiceView({ ...complete(), details: { ...complete().details, kind: 'quote' } })
    expect(view.title).toBe('Quote')
    expect(view.dueLabel).toBe('Valid until')
    expect(view.totalLabel).toBe('Total')
  })

  it('shows placeholders, marked, for what is not filled in yet', () => {
    const view = invoiceView(newContent('2026-10-04'))
    expect(view.from[0]).toEqual({ text: 'Your business name', placeholder: true })
    expect(view.from[1]).toEqual({ text: 'Your address', placeholder: true })
    expect(view.to[0]).toEqual({ text: 'Client name', placeholder: true })
    expect(view.lines).toHaveLength(1)
    expect(view.lines[0].description.placeholder).toBe(true)
    expect(view.payment).toBeNull()
    expect(view.notes).toBeNull()
    expect(view.reference).toBeNull()
    expect(plain(view.total)).toBe('R 0,00')
  })

  it('shows placeholders for a missing date and number', () => {
    const view = invoiceView({ ...complete(), details: { ...complete().details, number: ' ', issueDate: '', terms: 'custom' } })
    expect(view.number).toEqual({ text: 'Number', placeholder: true })
    expect(view.issued).toEqual({ text: 'Date', placeholder: true })
    expect(view.due).toEqual({ text: 'Choose a date', placeholder: true })
  })

  it('leaves blank lines off the page, marks a line that is missing something, and shows the sum without it', () => {
    const content = complete()
    content.lines = [
      ...content.lines,
      { id: 3, description: 'Printed insert', quantity: 12, unitCents: null },
      { id: 4, description: '', quantity: 1, unitCents: null },
    ]
    const view = invoiceView(content)
    expect(view.lines.map((line) => line.description.text)).toEqual(['Gift box, small', 'Delivery', 'Printed insert'])
    expect(view.lines[2].incomplete).toBe(true)
    expect(view.lines[2].amount).toEqual({ text: '–', placeholder: true })
    expect(plain(view.total)).toBe('R 6 497,50')
  })

  it('names the invoice number in the payment reference, or says what it should be', () => {
    const view = invoiceView({ ...complete(), details: { ...complete().details, number: '' } })
    expect(view.payment?.at(-1)).toBe('Reference: the invoice number')
    const noBank = complete()
    noBank.business = { ...noBank.business, accountHolder: '', bankName: '', accountNumber: '', branchCode: '' }
    expect(invoiceView(noBank).payment).toBeNull()
  })

  it('writes a quantity without needless decimals', () => {
    expect(quantityText(12)).toBe('12')
    expect(quantityText(1.5)).toBe('1.5')
    expect(quantityText(0.25)).toBe('0.25')
  })
})

describe('the logo on the invoice', () => {
  const logo = { dataUrl: 'data:image/png;base64,AAAA' }

  it('is not on the view unless a caller gives it, so a caller that does not know draws nothing', () => {
    expect(invoiceView(complete()).logo).toBeNull()
  })

  it('carries the slot it is given, and nothing else on the view changes', () => {
    const slot = logoSlotOf(logo)
    expect(invoiceView(complete(), slot).logo).toEqual({ kind: 'added', src: logo.dataUrl, alt: 'Your logo' })
    expect({ ...invoiceView(complete(), slot), logo: null }).toEqual(invoiceView(complete()))
  })

  it('is the placeholder when the project has none, nothing while it is still being read, and the logo when there is one', () => {
    expect(logoSlotOf(undefined)).toBeNull()
    expect(logoSlotOf(null)).toEqual({ kind: 'outstanding' })
    expect(logoSlotOf(logo)?.kind).toBe('added')
  })

  it('leaves the placeholder out of a small copy of the page, which has no room for its note', () => {
    expect(logoSlotOf(null, false)).toBeNull()
    expect(logoSlotOf(logo, false)?.kind).toBe('added')
  })
})
