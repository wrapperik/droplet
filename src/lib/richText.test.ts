import { parseInline, parseRichText } from './richText.ts'

const text = (inlines: { text: string }[]) => inlines.map((part) => part.text).join('')

describe('parseInline', () => {
  it('reads **bold** runs and leaves the rest as it is', () => {
    expect(parseInline('Use **warm clay** for the lid')).toEqual([{ text: 'Use ' }, { text: 'warm clay', bold: true }, { text: ' for the lid' }])
  })

  it('leaves a pair of asterisks with no partner alone', () => {
    expect(parseInline('12 ** 3 and **open')).toEqual([{ text: '12 ** 3 and **open' }])
  })

  it('does not bold an empty or padded pair', () => {
    expect(parseInline('a **** b')).toEqual([{ text: 'a **** b' }])
    expect(parseInline('a ** b ** c')).toEqual([{ text: 'a ** b ** c' }])
  })
})

describe('parseRichText', () => {
  it('is nothing for nothing', () => {
    expect(parseRichText('')).toEqual([])
    expect(parseRichText('\n \n')).toEqual([])
  })

  it('starts a paragraph at a blank line, and joins lines within one', () => {
    const blocks = parseRichText('First line\nstill the first.\n\nSecond.')
    expect(blocks).toHaveLength(2)
    expect(blocks.map((block) => block.type)).toEqual(['paragraph', 'paragraph'])
    expect(blocks[0].type === 'paragraph' && text(blocks[0].content)).toBe('First line still the first.')
  })

  it('reads bulleted lists, whichever marker was used', () => {
    const blocks = parseRichText('Options:\n\n- one\n* two\n• three')
    expect(blocks.map((block) => block.type)).toEqual(['paragraph', 'bullets'])
    const list = blocks[1]
    expect(list.type === 'bullets' && list.items.map(text)).toEqual(['one', 'two', 'three'])
  })

  it('reads numbered lists and keeps the number they start at', () => {
    const blocks = parseRichText('1. first\n2) second\n3. third')
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({ type: 'numbers', start: 1 })
    expect(parseRichText('4. fourth\n5. fifth')[0]).toMatchObject({ type: 'numbers', start: 4 })
  })

  it('keeps one list when blank lines sit between its items, and ends it at other text', () => {
    const loose = parseRichText('- a\n\n- b\n\n- c')
    expect(loose).toHaveLength(1)
    expect(loose[0].type === 'bullets' && loose[0].items).toHaveLength(3)
    const ended = parseRichText('- a\n- b\n\nThat is all.')
    expect(ended.map((block) => block.type)).toEqual(['bullets', 'paragraph'])
  })

  it('starts a new list when the kind changes', () => {
    expect(parseRichText('- a\n1. b').map((block) => block.type)).toEqual(['bullets', 'numbers'])
  })

  it('carries an indented line on the item above it', () => {
    const blocks = parseRichText('- **Cost plus**: the box\n  plus a margin\n- Time based')
    expect(blocks[0].type === 'bullets' && blocks[0].items.map(text)).toEqual(['Cost plus: the box plus a margin', 'Time based'])
  })

  it('keeps bold in list items', () => {
    const blocks = parseRichText('- **Warm clay**: a soft red')
    expect(blocks[0].type === 'bullets' && blocks[0].items[0]).toEqual([{ text: 'Warm clay', bold: true }, { text: ': a soft red' }])
  })

  it('does not mistake a bold line for a bullet', () => {
    expect(parseRichText('**Note** this')[0].type).toBe('paragraph')
  })

  it('draws a heading as a bold paragraph, since headings are not part of the format', () => {
    expect(parseRichText('## Options\n\ntext')[0]).toEqual({ type: 'paragraph', content: [{ text: 'Options', bold: true }] })
  })

  it('treats anything else, including markup, as plain text', () => {
    const blocks = parseRichText('<b>hi</b> [a link](https://example.com) ![x](y.png)')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type === 'paragraph' && text(blocks[0].content)).toBe('<b>hi</b> [a link](https://example.com) ![x](y.png)')
  })

  it('reads Windows line endings', () => {
    expect(parseRichText('- a\r\n- b\r\n\r\nend').map((block) => block.type)).toEqual(['bullets', 'paragraph'])
  })
})
