import { describe, expect, it } from 'vitest'
import type { BoardItem } from './boardTypes.ts'
import { boardSuggestions, colourSuggestions, lineSuggestions } from './inlineAi.ts'

const note = (id: string, text = 'Gift boxes'): BoardItem => ({ id, kind: 'note', x: 0, y: 0, w: 200, h: 180, text, colour: 'yellow', author: 'you' })
const frame: BoardItem = { id: 'f', kind: 'frame', x: 0, y: 0, w: 400, h: 300, title: 'Names', colour: 'white' }
const arrow: BoardItem = { id: 'a', kind: 'connector', from: { x: 0, y: 0 }, to: { x: 10, y: 10 }, style: 'straight', head: 'end', text: '' }
const labels = (items: BoardItem[]) => boardSuggestions(items).map((suggestion) => suggestion.label)

describe('what is offered for a selection on the board', () => {
  it('for one note: expand, alternatives and a shorter version', () => {
    expect(labels([note('a')])).toEqual(['Expand', 'Alternatives', 'Make it shorter'])
  })

  it('for several notes: group, tidy and find the theme, counting them', () => {
    expect(labels([note('a'), note('b'), note('c')])).toEqual(['Group', 'Tidy', 'Find the theme'])
    expect(boardSuggestions([note('a'), note('b'), note('c')])[0].text).toBe('Group these 3 notes by theme')
  })

  it('for a frame: fill the empty prompts, summarise and tidy', () => {
    expect(labels([frame])).toEqual(['Fill the empty prompts', 'Summarise', 'Tidy'])
  })

  it('for an empty note, an arrow, or a mix: nothing', () => {
    expect(labels([note('a', '')])).toEqual([])
    expect(labels([arrow])).toEqual([])
    expect(labels([note('a'), frame])).toEqual([])
    expect(labels([])).toEqual([])
  })

  it('are plain requests, each a sentence the founder could have written', () => {
    for (const set of [[note('a')], [note('a'), note('b')], [frame]]) for (const suggestion of boardSuggestions(set)) expect(suggestion.text.length).toBeGreaterThan(10)
  })
})

describe('what is offered for a colour', () => {
  it('names the colour by its place, and offers warmer, calmer and a pair that passes', () => {
    const offered = colourSuggestions(3)
    expect(offered.map((suggestion) => suggestion.label)).toEqual(['Warmer', 'Calmer', 'Find a pair that passes'])
    expect(offered[0].text).toBe('Make colour 3 warmer')
    expect(offered[2].text).toMatch(/Colour 3/)
  })
})

describe('what is offered for an invoice line', () => {
  it('splits it or checks its description, and never names a price', () => {
    const offered = lineSuggestions(2, 'Gift boxes and delivery')
    expect(offered.map((suggestion) => suggestion.label)).toEqual(['Split', 'Check the description'])
    expect(offered[0].text).toContain('line 2 (“Gift boxes and delivery”)')
    expect(offered[0].text).toContain('Leave the prices for me')
    for (const suggestion of offered) expect(suggestion.text).not.toMatch(/\bR\s?\d|\d\s?rand/i)
  })

  it('cuts a long description, and copes with none', () => {
    expect(lineSuggestions(1, 'x'.repeat(200))[0].text.length).toBeLessThan(200)
    expect(lineSuggestions(1, '')[0].text).toBe('Split line 1 into separate lines. Leave the prices for me to fill in')
  })
})
