import { contrastRatio, hexToRgb, rgbToHsv } from './colour.ts'
import { RULE_IDS } from './harmony.ts'
import { resolveRoles, type PaletteBlock } from './palette.ts'
import { baseTarget, randomBase, randomHarmony, randomPalette, readableRandomPalette, type Random } from './randomPalette.ts'
import { docOf, openWorkspace, reduce } from './workspaceState.ts'

const blocks = (): PaletteBlock[] => [
  { id: 1, hex: '#1F8FE0' },
  { id: 2, hex: '#0B4F8A' },
  { id: 3, hex: '#CFE9FB' },
  { id: 4, hex: '#0E1A2B' },
]

// A random source that gives these numbers in turn, then keeps repeating the last.
const sequence = (...values: number[]): Random => {
  let at = 0
  return () => values[Math.min(at++, values.length - 1)]
}

describe('randomBase', () => {
  it('is a lively colour for any number the source gives', () => {
    for (const number of [0, 0.1, 0.33, 0.5, 0.77, 0.999999]) {
      const hex = randomBase(() => number)
      expect(hex).toMatch(/^#[0-9A-F]{6}$/)
      const { s, v } = rgbToHsv(hexToRgb(hex))
      expect(s).toBeGreaterThanOrEqual(0.44)
      expect(v).toBeGreaterThanOrEqual(0.54)
    }
  })

  it('gives the same colour for the same source', () => {
    expect(randomBase(sequence(0.2, 0.4, 0.6))).toBe(randomBase(sequence(0.2, 0.4, 0.6)))
    expect(randomBase(sequence(0.2, 0.4, 0.6))).not.toBe(randomBase(sequence(0.7, 0.4, 0.6)))
  })
})

describe('randomHarmony', () => {
  it('never picks Custom, and can pick every rule', () => {
    const picked = new Set<string>()
    for (let i = 0; i < RULE_IDS.length; i += 1) picked.add(randomHarmony(() => (i + 0.5) / RULE_IDS.length))
    expect([...picked].sort()).toEqual([...RULE_IDS].sort())
    expect(randomHarmony(() => 0.999999)).toBe(RULE_IDS[RULE_IDS.length - 1])
  })
})

describe('baseTarget', () => {
  it('is the selected colour, or the first that is not kept when that one is, or nothing when every colour is kept', () => {
    expect(baseTarget(blocks(), 3)?.id).toBe(3)
    expect(baseTarget(blocks().map((b) => (b.id === 3 ? { ...b, locked: true } : b)), 3)?.id).toBe(1)
    expect(baseTarget(blocks().map((b) => ({ ...b, locked: true })), 3)).toBeNull()
  })
})

describe('randomPalette', () => {
  it('is one action that gives the selected colour a new base and fills the others by a rule, and undoing it takes it all back', () => {
    const state = openWorkspace(blocks())
    const action = randomPalette(blocks(), 1, sequence(0.1, 0.5, 0.5, 0.3, 0.5))!
    expect(action.type).toBe('batch')
    const after = reduce(state, action)
    expect(after.history.past).toHaveLength(1)
    expect(docOf(after).blocks[0].hex).not.toBe('#1F8FE0')
    expect(docOf(after).blocks.map((b) => b.id)).toEqual([1, 2, 3, 4])
    expect(docOf(reduce(after, { type: 'undo' })).blocks).toEqual(blocks())
  })

  it('gives the same palette for the same source, and a different one for another', () => {
    const run = (random: Random) => docOf(reduce(openWorkspace(blocks()), randomPalette(blocks(), 1, random)!)).blocks.map((b) => b.hex)
    expect(run(sequence(0.3, 0.6, 0.2, 0.9, 0.1))).toEqual(run(sequence(0.3, 0.6, 0.2, 0.9, 0.1)))
    expect(run(sequence(0.3, 0.6, 0.2, 0.9, 0.1))).not.toEqual(run(sequence(0.8, 0.6, 0.2, 0.1, 0.7)))
  })

  it('leaves the colours that are kept, and uses another colour as the base when the selected one is kept', () => {
    const kept = blocks().map((b) => (b.id === 1 || b.id === 4 ? { ...b, locked: true } : b))
    const after = docOf(reduce(openWorkspace(kept), randomPalette(kept, 1, sequence(0.4, 0.6, 0.5, 0.2, 0.5))!)).blocks
    expect(after[0].hex).toBe('#1F8FE0')
    expect(after[3].hex).toBe('#0E1A2B')
    expect(after[1].hex).not.toBe('#0B4F8A')
  })

  it('does nothing when every colour is kept', () => {
    expect(randomPalette(blocks().map((b) => ({ ...b, locked: true })), 1, Math.random)).toBeNull()
  })

  it('uses Math.random when no source is given', () => {
    expect(randomPalette(blocks(), 1)).not.toBeNull()
  })
})

describe('readableRandomPalette', () => {
  it('always leaves the text readable on the background, in one step', () => {
    let seed = 7
    const random = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    for (let i = 0; i < 40; i++) {
      const state = openWorkspace([{ id: 1, hex: '#1F8FE0' }, { id: 2, hex: '#0B4F8A' }, { id: 3, hex: '#CFE9FB' }, { id: 4, hex: '#0E1A2B' }])
      const action = readableRandomPalette(state, random)
      expect(action).not.toBeNull()
      const roles = resolveRoles(docOf(reduce(state, action!)).blocks)
      expect(contrastRatio(hexToRgb(roles.text.hex)!, hexToRgb(roles.background.hex)!)).toBeGreaterThanOrEqual(4.5)
    }
  })
})
