import { describe, expect, it } from 'vitest'
import { blockSchema, checkBlocks, describeBlocks, type ChatBlock } from './blocks.ts'

const brief = { type: 'brief' as const, does: 'Curated corporate gift boxes from local makers', feel: ['warm', 'trusted'], usedFor: 'Invoices and Instagram' }

describe('a logo brief block', () => {
  it('holds only words: what it does, the feel and where it is used, with fonts optional', () => {
    expect(blockSchema.safeParse(brief).success).toBe(true)
    expect(blockSchema.safeParse({ ...brief, fonts: ['Lato', 'Merriweather'] }).success).toBe(true)
  })

  it('has no place for a colour, a size or a link', () => {
    const parsed = blockSchema.parse({ ...brief, colours: ['#FF0000'], url: 'https://example.com' })
    expect(parsed).toEqual(brief)
  })

  it('is refused when it is empty, has more than three feel words or more than two fonts', () => {
    expect(blockSchema.safeParse({ ...brief, does: '' }).success).toBe(false)
    expect(blockSchema.safeParse({ ...brief, feel: [] }).success).toBe(false)
    expect(blockSchema.safeParse({ ...brief, feel: ['a', 'b', 'c', 'd'] }).success).toBe(false)
    expect(blockSchema.safeParse({ ...brief, fonts: ['a', 'b', 'c'] }).success).toBe(false)
  })

  it('is sent back when a hex code, a private detail or a placeholder gets into the words', () => {
    expect(checkBlocks([brief])).toEqual([])
    expect(checkBlocks([{ ...brief, does: 'Boxes in #0B4F8A' }])[0]).toMatch(/^blocks\.0\.brief\.does: leave hex codes out/)
    expect(checkBlocks([{ ...brief, usedFor: 'Call 012 345 6789' }])[0]).toMatch(/private detail/)
    expect(checkBlocks([{ ...brief, usedFor: '[Where it is used]' }])[0]).toMatch(/square brackets/)
  })

  it('may be shown once in a reply', () => {
    const errors = checkBlocks([brief, brief])
    expect(errors.some((error) => /one brief in a reply/.test(error))).toBe(true)
  })

  it('is described in words for the history, without any colour', () => {
    const blocks: ChatBlock[] = [brief]
    expect(describeBlocks(blocks, undefined)).toBe('[Logo brief: Curated corporate gift boxes from local makers; feel: warm, trusted; used for: Invoices and Instagram]')
  })
})
