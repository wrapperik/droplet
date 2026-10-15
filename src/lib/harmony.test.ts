import { hexToRgb, rgbToHsv } from './colour.ts'
import { HARMONIES, HARMONY_DIAGRAM, HARMONY_IDS, HARMONY_NOTES, HARMONY_RULES, RULE_IDS, generatePalette, harmonyColour, harmonyLabel, hueTurnsOf, isRule, replaceableIds, type Harmony } from './harmony.ts'
import type { PaletteBlock } from './palette.ts'

const blocks: PaletteBlock[] = [
  { id: 1, hex: '#1F8FE0' },
  { id: 2, hex: '#0B4F8A' },
  { id: 3, hex: '#CFE9FB' },
  { id: 4, hex: '#0E1A2B', locked: true },
]

const hue = (hex: string) => rgbToHsv(hexToRgb(hex)).h
const turn = (a: string, b: string) => (((hue(b) - hue(a)) % 360) + 360) % 360

describe('harmonyColour', () => {
  it('always gives a valid hex colour, for every harmony and position', () => {
    for (const { id } of HARMONIES) {
      for (let index = 0; index < 9; index += 1) {
        expect(harmonyColour('#1F8FE0', id, index, index)).toMatch(/^#[0-9A-F]{6}$/)
      }
    }
  })

  it('gives the same colour for the same inputs', () => {
    expect(harmonyColour('#1F8FE0', 'triad', 2, 1)).toBe(harmonyColour('#1F8FE0', 'triad', 2, 1))
  })

  it('turns the hue by the harmony\'s angle', () => {
    // complementary starts opposite on the wheel; triad a third of the way round. Pale tints lose a degree or so
    // to 8-bit rounding, so the check allows three.
    const near = (actual: number, expected: number) => {
      const gap = Math.abs(actual - expected) % 360
      return Math.min(gap, 360 - gap) < 3
    }
    expect(near(turn('#1F8FE0', harmonyColour('#1F8FE0', 'complementary', 0)), 180)).toBe(true)
    expect(near(turn('#1F8FE0', harmonyColour('#1F8FE0', 'triad', 0)), 120)).toBe(true)
    expect(near(turn('#1F8FE0', harmonyColour('#1F8FE0', 'monochrome', 0)), 0)).toBe(true)
  })

  it('makes the first colour pale and the second deep, so a palette has a background and a text colour', () => {
    const pale = rgbToHsv(hexToRgb(harmonyColour('#1F8FE0', 'analogous', 0))).v
    const deep = rgbToHsv(hexToRgb(harmonyColour('#1F8FE0', 'analogous', 1))).v
    expect(pale).toBeGreaterThan(0.9)
    expect(deep).toBeLessThan(0.3)
  })

  it('gives a different arrangement when the variation changes', () => {
    expect(harmonyColour('#1F8FE0', 'analogous', 0, 0)).not.toBe(harmonyColour('#1F8FE0', 'analogous', 0, 1))
  })

  it('keeps colour even when the starting colour is a grey', () => {
    const { s } = rgbToHsv(hexToRgb(harmonyColour('#808080', 'triad', 2)))
    expect(s).toBeGreaterThan(0.3)
  })
})

describe('generatePalette', () => {
  it('leaves the starting colour and locked colours alone', () => {
    const result = generatePalette(blocks, 1, 'analogous')
    expect(result.find((b) => b.id === 1)?.hex).toBe('#1F8FE0')
    expect(result.find((b) => b.id === 4)?.hex).toBe('#0E1A2B')
    expect(result.find((b) => b.id === 2)?.hex).not.toBe('#0B4F8A')
    expect(result.find((b) => b.id === 3)?.hex).not.toBe('#CFE9FB')
  })

  it('keeps ids, order, roles and locks', () => {
    const withRole = blocks.map((b) => (b.id === 2 ? { ...b, role: 'primary' as const } : b))
    const result = generatePalette(withRole, 1, 'triad')
    expect(result.map((b) => b.id)).toEqual([1, 2, 3, 4])
    expect(result.find((b) => b.id === 2)?.role).toBe('primary')
    expect(result.find((b) => b.id === 4)?.locked).toBe(true)
  })

  it('drops the composer\'s name and note from a colour it replaces, and keeps them on the rest', () => {
    const described = blocks.map((b) => ({ ...b, name: 'A name', note: 'A reason.' }))
    const result = generatePalette(described, 1, 'analogous')
    expect(result.find((b) => b.id === 2)?.name).toBeUndefined()
    expect(result.find((b) => b.id === 2)?.note).toBeUndefined()
    expect(result.find((b) => b.id === 1)?.name).toBe('A name')
    expect(result.find((b) => b.id === 4)?.note).toBe('A reason.')
  })

  it('does not change the list it was given', () => {
    generatePalette(blocks, 1, 'analogous')
    expect(blocks[1].hex).toBe('#0B4F8A')
  })

  it('changes nothing when every other colour is locked', () => {
    const allLocked = blocks.map((b) => (b.id === 1 ? b : { ...b, locked: true }))
    expect(replaceableIds(allLocked, 1)).toEqual([])
    expect(generatePalette(allLocked, 1, 'analogous')).toEqual(allLocked)
  })

  it('gives a different result when asked again', () => {
    const first = generatePalette(blocks, 1, 'analogous', 0).map((b) => b.hex)
    const second = generatePalette(blocks, 1, 'analogous', 1).map((b) => b.hex)
    expect(second).not.toEqual(first)
  })
})

describe('the rules the wheel offers', () => {
  it('lists the eight in the order the row shows them, Custom first, each with a name and a note', () => {
    expect(HARMONY_RULES.map((rule) => rule.label)).toEqual(['Custom', 'Analogous', 'Monochromatic', 'Triad', 'Complementary', 'Split complementary', 'Square', 'Double split complementary'])
    expect(HARMONY_IDS).toEqual(HARMONY_RULES.map((rule) => rule.id))
    expect(RULE_IDS).not.toContain('custom')
    expect(RULE_IDS).toHaveLength(7)
    for (const id of HARMONY_IDS) expect(HARMONY_NOTES[id].length).toBeGreaterThan(10)
    expect(harmonyLabel('double_split')).toBe('Double split complementary')
    expect(isRule('custom')).toBe(false)
    expect(isRule('square')).toBe(true)
  })

  it('keeps the four classic harmonies, in their order, for the palettes Guide mode builds', () => {
    expect(HARMONIES.map((entry) => entry.id)).toEqual(['analogous', 'complementary', 'triad', 'monochrome'])
  })

  it('draws every rule from its starting colour, and the diagram agrees with the turns the maths makes', () => {
    for (const id of HARMONY_IDS) {
      const points = HARMONY_DIAGRAM[id]
      expect(points[0]).toEqual({ angle: 0, radius: 1 })
      if (id === 'custom') continue
      // The colours after the first are the turns the maths starts with: every one of the first few turns is a point on the diagram.
      const angles = points.slice(1).map((point) => ((point.angle % 360) + 360) % 360)
      const turns = hueTurnsOf(id)
        .slice(0, angles.length)
        .map((turn) => ((turn % 360) + 360) % 360)
      for (const turn of turns) expect([...angles, 0]).toContain(turn)
    }
  })

  const near = (actual: number, expected: number) => {
    const gap = Math.abs(actual - expected) % 360
    return Math.min(gap, 360 - gap) < 3
  }
  const turnedBy = (rule: Harmony, position: number) => turn('#1F8FE0', harmonyColour('#1F8FE0', rule, position))

  it('turns the hue by the angles of the new rules', () => {
    // split complementary: the two beside the opposite
    expect(near(turnedBy('split_complementary', 0), 150)).toBe(true)
    expect(near(turnedBy('split_complementary', 1), 210)).toBe(true)
    // square: a quarter turn each
    expect([0, 1, 2].map((position) => near(turnedBy('square', position), 90 * (position + 1)))).toEqual([true, true, true])
    // double split: a neighbour, then the two beside the opposite
    expect([30, 180, 210].map((angle, position) => near(turnedBy('double_split', position), angle))).toEqual([true, true, true])
  })

  it('gives a valid colour for every rule, position and variation', () => {
    for (const id of HARMONY_IDS) for (let position = 0; position < 8; position += 1) for (let variation = 0; variation < 4; variation += 1) expect(harmonyColour('#1F8FE0', id, position, variation)).toMatch(/^#[0-9A-F]{6}$/)
  })

  it('fills the other colours by a new rule and leaves the starting colour and the kept ones', () => {
    for (const rule of ['split_complementary', 'square', 'double_split'] as const) {
      const result = generatePalette(blocks, 1, rule)
      expect(result[0].hex).toBe('#1F8FE0')
      expect(result[3].hex).toBe('#0E1A2B')
      expect(result[1].hex).not.toBe('#0B4F8A')
    }
  })

  it('has no rule in Custom, so nothing is filled in', () => {
    expect(generatePalette(blocks, 1, 'custom')).toBe(blocks)
  })
})
