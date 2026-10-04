import { describe, expect, it } from 'vitest'
import {
  TERMS,
  addDays,
  computeTotals,
  dueDateOf,
  emptyLine,
  formatDate,
  isIsoDate,
  lineAmount,
  lineIsBlank,
  lineProblems,
  newContent,
  nextLineId,
  nextNumber,
  quantityIsValid,
  todayIso,
  type Line,
} from './invoice.ts'

const line = (over: Partial<Line> = {}): Line => ({ id: 1, description: 'Gift box', quantity: 2, unitCents: 45000, ...over })

describe('dates', () => {
  it('knows a real date from one that is not', () => {
    expect(isIsoDate('2026-10-04')).toBe(true)
    expect(isIsoDate('2028-02-29')).toBe(true)
    for (const text of ['', '2026-13-01', '2026-02-30', '2027-02-29', '04/10/2026', '2026-1-1']) expect(isIsoDate(text)).toBe(false)
  })

  it('adds days across months, years and a leap day', () => {
    expect(addDays('2026-10-04', 14)).toBe('2026-10-18')
    expect(addDays('2026-10-25', 14)).toBe('2026-11-08')
    expect(addDays('2026-12-25', 14)).toBe('2027-01-08')
    expect(addDays('2028-02-20', 10)).toBe('2028-03-01')
    expect(addDays('2026-10-04', 0)).toBe('2026-10-04')
  })

  it('gives today as a plain date', () => {
    expect(todayIso(new Date(2026, 9, 4, 23, 59))).toBe('2026-10-04')
    expect(todayIso(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('works out when payment is due from the terms', () => {
    const details = { ...newContent('2026-10-04').details }
    expect(dueDateOf(details)).toBe('2026-10-18')
    expect(dueDateOf({ ...details, terms: 'on_receipt' })).toBe('2026-10-04')
    expect(dueDateOf({ ...details, terms: '30' })).toBe('2026-11-03')
    expect(dueDateOf({ ...details, terms: 'custom', customDueDate: '2026-12-01' })).toBe('2026-12-01')
  })

  it('has no due date when it cannot be worked out', () => {
    const details = newContent('2026-10-04').details
    expect(dueDateOf({ ...details, issueDate: '' })).toBeNull()
    expect(dueDateOf({ ...details, terms: 'custom', customDueDate: 'soon' })).toBeNull()
    expect(TERMS.map((terms) => terms.id)).toEqual(['on_receipt', '7', '14', '30', 'custom'])
  })

  it('says a date in words, and leaves what is not a date alone', () => {
    expect(formatDate('2026-10-04')).toBe('4 October 2026')
    expect(formatDate('2026-02-01')).toBe('1 February 2026')
    expect(formatDate('soon')).toBe('soon')
  })
})

describe('lines', () => {
  it('needs a description, a quantity of more than nothing and a price', () => {
    expect(lineProblems(line())).toEqual([])
    expect(lineProblems(line({ description: '  ' }))).toEqual(['description'])
    expect(lineProblems(line({ quantity: 0 }))).toEqual(['quantity'])
    expect(lineProblems(line({ unitCents: null }))).toEqual(['price'])
    expect(lineProblems(emptyLine(1))).toEqual(['description', 'price'])
    expect(lineProblems(line({ description: '', quantity: -1, unitCents: null }))).toEqual(['description', 'quantity', 'price'])
  })

  it('takes a quantity with up to two decimals', () => {
    expect(quantityIsValid(1)).toBe(true)
    expect(quantityIsValid(1.5)).toBe(true)
    expect(quantityIsValid(0.25)).toBe(true)
    for (const quantity of [0, -2, 1.234, NaN, Infinity]) expect(quantityIsValid(quantity)).toBe(false)
  })

  it('knows a blank line from one that is begun', () => {
    expect(lineIsBlank(emptyLine(1))).toBe(true)
    expect(lineIsBlank(line({ description: '', unitCents: null }))).toBe(true)
    expect(lineIsBlank(line({ unitCents: null }))).toBe(false)
  })

  it('works out the amount to the cent, or has none without a price', () => {
    expect(lineAmount(line())).toBe(90000)
    expect(lineAmount(line({ quantity: 1.5, unitCents: 45000 }))).toBe(67500)
    expect(lineAmount(line({ quantity: 0.1, unitCents: 3 }))).toBe(0)
    expect(lineAmount(line({ quantity: 3, unitCents: 3333 }))).toBe(9999)
    expect(lineAmount(line({ unitCents: null }))).toBeNull()
    expect(lineAmount(line({ quantity: 0 }))).toBeNull()
  })

  it('numbers the next line above every one there is', () => {
    expect(nextLineId([])).toBe(1)
    expect(nextLineId([line({ id: 4 }), line({ id: 2 })])).toBe(5)
  })
})

describe('computeTotals', () => {
  const lines: Line[] = [
    { id: 1, description: 'Gift box, small', quantity: 12, unitCents: 45000 },
    { id: 2, description: 'Printed card insert', quantity: 12, unitCents: 3500 },
    { id: 3, description: 'Delivery', quantity: 1, unitCents: 25000 },
  ]

  it('adds the lines and charges fifteen percent VAT for a business that is registered', () => {
    const totals = computeTotals(lines, true)
    expect(totals.subtotalCents).toBe(607000)
    expect(totals.vatCents).toBe(91050)
    expect(totals.totalCents).toBe(698050)
    expect(totals.amounts).toEqual({ 1: 540000, 2: 42000, 3: 25000 })
    expect(totals.unpriced).toBe(0)
  })

  it('charges no VAT for a business that is not registered', () => {
    const totals = computeTotals(lines, false)
    expect(totals.vatCents).toBeNull()
    expect(totals.totalCents).toBe(607000)
  })

  it('counts a line with no price as nothing, and says how many, but ignores a blank line', () => {
    const totals = computeTotals([...lines, line({ id: 4, unitCents: null }), emptyLine(5)], true)
    expect(totals.totalCents).toBe(698050)
    expect(totals.unpriced).toBe(1)
    expect(totals.amounts[4]).toBeNull()
  })

  it('has a total of nothing with no lines', () => {
    expect(computeTotals([], true)).toMatchObject({ subtotalCents: 0, vatCents: 0, totalCents: 0, unpriced: 0 })
  })

  it('keeps the total equal to the subtotal and the VAT, whatever the amounts', () => {
    for (let cents = 1; cents < 400; cents += 7) {
      const totals = computeTotals([line({ quantity: 1, unitCents: cents })], true)
      expect(totals.totalCents).toBe(totals.subtotalCents + totals.vatCents!)
    }
  })
})

describe('numbering', () => {
  it('goes up by one and keeps the number of digits', () => {
    expect(nextNumber('INV-0007')).toBe('INV-0008')
    expect(nextNumber('INV-0099')).toBe('INV-0100')
    expect(nextNumber('INV-9999')).toBe('INV-10000')
    expect(nextNumber('2026/12')).toBe('2026/13')
    expect(nextNumber('7')).toBe('8')
  })

  it('starts again when there is no number to go up from', () => {
    expect(nextNumber('')).toBe('INV-0001')
    expect(nextNumber('Kindred')).toBe('Kindred-0001')
  })
})

describe('a new invoice', () => {
  it('is dated today, due in 14 days, with one blank line and no VAT', () => {
    const content = newContent('2026-10-04')
    expect(content.details).toMatchObject({ kind: 'invoice', number: 'INV-0001', issueDate: '2026-10-04', terms: '14' })
    expect(content.lines).toHaveLength(1)
    expect(content.vatRegistered).toBe(false)
  })
})
