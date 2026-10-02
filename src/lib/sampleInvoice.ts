// The made-up invoice shown in the document preview. The details are samples, but the arithmetic is real:
// totals are computed here in whole cents, never left to the model and never to floating point.
export type SampleLine = { description: string; quantity: number; unitCents: number }

export const SAMPLE_BUSINESS = 'Kindred Gifting'
export const SAMPLE_CLIENT = 'Pretoria Print Works'
export const SAMPLE_VAT_RATE = 0.15

export const SAMPLE_LINES: SampleLine[] = [
  { description: 'Gift box, small', quantity: 12, unitCents: 45000 },
  { description: 'Printed card insert', quantity: 12, unitCents: 3500 },
  { description: 'Delivery, Pretoria East', quantity: 1, unitCents: 25000 },
]

export type InvoiceTotals = {
  lines: (SampleLine & { amountCents: number })[]
  subtotalCents: number
  vatCents: number
  totalCents: number
}

export function invoiceTotals(lines: SampleLine[], vatRate: number): InvoiceTotals {
  const priced = lines.map((line) => ({ ...line, amountCents: line.quantity * line.unitCents }))
  const subtotalCents = priced.reduce((sum, line) => sum + line.amountCents, 0)
  const vatCents = Math.round(subtotalCents * vatRate)
  return { lines: priced, subtotalCents, vatCents, totalCents: subtotalCents + vatCents }
}

const rand = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' })

// 123456 becomes "R 1 234,56" (the exact spacing comes from the locale).
export const formatRand = (cents: number) => rand.format(cents / 100)
