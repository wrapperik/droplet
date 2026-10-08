import { containsPrivateDetail, factFits, factLabel, factText, FACT_GROUPS, FACT_INFO, FACT_KEYS, MAX_FACT_LENGTH } from './facts.ts'

describe('the facts', () => {
  it('have a label and one of three groups for every key, and no key without', () => {
    expect(FACT_KEYS).toHaveLength(12)
    for (const key of FACT_KEYS) {
      expect(FACT_GROUPS).toContain(FACT_INFO[key].group)
      expect(factLabel(key).length).toBeGreaterThan(2)
    }
    expect(Object.keys(FACT_INFO).sort()).toEqual([...FACT_KEYS].sort())
  })

  it('use British English and no em dashes in what the founder reads', () => {
    for (const key of FACT_KEYS) expect(`${FACT_INFO[key].label} ${FACT_INFO[key].hint}`).not.toMatch(/—|–|\bcolor\b/)
  })
})

describe('private details', () => {
  it.each([
    'Email me on megan@kindred.co.za',
    'Call 082 555 1234 for orders',
    'Phone +27 12 345 6789',
    'We are at 12 Long Street',
    '14 Church Square',
    'my account number is 1234',
    'IBAN ZA12 3456',
    'Our address is in Brooklyn',
    'my email is on the website',
  ])('are found in "%s"', (text) => {
    expect(containsPrivateDetail(text)).toBe(true)
  })

  it.each([
    'Corporate clients in Pretoria',
    'Builds full-stack software for SMEs',
    'Playful, warm and honest',
    'Selling to 12 friends and 3 offices',
    'Prices start at R450 a box',
    'Short answers, no jargon',
    'Working from home in Pretoria East',
  ])('are not found in "%s"', (text) => {
    expect(containsPrivateDetail(text)).toBe(false)
  })
})

describe('what can be kept as a fact', () => {
  it('is some words, tidied onto one line, of at most a fact\'s length, with no private detail', () => {
    expect(factText('  Corporate \n clients ')).toBe('Corporate clients')
    expect(factFits('Corporate clients')).toBe(true)
    expect(factFits('   ')).toBe(false)
    expect(factFits('x'.repeat(MAX_FACT_LENGTH))).toBe(true)
    expect(factFits('x'.repeat(MAX_FACT_LENGTH + 1))).toBe(false)
    expect(factFits('write to me at a@b.co')).toBe(false)
  })
})
