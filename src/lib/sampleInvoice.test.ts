import { SAMPLE_LINES, SAMPLE_VAT_RATE, formatRand, invoiceTotals } from './sampleInvoice.ts'

describe('invoiceTotals', () => {
  it('multiplies each line and adds them up', () => {
    const totals = invoiceTotals(SAMPLE_LINES, SAMPLE_VAT_RATE)
    expect(totals.lines.map((line) => line.amountCents)).toEqual([540000, 42000, 25000])
    expect(totals.subtotalCents).toBe(607000)
  })

  it('adds VAT in whole cents', () => {
    const totals = invoiceTotals(SAMPLE_LINES, SAMPLE_VAT_RATE)
    expect(totals.vatCents).toBe(91050)
    expect(totals.totalCents).toBe(698050)
    expect(invoiceTotals([{ description: 'x', quantity: 1, unitCents: 333 }], 0.15).vatCents).toBe(50)
  })

  it('handles an empty invoice', () => {
    expect(invoiceTotals([], 0.15)).toMatchObject({ subtotalCents: 0, vatCents: 0, totalCents: 0 })
  })
})

describe('formatRand', () => {
  it('shows rands and cents', () => {
    const text = formatRand(698050).replace(/\s/g, ' ')
    expect(text).toContain('6')
    expect(text).toContain('980')
    expect(text).toContain('50')
    expect(text.startsWith('R')).toBe(true)
  })
})
