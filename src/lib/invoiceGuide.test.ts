import { newContent, type InvoiceContent } from './invoice.ts'
import { checkInvoice } from './invoiceReadiness.ts'
import { GUIDE_STEPS, advance, back, goTo, invoiceResultOf, invoiceResultSchema, jumpTo, progressFor, resultMessage, startGuide, stepBlockers, stepOfFix } from './invoiceGuide.ts'

const blank = (): InvoiceContent => newContent('2026-10-10', 'INV-0007')

const complete = (): InvoiceContent => {
  const content = blank()
  return {
    ...content,
    business: { ...content.business, name: 'Kindred Gifting', address: '12 Jacaranda Street, Pretoria', accountNumber: '123456789' },
    client: { ...content.client, name: 'Pretoria Print Works', address: '1 Church Street' },
    lines: [{ id: 1, description: 'Gift boxes', quantity: 12, unitCents: 45_000 }],
  }
}

describe('the invoice guide', () => {
  it('goes through the parts of an invoice in a fixed order and ends on the review', () => {
    expect(GUIDE_STEPS).toEqual(['business', 'vat', 'client', 'lines', 'terms', 'review'])
    expect(startGuide('a')).toEqual({ invoiceId: 'a', step: 'business', reached: 0 })
  })

  it('keeps the progress of the same invoice and starts again for another', () => {
    const progress = { invoiceId: 'a', step: 'client' as const, reached: 2 }
    expect(progressFor(progress, 'a')).toBe(progress)
    expect(progressFor(progress, 'b')).toEqual(startGuide('b'))
    expect(progressFor(null, 'b')).toEqual(startGuide('b'))
  })

  it('does not move on while something required of the step is missing, and names it', () => {
    const readiness = checkInvoice(blank())
    const { progress, blocked } = advance(startGuide('a'), readiness)
    expect(progress.step).toBe('business')
    expect(blocked.map((issue) => issue.id)).toEqual(['business-name'])
  })

  it('moves on once the step is complete, and remembers how far the founder got', () => {
    const readiness = checkInvoice(complete())
    let progress = startGuide('a')
    for (const step of GUIDE_STEPS.slice(1)) {
      progress = advance(progress, readiness).progress
      expect(progress.step).toBe(step)
    }
    expect(progress.reached).toBe(GUIDE_STEPS.length - 1)
    // The last step has nowhere further to go: finishing is the founder's confirm.
    expect(advance(progress, readiness).progress).toBe(progress)
  })

  it('holds the review back by everything that is required', () => {
    const readiness = checkInvoice(blank())
    expect(stepBlockers('review', readiness)).toEqual(readiness.required)
    expect(stepBlockers('terms', readiness)).toEqual([])
    expect(stepBlockers('client', readiness).map((issue) => issue.id)).toEqual(['client-name'])
  })

  it('goes back freely, and forward only as far as the founder got', () => {
    const progress = { invoiceId: 'a', step: 'client' as const, reached: 2 }
    expect(back(progress).step).toBe('vat')
    expect(back(startGuide('a')).step).toBe('business')
    expect(goTo(progress, 'business').step).toBe('business')
    expect(goTo({ ...progress, step: 'business' }, 'client').step).toBe('client')
    expect(goTo(progress, 'review')).toBe(progress)
  })

  it('goes straight to a step when something outside sends the founder there', () => {
    const progress = jumpTo(startGuide('a'), stepOfFix('lines'))
    expect(progress).toEqual({ invoiceId: 'a', step: 'lines', reached: 3 })
  })
})

describe('the finished invoice in the chat', () => {
  it('keeps the number, the client, the dates and the sums, and nothing private', () => {
    const result = invoiceResultOf('inv-1', complete())
    expect(result).toEqual({
      invoiceId: 'inv-1',
      title: 'Invoice',
      number: 'INV-0007',
      client: 'Pretoria Print Works',
      totalCents: 540_000,
      issueDate: '2026-10-10',
      dueDate: expect.any(String),
      lines: 1,
    })
    expect(invoiceResultSchema.parse(result)).toEqual(result)
    expect(JSON.stringify(result)).not.toMatch(/Jacaranda|Church|123456789/)
  })

  it('calls a VAT business’s invoice a tax invoice', () => {
    expect(invoiceResultOf('inv-1', { ...complete(), vatRegistered: true }).title).toBe('Tax invoice')
  })

  it('says it is finished, with no amount', () => {
    const text = resultMessage(invoiceResultOf('inv-1', complete()))
    expect(text).toBe('Invoice INV-0007 for Pretoria Print Works is finished and saved. Export the PDF from the card to share it, or tell me what to do next.')
    expect(text).not.toMatch(/R\s?\d/)
  })
})
