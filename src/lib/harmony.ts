import { hexToRgb, hsvToRgb, rgbToHex, rgbToHsv } from './colour.ts'
import { withHex, type PaletteBlock } from './palette.ts'

// Ways of choosing colours that go together, as turns around the colour wheel from a starting colour. "Custom" is not a rule: it is the absence of one, so each
// colour is moved on its own and nothing is worked out from another.
export type Harmony = 'custom' | 'analogous' | 'monochrome' | 'triad' | 'complementary' | 'split_complementary' | 'square' | 'double_split'

// Every harmony, in the order the wheel's row shows them. `label` is the name on screen.
export const HARMONY_RULES: { id: Harmony; label: string }[] = [
  { id: 'custom', label: 'Custom' },
  { id: 'analogous', label: 'Analogous' },
  { id: 'monochrome', label: 'Monochromatic' },
  { id: 'triad', label: 'Triad' },
  { id: 'complementary', label: 'Complementary' },
  { id: 'split_complementary', label: 'Split complementary' },
  { id: 'square', label: 'Square' },
  { id: 'double_split', label: 'Double split complementary' },
]

export const HARMONY_IDS = HARMONY_RULES.map((rule) => rule.id) as [Harmony, ...Harmony[]]
// The harmonies that work colours out from one another: everything but Custom.
export const RULE_IDS = HARMONY_IDS.filter((id) => id !== 'custom') as [Harmony, ...Harmony[]]

export const isRule = (harmony: Harmony) => harmony !== 'custom'
export const harmonyLabel = (harmony: Harmony) => HARMONY_RULES.find((rule) => rule.id === harmony)?.label ?? harmony

// The four classic harmonies, which Guide mode builds its three palettes from. Their order decides which palettes it offers, so it does not change.
export const HARMONIES: { id: Harmony; label: string }[] = [
  { id: 'analogous', label: 'Analogous' },
  { id: 'complementary', label: 'Complementary' },
  { id: 'triad', label: 'Triad' },
  { id: 'monochrome', label: 'Monochrome' },
]

// One line on each harmony, for the cards that show it.
export const HARMONY_NOTES: Record<Harmony, string> = {
  custom: 'No rule. Each colour moves on its own.',
  analogous: 'Neighbours on the colour wheel. Calm, and rarely clashes.',
  complementary: 'Opposites on the wheel. Lively, with strong contrast.',
  triad: 'Three colours spaced evenly round the wheel. Bold and balanced.',
  monochrome: 'One hue in lighter and darker tones. Quiet and consistent.',
  split_complementary: 'A colour and the two beside its opposite. Lively, but softer than a plain opposite.',
  square: 'Four colours spaced evenly round the wheel. Rich, and needs one to lead.',
  double_split: 'Two neighbours and the two beside their opposites. The widest range of the rules.',
}

// Where each harmony puts its colours, for drawing its diagram: the turn from the starting colour in degrees, and how far from the centre of the wheel (1 is the
// edge). The first point is always the starting colour. "Custom" is scattered on purpose: the colours have no relation.
export type DiagramPoint = { angle: number; radius: number }
export const HARMONY_DIAGRAM: Record<Harmony, DiagramPoint[]> = {
  custom: [
    { angle: 0, radius: 1 },
    { angle: 80, radius: 0.55 },
    { angle: 190, radius: 0.85 },
    { angle: 290, radius: 0.4 },
  ],
  analogous: [
    { angle: 0, radius: 1 },
    { angle: 30, radius: 1 },
    { angle: -30, radius: 1 },
  ],
  monochrome: [
    { angle: 0, radius: 1 },
    { angle: 0, radius: 0.66 },
    { angle: 0, radius: 0.33 },
  ],
  triad: [
    { angle: 0, radius: 1 },
    { angle: 120, radius: 1 },
    { angle: 240, radius: 1 },
  ],
  complementary: [
    { angle: 0, radius: 1 },
    { angle: 180, radius: 1 },
  ],
  split_complementary: [
    { angle: 0, radius: 1 },
    { angle: 150, radius: 1 },
    { angle: 210, radius: 1 },
  ],
  square: [
    { angle: 0, radius: 1 },
    { angle: 90, radius: 1 },
    { angle: 180, radius: 1 },
    { angle: 270, radius: 1 },
  ],
  double_split: [
    { angle: 0, radius: 1 },
    { angle: 30, radius: 1 },
    { angle: 180, radius: 1 },
    { angle: 210, radius: 1 },
  ],
}

// Degrees to turn the hue, in the order colours are made.
const HUE_TURNS: Record<Harmony, number[]> = {
  custom: [0, 0, 0, 0, 0, 0, 0],
  analogous: [30, -30, 60, -60, 90, -90, 15],
  complementary: [180, 0, 180, 30, 210, -30, 150],
  triad: [120, 240, 120, 240, 0, 120, 240],
  monochrome: [0, 0, 0, 0, 0, 0, 0],
  split_complementary: [150, 210, 180, 150, 210, 0, 180],
  square: [90, 180, 270, 90, 180, 270, 0],
  double_split: [30, 180, 210, 30, 180, 210, 0],
}

// The turns a harmony starts with, for a test of the diagram against the maths.
export const hueTurnsOf = (harmony: Harmony): number[] => [...HUE_TURNS[harmony]]

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

// Fills every colour that is not the starting colour and not locked. Ids, roles and locks stay as they were. Custom has no rule, so it fills nothing.
export function generatePalette(blocks: PaletteBlock[], baseId: number, harmony: Harmony, variation = 0): PaletteBlock[] {
  const base = blocks.find((block) => block.id === baseId)
  if (!base || !isRule(harmony)) return blocks
  const targets = replaceableIds(blocks, baseId)
  return blocks.map((block) => {
    const position = targets.indexOf(block.id)
    if (position < 0) return block
    return withHex(block, harmonyColour(base.hex, harmony, position, variation))
  })
}
