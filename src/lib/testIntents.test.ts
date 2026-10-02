import { isColourPaletteIntent } from './testIntents.ts'

describe('isColourPaletteIntent', () => {
  it('matches the phrase in either spelling and any case', () => {
    expect(isColourPaletteIntent('colour palette')).toBe(true)
    expect(isColourPaletteIntent('Help me with a Color Palette please')).toBe(true)
  })

  it('does not match unrelated text', () => {
    expect(isColourPaletteIntent('I need an invoice')).toBe(false)
    expect(isColourPaletteIntent('palette of colours')).toBe(false)
  })
})
