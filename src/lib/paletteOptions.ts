import { hexToRgb, normaliseHex, shiftHue } from './colour.ts'
import { HARMONIES, HARMONY_NOTES, harmonyColourWith, type Harmony } from './harmony.ts'
import { pairResult, resolveRoles, type PairResult, type PaletteBlock } from './palette.ts'
import { makeMoreReadable } from './readability.ts'

// The palettes Guide mode offers once the founder has named one to three colours they like. They are built here, in code, from the harmonies (no model is asked),
// so the same colours always give the same three, every one is a valid palette of 2 to 8 colours with its four roles set, every one keeps the colours the
// founder chose, and the three differ. "Show 3 more" asks for the next round: the rounds are one long deterministic run, so the same input gives the same rounds.

export const MAX_FAVOURITES = 3
export const OPTIONS_PER_ROUND = 3

export type PaletteOption = {
  // The colours and roles, which is what makes one option different from another.
  id: string
  title: string
  note: string
  // The harmony it is built on, or null when the accent is one of the founder's own colours.
  harmony: Harmony | null
  blocks: PaletteBlock[]
  textOnBackground: PairResult
}

// The favourites as valid, capitalised, distinct hex codes, at most three, in the order given.
export function cleanFavourites(input: string[]): string[] {
  const out: string[] = []
  for (const text of input) {
    const hex = normaliseHex(text)
    if (hex && !out.includes(hex)) out.push(hex)
    if (out.length === MAX_FAVOURITES) break
  }
  return out
}

const BACKGROUND_TONES = [0, 3, 5] // pale tints, palest first
const DEEP_TONE = 1 // a deep shade for text
const ACCENT_TONES = [2, 4] // the colour's own tone, then a mid one
const ALTERNATE_TONES = [4, 5, 3, 0]

const distance = (a: string, b: string) => {
  const x = hexToRgb(a)
  const y = hexToRgb(b)
  return Math.hypot(x.r - y.r, x.g - y.g, x.b - y.b)
}
const NEAR = 28

type Build = {
  primary: string
  // The accent: one of the founder's own colours, or null to take one from the harmony.
  accent: string | null
  extras: string[]
  harmony: Harmony
  variant: number
  // Where the page and the text take their hue from.
  backgroundFrom: string
  textFrom: string
}

function build(spec: Build): PaletteBlock[] {
  const { primary, extras, harmony, variant } = spec
  const background = harmonyColourWith(spec.backgroundFrom, 'monochrome', 0, BACKGROUND_TONES[variant % BACKGROUND_TONES.length])
  const text = harmonyColourWith(spec.textFrom, 'monochrome', 0, DEEP_TONE)
  const taken = [primary, background, text, ...extras]

  let accent = spec.accent
  if (!accent) {
    const turn = variant % 3
    const first = ACCENT_TONES[Math.floor(variant / 3) % ACCENT_TONES.length]
    const candidates = [first, ...ALTERNATE_TONES].map((tone) => harmonyColourWith(primary, harmony, turn, tone))
    accent = candidates.find((candidate) => taken.every((other) => distance(candidate, other) > NEAR)) ?? shiftHue(primary, 40)
  }

  // From the second set of three on, a supporting colour is added too, so asking for more keeps giving something new.
  const tier = Math.floor(variant / 3)
  const support: string[] = []
  if (tier >= 1) {
    const colour = harmonyColourWith(primary, HARMONIES[tier % HARMONIES.length].id, tier, [4, 5, 3][tier % 3])
    const apart = [...taken, accent]
    support.push(apart.every((other) => distance(colour, other) > NEAR) ? colour : shiftHue(primary, 60 * tier))
  }

  const list: { hex: string; role?: PaletteBlock['role'] }[] = [
    { hex: primary, role: 'primary' },
    { hex: accent, role: 'accent' },
    ...extras.map((hex) => ({ hex })),
    ...support.map((hex) => ({ hex })),
    { hex: background, role: 'background' },
    { hex: text, role: 'text' },
  ]
  const blocks: PaletteBlock[] = list.map((item, index) => ({ id: index + 1, hex: item.hex, ...(item.role ? { role: item.role } : {}) }))
  // The tones are chosen to read, but the hues are the founder's: if the text still does not reach AA on the background, it is moved.
  return makeMoreReadable(blocks)?.blocks ?? blocks
}

const signatureOf = (blocks: PaletteBlock[]) => blocks.map((block) => `${block.role ?? '-'}:${block.hex}`).join('|')

function describe(favourites: string[], n: number): { spec: Build; title: string; note: string } {
  const count = favourites.length
  if (count === 1) {
    const harmony = HARMONIES[n % HARMONIES.length]
    const variant = Math.floor(n / HARMONIES.length)
    const primary = favourites[0]
    return {
      spec: { primary, accent: null, extras: [], harmony: harmony.id, variant, backgroundFrom: primary, textFrom: primary },
      title: harmony.label,
      note: HARMONY_NOTES[harmony.id],
    }
  }
  // Two or three favourites: one palette around each as the primary, and then a blend. Every palette keeps every favourite.
  const styles = count + 1
  const style = n % styles
  const variant = Math.floor(n / styles)
  const harmony = HARMONIES[variant % HARMONIES.length].id
  if (style < count) {
    const primary = favourites[style]
    const others = favourites.filter((_, index) => index !== style)
    return {
      spec: { primary, accent: others[0], extras: others.slice(1), harmony, variant, backgroundFrom: primary, textFrom: primary },
      title: `Built around ${primary}`,
      note: 'This one is the main colour. Your other colours stay in the palette.',
    }
  }
  return {
    spec: { primary: favourites[0], accent: favourites[1], extras: favourites.slice(2), harmony, variant, backgroundFrom: favourites[count - 1], textFrom: favourites[0] },
    title: 'A blend of your colours',
    note: 'Keeps all of your colours, with the page and the text taken from different ones.',
  }
}

// How far the search for a new, different option goes before it gives up.
const MAX_CANDIDATES = 160

// Round `round` (from 0) of palettes for these favourites: three options, each different from every option in this round and the rounds before it.
export function paletteOptions(input: string[], round: number): PaletteOption[] {
  const favourites = cleanFavourites(input)
  if (favourites.length === 0 || round < 0) return []
  const wanted = (round + 1) * OPTIONS_PER_ROUND
  const found: PaletteOption[] = []
  const seen = new Set<string>()
  for (let n = 0; n < MAX_CANDIDATES && found.length < wanted; n += 1) {
    const { spec, title, note } = describe(favourites, n)
    const blocks = build(spec)
    const id = signatureOf(blocks)
    if (seen.has(id)) continue
    seen.add(id)
    const roles = resolveRoles(blocks)
    found.push({ id, title, note, harmony: spec.accent ? null : spec.harmony, blocks, textOnBackground: pairResult(roles.text.hex, roles.background.hex) })
  }
  return found.slice(round * OPTIONS_PER_ROUND, wanted)
}

// Whether the workspace's palette is this option: the same colours with the same roles (ids are ignored).
export const isOption = (option: PaletteOption, blocks: PaletteBlock[]) => signatureOf(blocks) === option.id
