// Money is whole cents everywhere, never floating point, and every amount with one right answer is worked out here in code.

const rand = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' })

// 123456 becomes "R 1 234,56" (the exact spacing comes from the locale).
export const formatRand = (cents: number) => rand.format(cents / 100)

// 123456 becomes "1234.56", for putting in a field to be edited.
export const centsToField = (cents: number) => (cents / 100).toFixed(2)

// The most an amount can be, so a slip of the keyboard cannot make a number too large to show.
export const MAX_CENTS = 1_000_000_000_00

// What a person typed as an amount, as cents, or null if it is not an amount. It reads "450", "R450", "450.50", "450,50",
// "1 234,50" and "1,234.50". A single separator followed by exactly three digits is a thousands separator ("1,234"), and
// otherwise the last separator is the decimal point.
export function parseMoney(text: string): number | null {
  const cleaned = text.replace(/[Rr\s ]/g, '')
  if (cleaned === '' || !/^\d[\d.,]*$/.test(cleaned)) return null

  const separators = [...cleaned].filter((character) => character === '.' || character === ',')
  let whole = cleaned
  let fraction = ''
  if (separators.length > 0) {
    const last = Math.max(cleaned.lastIndexOf('.'), cleaned.lastIndexOf(','))
    const after = cleaned.slice(last + 1)
    const thousands = separators.length === 1 && after.length === 3
    const sameKind = separators.every((character) => character === cleaned[last])
    if (!thousands && !(separators.length > 1 && sameKind)) {
      whole = cleaned.slice(0, last)
      fraction = after
    }
  }
  // Whatever is left of the point is whole rand, either plain or grouped in threes ("1 234" is typed as "1,234" or "1.234").
  if (!/^\d+$/.test(whole) && !/^\d{1,3}([.,]\d{3})+$/.test(whole)) return null
  whole = whole.replace(/[.,]/g, '')
  if (fraction.length > 2 || !/^\d*$/.test(fraction)) return null
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(cents) && cents <= MAX_CENTS ? cents : null
}

// South African VAT is 15 percent. Rates are held in basis points (1500 is 15 percent) so the sums stay in whole numbers.
export const VAT_RATE_BP = 1500

// The VAT on an amount before VAT, rounded to the nearest cent (a half cent rounds up).
export const vatOf = (netCents: number, rateBp: number = VAT_RATE_BP) => Math.round((netCents * rateBp) / 10_000)

// Whole percent, for showing: 1500 becomes "15%".
export const percentLabel = (rateBp: number) => `${rateBp / 100}%`
