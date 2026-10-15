import { describe, expect, it } from 'vitest'
import { starterBlocks } from '../compose/fallback.ts'
import { brandPartsDone, keyPairs, paletteIsStarter } from './brandParts.ts'
import { resolveRoles, type PaletteBlock } from './palette.ts'

const withHex = (blocks: PaletteBlock[], id: number, hex: string) => blocks.map((block) => (block.id === id ? { ...block, hex } : block))
const withoutRoles = (blocks: PaletteBlock[]) => blocks.map(({ role: _role, ...rest }) => rest)

describe('the ticks of the brand parts', () => {
  it('has Colours and Roles open on the untouched starter palette, though it arrives with roles set', () => {
    const done = brandPartsDone(starterBlocks())
    expect(done.colours).toBe(false)
    expect(done.roles).toBe(false)
    expect(paletteIsStarter(starterBlocks())).toBe(true)
  })

  it('ticks Contrast on the starter palette, whose text reads on its background', () => {
    expect(brandPartsDone(starterBlocks()).contrast).toBe(true)
  })

  it('ticks Colours once a colour is changed', () => {
    const blocks = withHex(starterBlocks(), 1, '#AA3355')
    expect(paletteIsStarter(blocks)).toBe(false)
    expect(brandPartsDone(blocks).colours).toBe(true)
  })

  it('ticks Roles only when every role has been chosen, not only suggested', () => {
    const changed = withHex(starterBlocks(), 1, '#AA3355')
    expect(brandPartsDone(changed).roles).toBe(true)
    const suggested = withoutRoles(changed)
    expect(brandPartsDone(suggested).roles).toBe(false)
    // three of the four chosen is not enough
    const three = suggested.map((block, index) => (index < 3 ? { ...block, role: starterBlocks()[index].role } : block))
    expect(brandPartsDone(three).roles).toBe(false)
  })

  it('takes the tick from Contrast when the text cannot be read on the background', () => {
    const blocks = starterBlocks().map((block) => (block.role === 'text' ? { ...block, hex: '#D5ECFB' } : block))
    expect(brandPartsDone(blocks).contrast).toBe(false)
  })
})

describe('the key pairs', () => {
  it('names the text on the background, the primary on it and the accent on it, each with a ratio and a verdict', () => {
    const pairs = keyPairs(resolveRoles(starterBlocks()))
    expect(pairs.map((pair) => pair.label)).toEqual(['Text on background', 'Primary on background', 'Accent on background'])
    for (const pair of pairs) {
      expect(pair.ratio).toBeGreaterThan(1)
      expect(['AAA', 'AA', 'fail']).toContain(pair.level)
    }
    expect(pairs[0].level).not.toBe('fail')
  })
})
