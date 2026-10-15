import { starterBlocks } from '../compose/fallback.ts'
import { BRAND_PARTS } from './brandParts.ts'
import {
  BRAND_STEPS,
  advanceBrand,
  backBrand,
  brandBlockers,
  goToBrand,
  hasOwnPalette,
  jumpToBrand,
  paletteResultMessage,
  paletteResultOf,
  paletteResultSchema,
  startBrandGuide,
} from './brandGuide.ts'
import type { PaletteBlock } from './palette.ts'

const own: PaletteBlock[] = [
  { id: 1, hex: '#7B2D8E', role: 'primary' },
  { id: 2, hex: '#F4A261', role: 'accent' },
  { id: 3, hex: '#F7EEF9', role: 'background' },
  { id: 4, hex: '#2A0F33', role: 'text' },
]

describe('the brand guide', () => {
  it('has the four parts, in order', () => {
    expect(BRAND_STEPS).toEqual(BRAND_PARTS)
    expect([...BRAND_STEPS]).toEqual(['colours', 'typography', 'voice', 'plan'])
  })

  it('holds Continue back on Colours while the palette is still the starter and none is saved', () => {
    const facts = { blocks: starterBlocks(), hasSaved: false, fonts: null, voice: [] }
    expect(hasOwnPalette(facts)).toBe(false)
    expect(brandBlockers('colours', facts)).toHaveLength(1)
    const result = advanceBrand(startBrandGuide(), facts)
    expect(result.blocked).toHaveLength(1)
    expect(result.progress).toEqual(startBrandGuide())
  })

  it('lets the founder on once the palette is their own, or the project already has one saved', () => {
    expect(brandBlockers('colours', { blocks: own, hasSaved: false, fonts: null, voice: [] })).toEqual([])
    expect(brandBlockers('colours', { blocks: starterBlocks(), hasSaved: true, fonts: null, voice: [] })).toEqual([])
    const result = advanceBrand(startBrandGuide(), { blocks: own, hasSaved: false, fonts: null, voice: [] })
    expect(result.progress).toEqual({ step: 'typography', reached: 1 })
  })

  it('holds Typography and Voice back until something is chosen, and has nowhere to go from the last part', () => {
    const facts = { blocks: starterBlocks(), hasSaved: false, fonts: null, voice: [] }
    expect(brandBlockers('typography', facts)).toHaveLength(1)
    expect(brandBlockers('voice', facts)).toHaveLength(1)
    expect(brandBlockers('typography', { ...facts, fonts: 'clean' })).toEqual([])
    expect(brandBlockers('voice', { ...facts, voice: ['Warm'] })).toEqual([])
    const last = { step: 'plan' as const, reached: 3 }
    expect(advanceBrand(last, facts).progress).toBe(last)
  })

  it('goes back, and to a part already reached but not further on', () => {
    const at = { step: 'typography' as const, reached: 1 }
    expect(backBrand(at)).toEqual({ step: 'colours', reached: 1 })
    expect(backBrand(startBrandGuide())).toEqual(startBrandGuide())
    expect(goToBrand(at, 'plan')).toBe(at)
    expect(goToBrand({ step: 'colours', reached: 1 }, 'typography')).toEqual({ step: 'typography', reached: 1 })
    expect(jumpToBrand(startBrandGuide(), 'plan')).toEqual({ step: 'plan', reached: 3 })
  })
})

describe('a finished palette', () => {
  it('is made from the colours with their roles and how the text reads, and passes its own schema', () => {
    const result = paletteResultOf(own)
    expect(paletteResultSchema.safeParse(result).success).toBe(true)
    expect(result.colours.map((colour) => colour.hex)).toEqual(['#7B2D8E', '#F4A261', '#F7EEF9', '#2A0F33'])
    expect(result.colours.map((colour) => colour.role)).toEqual(['primary', 'accent', 'background', 'text'])
    expect(result.level).not.toBe('fail')
    expect(result.ratio).toBeGreaterThan(4.5)
  })

  it('names the roles it worked out for colours that were not given one', () => {
    const result = paletteResultOf([{ id: 1, hex: '#FFFFFF' }, { id: 2, hex: '#101820' }])
    expect(paletteResultSchema.safeParse(result).success).toBe(true)
    expect(result.colours.map((colour) => colour.role).filter(Boolean).length).toBeGreaterThan(0)
  })

  it('has a plain message that says what was done and carries no figure the app has not worked out', () => {
    const message = paletteResultMessage(paletteResultOf(own))
    expect(message).toMatch(/finished and saved/)
    expect(message).toMatch(/Export the brand sheet/)
    expect(message).not.toMatch(/—|–/)
  })
})
