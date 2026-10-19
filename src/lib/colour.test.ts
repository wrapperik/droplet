import { describe, expect, it } from 'vitest'
import {
  contrastLevel,
  contrastRatio,
  hexToRgb,
  hsvToRgb,
  mixHex,
  normaliseHex,
  rgbToHex,
  readableTextColour,
  rgbToHsv,
  shiftHue,
} from './colour.ts'

describe('normaliseHex', () => {
  it.each([
    ['#abc', '#AABBCC'],
    ['1f8fe0', '#1F8FE0'],
    ['  #0E1A2B ', '#0E1A2B'],
    ['', null],
    ['#12', null],
    ['#12345g', null],
    ['#1234567', null],
  ])('normalises %j to %s', (input, expected) => {
    expect(normaliseHex(input)).toBe(expected)
  })
})

describe('conversions', () => {
  it.each(['#1F8FE0', '#B45309', '#15803D', '#0E1A2B', '#FFFFFF', '#000000'])(
    'round-trips %s through RGB and HSV',
    (hex) => {
      expect(rgbToHex(hexToRgb(hex))).toBe(hex)
      expect(rgbToHex(hsvToRgb(rgbToHsv(hexToRgb(hex))))).toBe(hex)
    },
  )

  it.each([
    ['#FF0000', 0],
    ['#00FF00', 120],
    ['#0000FF', 240],
  ])('maps hue of %s to %i degrees', (hex, expectedHue) => {
    expect(rgbToHsv(hexToRgb(hex)).h).toBe(expectedHue)
  })
})

describe('contrastRatio and contrastLevel', () => {
  it.each([
    ['#000000', '#FFFFFF', 21, 5],
    ['#1F8FE0', '#1F8FE0', 1, 5],
    ['#0E1A2B', '#FFFFFF', 17.48, 1],
    ['#0B4F8A', '#FFFFFF', 8.4, 1],
    ['#1F8FE0', '#FFFFFF', 3.46, 1],
  ])('contrast ratio between %s and %s is close to %f', (hexA, hexB, expected, precision) => {
    const a = hexToRgb(hexA)
    const b = hexToRgb(hexB)
    expect(contrastRatio(a, b)).toBeCloseTo(expected, precision)
    expect(contrastRatio(b, a)).toBeCloseTo(expected, precision)
  })

  it.each([
    [7, 'AAA'],
    [4.5, 'AA'],
    [4.49, 'fail'],
  ])('contrast level for ratio %f is %s', (ratio, expected) => {
    expect(contrastLevel(ratio)).toBe(expected)
  })
})

describe('readableTextColour', () => {
  it.each([
    ['#0B4F8A', '#FFFFFF'],
    ['#0E1A2B', '#FFFFFF'],
    ['#CFE9FB', '#0E1A2B'],
    ['#FFFFFF', '#0E1A2B'],
  ])('readable text on %s is %s', (bgHex, expectedTextHex) => {
    expect(readableTextColour(bgHex)).toBe(expectedTextHex)
  })
})

describe('shiftHue', () => {
  it.each([
    ['#FF0000', 120, '#00FF00'],
    ['#FF0000', -120, '#0000FF'],
    ['#FF0000', 360, '#FF0000'],
    ['#808080', 90, '#808080'],
  ])('shifts hue of %s by %i degrees to %s', (hex, shift, expected) => {
    expect(shiftHue(hex, shift)).toBe(expected)
  })
})

describe('mixHex', () => {
  it('lays one colour over another at a share', () => {
    expect(mixHex('#FFFFFF', '#000000', 0)).toBe('#FFFFFF')
    expect(mixHex('#FFFFFF', '#000000', 1)).toBe('#000000')
    expect(mixHex('#FFFFFF', '#000000', 0.5)).toBe('#808080')
  })

  it('keeps the share between none and all of it', () => {
    expect(mixHex('#FFFFFF', '#000000', 2)).toBe('#000000')
    expect(mixHex('#FFFFFF', '#000000', -1)).toBe('#FFFFFF')
  })
})
