import { describe, expect, it } from 'vitest'
import { blockSchema, checkBlocks, checkDraft, describeBlocks, type ChatBlock } from './blocks.ts'

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

describe('a draft block', () => {
  const text = "Hi Tanya, hope you're well. Just checking the invoice landed with you. Thanks, Rework"

  it('takes a message to send, with a label', () => {
    expect(blockSchema.safeParse({ type: 'draft', label: 'WhatsApp to Tanya', text }).success).toBe(true)
    expect(blockSchema.safeParse({ type: 'draft', text: '' }).success).toBe(false)
  })

  it('passes a clean message', () => {
    expect(checkDraft(text)).toEqual([])
    expect(checkDraft('Hi Tanya,\n\nThe invoice is attached.\n\nThanks,\nRework')).toEqual([])
  })

  it.each([
    ['dashes around it', `--- ${text} ---`],
    ['a separator line', `Hi Tanya\n---\nThanks`],
    ['a word about AI', `${text} (AI-generated)`],
    ['a placeholder', 'Hi [Client name], your invoice for [amount] is due.'],
    ['quotation marks around it', `"${text}"`],
  ])('sends back a message with %s', (_what, draft) => {
    expect(checkDraft(draft).length).toBeGreaterThan(0)
    expect(checkBlocks([{ type: 'draft', text: draft }])[0]).toMatch(/^blocks\.0\.text: /)
  })

  it('is described for the composer by its label and words', () => {
    expect(describeBlocks([{ type: 'draft', label: 'WhatsApp to Tanya', text }], undefined)).toBe(`[Draft "WhatsApp to Tanya": ${text}]`)
  })
})
