import { afterEach, describe, expect, it, vi } from 'vitest'
import { firstFieldOf, partElement, scrollToPart } from './partNav.ts'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('going to a part of the panel', () => {
  it('finds a part by its data-part', () => {
    document.body.innerHTML = '<section data-part="client"><input id="a" /></section><section data-part="vat"></section>'
    expect(partElement('client')?.getAttribute('data-part')).toBe('client')
    expect(partElement('nope')).toBeNull()
  })

  it('puts the cursor in the first field of the part, or in the part when it has none', () => {
    document.body.innerHTML = '<section data-part="client" tabindex="-1"><input id="a" /><input id="b" /></section><section data-part="review" tabindex="-1"><p>Nothing to type</p></section>'
    expect(scrollToPart('client')).toBe(true)
    expect(document.activeElement?.id).toBe('a')
    expect(scrollToPart('review')).toBe(true)
    expect(document.activeElement).toBe(partElement('review'))
  })

  it('prefers a field that is marked wrong', () => {
    document.body.innerHTML = '<section data-part="lines"><input id="a" /><input id="b" aria-invalid="true" /></section>'
    expect(firstFieldOf(partElement('lines')!).id).toBe('b')
  })

  it('scrolls the part into view without taking the cursor when asked not to', () => {
    document.body.innerHTML = '<section data-part="client" tabindex="-1"><input id="a" /></section>'
    const part = partElement('client')!
    const scrollIntoView = vi.fn()
    part.scrollIntoView = scrollIntoView
    expect(scrollToPart('client', { focus: false })).toBe(true)
    expect(scrollIntoView).toHaveBeenCalled()
    expect(document.activeElement).toBe(document.body)
  })

  it('says so when the part is not there', () => {
    expect(scrollToPart('client')).toBe(false)
  })
})
