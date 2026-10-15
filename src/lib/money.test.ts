import { describe, expect, it } from 'vitest'
import { MAX_CENTS, VAT_RATE_BP, centsToField, formatRand, parseMoney, percentLabel, vatOf } from './money.ts'

describe('parseMoney', () => {
  it.each([
    ['450', 45000],
    ['450.5', 45050],
    ['450,50', 45050],
    ['0.99', 99],
    ['12.3', 1230],
    ['R450', 45000],
    ['R 1 234,50', 123450],
    ['R 1 234,50', 123450],
    ['1,234.50', 123450],
    ['1.234,50', 123450],
    ['1,234', 123400],
    ['1.234', 123400],
    ['1,234,567', 123456700],
    ['1000000000', MAX_CENTS],
    ['', null],
    [' ', null],
    ['R', null],
    ['abc', null],
    ['-5', null],
    ['12abc', null],
    ['1.2.3,4', null],
    ['1,23,45', null],
    ['.5', null],
    ['1.234,567', null],
    ['1000000000.01', null],
  ])('parses %j into %s', (input, expected) => {
    expect(parseMoney(input)).toBe(expected)
  })
})

describe('formatting', () => {
  it.each([
    [123456, 'R 1 234,56'],
    [0, 'R 0,00'],
  ])('formats %i as %s', (cents, expected) => {
    expect(formatRand(cents).replace(/\s/g, ' ')).toBe(expected)
  })

  it.each([
    [45000, '450.00'],
    [5, '0.05'],
  ])('converts %i cents to field value %s', (cents, expected) => {
    expect(centsToField(cents)).toBe(expected)
  })

  it.each([0, 5, 99, 45000, 123456, 99999999])('round-trips %i cents through field', (cents) => {
    expect(parseMoney(centsToField(cents))).toBe(cents)
  })
})

describe('vatOf', () => {
  it.each([
    [100000, undefined, 15000],
    [0, undefined, 0],
    [3, undefined, 0],
    [4, undefined, 1],
    [10, undefined, 2],
    [70, undefined, 11],
    [10000, 1000, 1000],
  ])('calculates vat for %i cents (rate: %s) -> %i', (amount, rate, expected) => {
    expect(vatOf(amount, rate)).toBe(expected)
  })

  it('exposes VAT rate and label', () => {
    expect(VAT_RATE_BP).toBe(1500)
    expect(percentLabel(1500)).toBe('15%')
  })
})
