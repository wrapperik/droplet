import { hexToRgb, hsvToRgb, rgbToHex, rgbToHsv } from './colour.ts'
import { withHex, type PaletteBlock } from './palette.ts'

// Ways of choosing colours that go together, as turns around the colour wheel from a starting colour.
export type Harmony = 'analogous' | 'complementary' | 'triad' | 'monochrome'

export const HARMONIES: { id: Harmony; label: string }[] = [
  { id: 'analogous', label: 'Analogous' },
  { id: 'complementary', label: 'Complementary' },
  { id: 'triad', label: 'Triad' },
  { id: 'monochrome', label: 'Monochrome' },
]

// One line on each harmony, for the cards that show it.
export const HARMONY_NOTES: Record<Harmony, string> = {
  analogous: 'Neighbours on the colour wheel. Calm, and rarely clashes.',
  complementary: 'Opposites on the wheel. Lively, with strong contrast.',
  triad: 'Three colours spaced evenly round the wheel. Bold and balanced.',
  monochrome: 'One hue in lighter and darker tones. Quiet and consistent.',
}

// Degrees to turn the hue, in the order colours are made.
const HUE_TURNS: Record<Harmony, number[]> = {
  analogous: [30, -30, 60, -60, 90, -90, 15],
  complementary: [180, 0, 180, 30, 210, -30, 150],
  triad: [120, 240, 120, 240, 0, 120, 240],
  monochrome: [0, 0, 0, 0, 0, 0, 0],
}

// How light or dark each colour is, so a palette is never seven versions of the same mid tone: a pale tint for
// backgrounds, a deep shade for text, then the starting colour's own tone and a few between.
type Tone = { saturation: number; floor: number; value: number | 'same' }
const TONES: Tone[] = [
  { saturation: 0.15, floor: 0.06, value: 0.97 },
  { saturation: 0.9, floor: 0.4, value: 0.22 },
  { saturation: 1, floor: 0.4, value: 'same' },
  { saturation: 0.6, floor: 0.3, value: 0.94 },
  { saturation: 1, floor: 0.5, value: 0.6 },
  { saturation: 0.4, floor: 0.2, value: 0.82 },
]

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

// The colour for position `index` in a harmony. `variation` rotates which tone each position gets, so asking again
// gives a different arrangement of the same idea. The same inputs always give the same colour.
export function harmonyColour(baseHex: string, harmony: Harmony, index: number, variation = 0): string {
  return harmonyColourWith(baseHex, harmony, index, (index + variation) % TONES.length)
}

// The same, with the hue turn and the tone chosen separately: `turn` picks which turn round the wheel (it wraps), `toneIndex` picks the tone (it wraps). Guide
// mode uses it to build a palette with a known background, text and accent.
export const TONE_COUNT = TONES.length
export function harmonyColourWith(baseHex: string, harmony: Harmony, turn: number, toneIndex: number): string {
  const base = rgbToHsv(hexToRgb(baseHex))
  const turns = HUE_TURNS[harmony]
  const tone = TONES[((toneIndex % TONES.length) + TONES.length) % TONES.length]
  const hue = (((base.h + turns[turn % turns.length]) % 360) + 360) % 360
  const saturation = clamp01(Math.max(base.s * tone.saturation, tone.floor))
  const value = clamp01(tone.value === 'same' ? base.v : tone.value)
  return rgbToHex(hsvToRgb({ h: hue, s: saturation, v: value }))
}

// Which colours Generate would replace: every colour except the one it starts from and any the founder locked.
export function replaceableIds(blocks: PaletteBlock[], baseId: number): number[] {
  return blocks.filter((block) => block.id !== baseId && !block.locked).map((block) => block.id)
}

// Fills every colour that is not the starting colour and not locked. Ids, roles and locks stay as they were.
export function generatePalette(blocks: PaletteBlock[], baseId: number, harmony: Harmony, variation = 0): PaletteBlock[] {
  const base = blocks.find((block) => block.id === baseId)
  if (!base) return blocks
  const targets = replaceableIds(blocks, baseId)
  return blocks.map((block) => {
    const position = targets.indexOf(block.id)
    if (position < 0) return block
    return withHex(block, harmonyColour(base.hex, harmony, position, variation))
  })
}
