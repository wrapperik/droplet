import {
  contrastLevel,
  contrastRatio,
  hexToRgb,
  hsvToRgb,
  normaliseHex,
  rgbToHex,
  readableTextColour,
  rgbToHsv,
  shiftHue,
} from './colour.ts'

describe('normaliseHex', () => {
  it('accepts short and long forms, with or without the hash', () => {
    expect(normaliseHex('#abc')).toBe('#AABBCC')
    expect(normaliseHex('1f8fe0')).toBe('#1F8FE0')
    expect(normaliseHex('  #0E1A2B ')).toBe('#0E1A2B')
  })

  it('rejects anything else', () => {
    expect(normaliseHex('')).toBeNull()
    expect(normaliseHex('#12')).toBeNull()
    expect(normaliseHex('#12345g')).toBeNull()
    expect(normaliseHex('#1234567')).toBeNull()
  })
})

describe('conversions', () => {
  it('round-trips hex through RGB', () => {
    expect(rgbToHex(hexToRgb('#1F8FE0'))).toBe('#1F8FE0')
  })

  it('round-trips hex through HSV', () => {
    for (const hex of ['#1F8FE0', '#B45309', '#15803D', '#0E1A2B', '#FFFFFF', '#000000']) {
      expect(rgbToHex(hsvToRgb(rgbToHsv(hexToRgb(hex))))).toBe(hex)
    }
  })

  it('maps pure hues correctly', () => {
    expect(rgbToHsv(hexToRgb('#FF0000')).h).toBe(0)
    expect(rgbToHsv(hexToRgb('#00FF00')).h).toBe(120)
    expect(rgbToHsv(hexToRgb('#0000FF')).h).toBe(240)
  })
})

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for identical colours', () => {
    expect(contrastRatio(hexToRgb('#000000'), hexToRgb('#FFFFFF'))).toBeCloseTo(21, 5)
    expect(contrastRatio(hexToRgb('#1F8FE0'), hexToRgb('#1F8FE0'))).toBeCloseTo(1, 5)
  })

  it('matches the ratios documented for the palette', () => {
    const white = hexToRgb('#FFFFFF')
    expect(contrastRatio(hexToRgb('#0E1A2B'), white)).toBeCloseTo(17.48, 1)
    expect(contrastRatio(hexToRgb('#0B4F8A'), white)).toBeCloseTo(8.4, 1)
    expect(contrastRatio(hexToRgb('#1F8FE0'), white)).toBeCloseTo(3.46, 1)
  })

  it('does not depend on argument order', () => {
    const a = hexToRgb('#B45309')
    const b = hexToRgb('#F4F8FB')
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 10)
  })
})

describe('contrastLevel', () => {
  it('uses the WCAG thresholds for body text', () => {
    expect(contrastLevel(7)).toBe('AAA')
    expect(contrastLevel(4.5)).toBe('AA')
    expect(contrastLevel(4.49)).toBe('fail')
  })
})

describe('readableTextColour', () => {
  it('picks white on dark colours and Ink on light colours', () => {
    expect(readableTextColour('#0B4F8A')).toBe('#FFFFFF')
    expect(readableTextColour('#0E1A2B')).toBe('#FFFFFF')
    expect(readableTextColour('#CFE9FB')).toBe('#0E1A2B')
    expect(readableTextColour('#FFFFFF')).toBe('#0E1A2B')
  })
})

describe('shiftHue', () => {
  it('rotates the hue and wraps around', () => {
    expect(shiftHue('#FF0000', 120)).toBe('#00FF00')
    expect(shiftHue('#FF0000', -120)).toBe('#0000FF')
    expect(shiftHue('#FF0000', 360)).toBe('#FF0000')
  })

  it('leaves greys alone', () => {
    expect(shiftHue('#808080', 90)).toBe('#808080')
  })
})
