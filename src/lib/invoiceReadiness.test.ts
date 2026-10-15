import { describe, expect, it } from 'vitest'
import { newContent, type InvoiceContent } from './invoice.ts'
import { GUIDE_STEPS } from './invoiceGuide.ts'
import { checkInvoice, partsDone, vatNumberIsValid } from './invoiceReadiness.ts'

// A plain invoice that has everything it needs.
const ready = (): InvoiceContent => {
  const content = newContent('2026-10-04', 'INV-0007')
  content.business = {
    ...content.business,
    name: 'Kindred Gifting',
    address: '12 Jacaranda Street, Pretoria East',
    email: 'hello@kindred.example',
    accountNumber: '62000000000',
  }
  content.client = { ...content.client, name: 'Pretoria Print Works', address: '5 Church Square' }
  content.lines = [{ id: 1, description: 'Gift box', quantity: 2, unitCents: 45000 }]
  return content
}
const ids = (content: InvoiceContent) => checkInvoice(content).required.map((issue) => issue.id)

describe('checkInvoice', () => {
  it('is ready when everything is there, with nothing to suggest', () => {
    expect(checkInvoice(ready())).toEqual({ ready: true, required: [], recommended: [] })
  })

  it('names everything a new invoice still needs, in the order it is read', () => {
    const result = checkInvoice(newContent('2026-10-04'))
    expect(result.ready).toBe(false)
    expect(result.required.map((issue) => issue.id)).toEqual(['business-name', 'client-name', 'lines'])
    expect(result.required.map((issue) => issue.fix)).toEqual(['business', 'client', 'lines'])
    expect(result.recommended.map((issue) => issue.id)).toEqual(['business-address', 'contact', 'bank', 'client-address'])
  })

  it('needs a number, a date and a due date', () => {
    const content = ready()
    content.details = { ...content.details, number: ' ', issueDate: '', terms: 'custom', customDueDate: '' }
    expect(ids(content)).toEqual(['number', 'date', 'due'])
  })

  it('needs a number that no other invoice has, and says which', () => {
    expect(ids(ready())).toEqual([])
    const result = checkInvoice(ready(), { usedNumbers: ['INV-0006', 'INV-0007'] })
    expect(result.required.map((issue) => issue.id)).toEqual(['number'])
    expect(result.required[0]).toMatchObject({ text: 'The number INV-0007 is already used by another invoice.', fix: 'terms' })
    expect(checkInvoice(ready(), { usedNumbers: ['INV-0006'] }).ready).toBe(true)
  })

  it('asks a business registered for VAT for its VAT number and address, and checks the number', () => {
    const content = { ...ready(), vatRegistered: true }
    content.business = { ...content.business, address: '' }
    expect(ids(content)).toEqual(['vat-number', 'business-address'])
    content.business = { ...content.business, vatNumber: '12345' }
    expect(checkInvoice(content).required[0].text).toBe('Your VAT number should be ten digits.')
    content.business = { ...content.business, vatNumber: '4123 456 789', address: '12 Jacaranda Street' }
    expect(ids(content)).toEqual([])
  })

  it('does not ask a business that is not registered for a VAT number, and only suggests an address', () => {
    const content = ready()
    content.business = { ...content.business, address: '' }
    expect(ids(content)).toEqual([])
    expect(checkInvoice(content).recommended.map((issue) => issue.id)).toEqual(['business-address'])
  })

  it("needs the client's address on a tax invoice for more than R 5 000, and only suggests it below that", () => {
    const big = { ...ready(), vatRegistered: true }
    big.business = { ...big.business, vatNumber: '4123456789' }
    big.client = { ...big.client, address: '' }
    big.lines = [{ id: 1, description: 'Gift boxes', quantity: 12, unitCents: 45000 }]
    expect(ids(big)).toEqual(['client-address'])
    expect(checkInvoice(big).required[0].text).toBe("Add the client's address. A tax invoice for more than R 5 000 must show it.")
    big.lines = [{ id: 1, description: 'Gift box', quantity: 1, unitCents: 45000 }]
    expect(ids(big)).toEqual([])
    expect(checkInvoice(big).recommended.map((issue) => issue.id)).toContain('client-address')
  })

  it('counts the VAT in what makes a tax invoice large', () => {
    const content = { ...ready(), vatRegistered: true }
    content.business = { ...content.business, vatNumber: '4123456789' }
    content.client = { ...content.client, address: '' }
    // R 4 500 before VAT is R 5 175 with it
    content.lines = [{ id: 1, description: 'Boxes', quantity: 10, unitCents: 45000 }]
    expect(ids(content)).toEqual(['client-address'])
  })

  it('names each begun line that is missing something, by its number, and ignores a blank one', () => {
    const content = ready()
    content.lines = [
      { id: 1, description: 'Gift box', quantity: 2, unitCents: 45000 },
      { id: 2, description: '', quantity: 1, unitCents: null },
      { id: 3, description: 'Insert', quantity: 12, unitCents: null },
      { id: 4, description: '', quantity: 1, unitCents: 3500 },
    ]
    const issues = checkInvoice(content).required
    expect(issues.map((issue) => issue.text)).toEqual(['Line 3 needs a price.', 'Line 4 needs a description.'])
    expect(issues.every((issue) => issue.fix === 'lines')).toBe(true)
  })

  it('says so when the lines add up to nothing', () => {
    const content = ready()
    content.lines = [{ id: 1, description: 'Free sample', quantity: 1, unitCents: 0 }]
    expect(ids(content)).toEqual(['total'])
  })

  it('every fix points at one of the six parts of the invoice', () => {
    const everything = checkInvoice({ ...newContent('2026-10-04'), vatRegistered: true })
    for (const issue of [...everything.required, ...everything.recommended]) expect(GUIDE_STEPS).toContain(issue.fix)
  })

  it('recognises a VAT number of ten digits, with spaces allowed', () => {
    expect(vatNumberIsValid('4123456789')).toBe(true)
    expect(vatNumberIsValid('4123 456 789')).toBe(true)
    for (const value of ['', '412345678', '41234567890', 'A123456789']) expect(vatNumberIsValid(value)).toBe(false)
  })
})

describe('partsDone', () => {
  const done = (content: InvoiceContent) => partsDone(checkInvoice(content))

  it('has every part done when the invoice is ready', () => {
    expect(done(ready())).toEqual({ business: true, vat: true, client: true, lines: true, terms: true, review: true })
  })

  it('leaves the business, client, items and review open on a new invoice, which already has its details and no VAT settled', () => {
    expect(done(newContent('2026-10-04', 'INV-0001'))).toEqual({ business: false, vat: true, client: false, lines: false, terms: true, review: false })
  })

  it('takes the tick from the terms when the number is gone, or is one another invoice has', () => {
    const content = ready()
    content.details = { ...content.details, number: '' }
    expect(done(content).terms).toBe(false)
    const used = partsDone(checkInvoice(ready(), { usedNumbers: ['INV-0007'] }))
    expect(used.terms).toBe(false)
    expect(used.review).toBe(false)
  })

  it('holds the VAT and business parts back until a business registered for VAT gives its number and address', () => {
    const content = ready()
    content.vatRegistered = true
    content.business = { ...content.business, address: '', vatNumber: '' }
    expect(done(content)).toMatchObject({ vat: false, business: false, review: false })
    content.business = { ...content.business, address: '12 Jacaranda Street', vatNumber: '4123456789' }
    expect(done(content)).toMatchObject({ vat: true, business: true })
  })

  it('holds the items back while a line is begun but not whole, or adds up to nothing', () => {
    const content = ready()
    content.lines = [{ id: 1, description: 'Gift box', quantity: 2, unitCents: null }]
    expect(done(content).lines).toBe(false)
    content.lines = [{ id: 1, description: 'Gift box', quantity: 2, unitCents: 0 }]
    expect(done(content).lines).toBe(false)
  })

  it('never lets a recommended item hold a part back', () => {
    const content = ready()
    content.business = { ...content.business, email: '', phone: '', accountNumber: '' }
    expect(checkInvoice(content).recommended.length).toBeGreaterThan(0)
    expect(done(content)).toMatchObject({ business: true, review: true })
  })
})
