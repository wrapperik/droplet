import { describe, expect, it } from 'vitest'
import { MAX_CENTS, VAT_RATE_BP, centsToField, formatRand, parseMoney, percentLabel, vatOf } from './money.ts'

describe('parseMoney', () => {
  it('reads whole and decimal amounts, with a point or a comma', () => {
    expect(parseMoney('450')).toBe(45000)
    expect(parseMoney('450.5')).toBe(45050)
    expect(parseMoney('450,50')).toBe(45050)
    expect(parseMoney('0.99')).toBe(99)
    expect(parseMoney('12.3')).toBe(1230)
  })

  it('ignores the currency sign and spaces, including the no-break space the locale uses', () => {
    expect(parseMoney('R450')).toBe(45000)
    expect(parseMoney('R 1 234,50')).toBe(123450)
    expect(parseMoney('R 1 234,50')).toBe(123450)
  })

  it('reads thousands separators', () => {
    expect(parseMoney('1,234.50')).toBe(123450)
    expect(parseMoney('1.234,50')).toBe(123450)
    expect(parseMoney('1,234')).toBe(123400)
    expect(parseMoney('1.234')).toBe(123400)
    expect(parseMoney('1,234,567')).toBe(123456700)
  })

  it('says nothing for what is not an amount', () => {
    for (const text of ['', ' ', 'R', 'abc', '-5', '12abc', '1.2.3,4', '1,23,45', '.5', '1.234,567']) expect(parseMoney(text)).toBeNull()
  })

  it('refuses an amount too large to be real', () => {
    expect(parseMoney('1000000000')).toBe(MAX_CENTS)
    expect(parseMoney('1000000000.01')).toBeNull()
  })
})

describe('formatting', () => {
  it('shows rand with the locale grouping and a comma for cents', () => {
    expect(formatRand(123456).replace(/\s/g, ' ')).toBe('R 1 234,56')
    expect(formatRand(0).replace(/\s/g, ' ')).toBe('R 0,00')
  })

  it('puts an amount in a field with two decimals', () => {
    expect(centsToField(45000)).toBe('450.00')
    expect(centsToField(5)).toBe('0.05')
  })

  it('round-trips an amount through a field', () => {
    for (const cents of [0, 5, 99, 45000, 123456, 99999999]) expect(parseMoney(centsToField(cents))).toBe(cents)
  })
})

describe('vatOf', () => {
  it('is fifteen percent of the amount, to the cent', () => {
    expect(VAT_RATE_BP).toBe(1500)
    expect(vatOf(100000)).toBe(15000)
    expect(vatOf(0)).toBe(0)
  })

  it('rounds a half cent up, and keeps small amounts exact', () => {
    expect(vatOf(3)).toBe(0)
    expect(vatOf(4)).toBe(1)
    expect(vatOf(10)).toBe(2)
    expect(vatOf(70)).toBe(11)
  })

  it('takes another rate', () => {
    expect(vatOf(10000, 1000)).toBe(1000)
  })

  it('labels a rate', () => {
    expect(percentLabel(1500)).toBe('15%')
  })
})
