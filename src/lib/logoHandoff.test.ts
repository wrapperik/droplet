import { describe, expect, it } from 'vitest'
import { LOGO_FORMATS, LOGO_MAX_BYTES, LOGO_TOOLS, SUGGESTED_FONT_PAIRS, briefText, checkBriefWords, checkLogoContent, checkLogoFile, logoSpec, specColours, specFonts, specRows, specText } from './logoHandoff.ts'

const palette = { blocks: [{ hex: '#0e1a2b', role: 'text' as const }, { hex: '#f4f8fb', role: 'background' as const }, { hex: '#1f8fe0' }] }
const words = { does: 'Curated corporate gift boxes from local makers', feel: ['warm', 'trusted', 'local'], usedFor: 'Invoices and Instagram' }
const bytes = (...values: number[]) => new Uint8Array(values)
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]
const text = (value: string) => new TextEncoder().encode(value)

describe('the colours of the spec', () => {
  it('come from the saved palette, in order, in capitals, with the roles the founder gave them', () => {
    expect(specColours(palette)).toEqual([
      { hex: '#0E1A2B', role: 'text', roleLabel: 'Text' },
      { hex: '#F4F8FB', role: 'background', roleLabel: 'Background' },
      { hex: '#1F8FE0', role: null, roleLabel: null },
    ])
  })

  it('are none when no palette is saved', () => {
    expect(specColours(null)).toEqual([])
    expect(specRows(logoSpec({ palette: null })).find((row) => row.id === 'colours')?.value).toBe('No palette is saved yet.')
  })
})

describe('the fonts of the spec', () => {
  it('are the founder\'s own choice when they made one, whatever was proposed', () => {
    expect(specFonts('Poppins and Inter', ['Lobster'])).toEqual({ fonts: ['Poppins and Inter'], from: 'chosen' })
  })

  it('are the ones proposed (at most two) when the founder chose none', () => {
    expect(specFonts(undefined, ['Lato', 'Merriweather', 'Roboto'])).toEqual({ fonts: ['Lato', 'Merriweather'], from: 'suggested' })
    expect(specFonts('   ', ['  '])).toEqual({ fonts: [SUGGESTED_FONT_PAIRS[0].heading, SUGGESTED_FONT_PAIRS[0].body], from: 'suggested' })
  })

  it('say in the label that they are a suggestion', () => {
    const rows = specRows(logoSpec({ palette }))
    expect(rows.find((row) => row.id === 'fonts')?.label).toBe('Fonts (suggested)')
    expect(specRows(logoSpec({ palette, fontsFact: 'Poppins' })).find((row) => row.id === 'fonts')?.label).toBe('Fonts')
  })
})

describe('the spec rows and the brief text', () => {
  it('list the colours with their hex codes and then every file to ask for', () => {
    const rows = specRows(logoSpec({ palette }))
    expect(rows[0]).toMatchObject({ id: 'colours', value: 'Text #0E1A2B, Background #F4F8FB, #1F8FE0' })
    expect(rows.slice(2).map((row) => row.id)).toEqual(LOGO_FORMATS.map((format) => format.id))
    expect(rows.map((row) => row.value).join(' ')).toMatch(/Transparent PNG/)
  })

  it('put the hex codes of the saved palette in the brief, never the words\'', () => {
    const copy = briefText({ name: 'Kindred Gifting', words, spec: logoSpec({ palette }) })
    expect(copy).toContain('Logo brief for Kindred Gifting')
    expect(copy).toContain('Colours: Text #0E1A2B, Background #F4F8FB, #1F8FE0')
    expect(copy).toContain('The feel: warm, trusted, local')
    expect(copy).toContain('- Transparent PNG')
  })

  it('say so when there is no palette, and need no name', () => {
    const copy = briefText({ name: '', words, spec: logoSpec({ palette: null }) })
    expect(copy.split('\n')[0]).toBe('Logo brief')
    expect(copy).toContain('Colours: no palette saved yet')
  })

  it('make the spec text for the whole card', () => {
    expect(specText({ name: 'Kindred Gifting', spec: logoSpec({ palette }) })).toMatch(/^Logo spec for Kindred Gifting\nColours: Text #0E1A2B/)
  })
})

describe('the tools', () => {
  it('are free tools opened over https', () => {
    expect(LOGO_TOOLS.map((tool) => tool.name)).toEqual(['Canva', 'Adobe Express'])
    for (const tool of LOGO_TOOLS) expect(tool.url).toMatch(/^https:\/\//)
  })
})

describe('the words of a brief', () => {
  it('are accepted when they are plain words', () => {
    expect(checkBriefWords(words)).toEqual([])
  })

  it('may not carry a hex code, since the colours are the saved palette\'s', () => {
    expect(checkBriefWords({ ...words, does: 'Gift boxes in #FF0000' })[0]).toMatch(/leave hex codes out/)
    expect(checkBriefWords({ ...words, feel: ['#abc'] })[0]).toMatch(/brief\.feel/)
  })

  it('may not be a description in square brackets', () => {
    expect(checkBriefWords({ ...words, usedFor: '[Where the logo will be used]' })[0]).toMatch(/square brackets/)
  })

  it('may not carry a private detail', () => {
    expect(checkBriefWords({ ...words, does: 'Mail me at megan@kindred.example' })[0]).toMatch(/private detail/)
  })
})

describe('the file that comes back', () => {
  it('can be a PNG or an SVG, by its type or its name', () => {
    expect(checkLogoFile({ name: 'logo.png', type: 'image/png', size: 40_000 })).toEqual({ ok: true, kind: 'png' })
    expect(checkLogoFile({ name: 'logo.svg', type: 'image/svg+xml', size: 4_000 })).toEqual({ ok: true, kind: 'svg' })
    expect(checkLogoFile({ name: 'Logo.SVG', type: '', size: 4_000 })).toEqual({ ok: true, kind: 'svg' })
  })

  it('is refused with a reason when it is another kind of file', () => {
    const jpeg = checkLogoFile({ name: 'logo.jpg', type: 'image/jpeg', size: 40_000 })
    expect(jpeg.ok).toBe(false)
    expect(!jpeg.ok && jpeg.reason).toMatch(/not a PNG or an SVG/)
    expect(checkLogoFile({ name: 'logo.pdf', type: 'application/pdf', size: 10 }).ok).toBe(false)
  })

  it('is refused when it is empty or over the limit, and the reason gives the sizes', () => {
    const empty = checkLogoFile({ name: 'logo.png', type: 'image/png', size: 0 })
    expect(!empty.ok && empty.reason).toMatch(/empty/)
    const big = checkLogoFile({ name: 'logo.png', type: 'image/png', size: LOGO_MAX_BYTES + 1 })
    expect(!big.ok && big.reason).toMatch(/1\.0 MB.*limit is 1 MB/)
    expect(checkLogoFile({ name: 'logo.png', type: 'image/png', size: LOGO_MAX_BYTES }).ok).toBe(true)
  })

  it('must be a PNG inside, not just named like one', () => {
    expect(checkLogoContent('png', bytes(...PNG))).toEqual({ ok: true, kind: 'png' })
    const wrong = checkLogoContent('png', text('GIF89a not a png'))
    expect(!wrong.ok && wrong.reason).toMatch(/not one/)
  })

  it('must be an SVG inside, and carry no script', () => {
    expect(checkLogoContent('svg', text('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>')).ok).toBe(true)
    expect(checkLogoContent('svg', text('<html><body>hello</body></html>')).ok).toBe(false)
    const scripted = checkLogoContent('svg', text('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))
    expect(!scripted.ok && scripted.reason).toMatch(/script/)
    expect(checkLogoContent('svg', text('<svg onload="alert(1)"></svg>')).ok).toBe(false)
  })
})
