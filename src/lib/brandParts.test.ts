import { describe, expect, it } from 'vitest'
import { starterBlocks } from '../compose/fallback.ts'
import { brandPartsDone, keyPairs, paletteIsStarter } from './brandParts.ts'
import { resolveRoles, type PaletteBlock } from './palette.ts'

const withHex = (blocks: PaletteBlock[], id: number, hex: string) => blocks.map((block) => (block.id === id ? { ...block, hex } : block))

const none = { fonts: null, voice: [] }

describe('the ticks of the brand parts', () => {
  it('has every part open on the untouched starter palette with nothing chosen', () => {
    const done = brandPartsDone(starterBlocks(), none)
    expect(done).toEqual({ colours: false, typography: false, voice: false, plan: false })
    expect(paletteIsStarter(starterBlocks())).toBe(true)
  })

  it('ticks Colours once a colour is changed', () => {
    const blocks = withHex(starterBlocks(), 1, '#AA3355')
    expect(paletteIsStarter(blocks)).toBe(false)
    expect(brandPartsDone(blocks, none).colours).toBe(true)
  })

  it('ticks Typography when a pair is chosen and Voice when a word is', () => {
    expect(brandPartsDone(starterBlocks(), { fonts: 'clean', voice: [] })).toMatchObject({ typography: true, voice: false })
    expect(brandPartsDone(starterBlocks(), { fonts: null, voice: ['Warm'] })).toMatchObject({ typography: false, voice: true })
  })

  it('ticks the Brand plan only when the three before it are done', () => {
    const blocks = withHex(starterBlocks(), 1, '#AA3355')
    expect(brandPartsDone(blocks, { fonts: 'clean', voice: [] }).plan).toBe(false)
    expect(brandPartsDone(blocks, { fonts: 'clean', voice: ['Warm', 'Bold'] }).plan).toBe(true)
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
