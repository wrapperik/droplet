import { describe, expect, it } from 'vitest'
import { FIRST_PROJECT_NAME, INTRO_SLIDES, NAME_STEP, planFirstProject } from './onboarding.ts'

const words = (text: string) => text.trim().split(/\s+/).length

describe('the introduction', () => {
  it('says each thing in few words: a short title, a short lead, short points', () => {
    for (const slide of [...INTRO_SLIDES, { ...NAME_STEP, points: undefined }]) {
      expect(words(slide.title), slide.title).toBeLessThanOrEqual(10)
      if (slide.lead) expect(words(slide.lead), slide.lead).toBeLessThanOrEqual(16)
      for (const point of slide.points ?? []) expect(words(point), point).toBeLessThanOrEqual(12)
      expect(words(slide.label)).toBeLessThanOrEqual(3)
    }
    expect(INTRO_SLIDES.length).toBeLessThanOrEqual(5)
  })

  it('follows the writing rules: no dashes standing in for punctuation', () => {
    const all = JSON.stringify([INTRO_SLIDES, NAME_STEP])
    expect(all).not.toMatch(/[–—]/)
  })

  it('has one slide for each thing it must say, in order: what it is, how it differs, what it does, who decides', () => {
    expect(INTRO_SLIDES.map((slide) => slide.id)).toEqual(['what', 'different', 'does', 'control'])
    expect(new Set(INTRO_SLIDES.map((slide) => slide.label)).size).toBe(INTRO_SLIDES.length)
  })
})

describe('naming the first project', () => {
  const first = { id: 'p1', name: FIRST_PROJECT_NAME }

  it('touches nothing when no name was typed', () => {
    expect(planFirstProject([], '   ')).toEqual({ kind: 'keep' })
    expect(planFirstProject([first], '')).toEqual({ kind: 'keep' })
  })

  it('makes the first project for a founder who has none, with the name tidied', () => {
    expect(planFirstProject([], '  Kindred   Gifting ')).toEqual({ kind: 'create', name: 'Kindred Gifting' })
  })

  it('renames the project that was made for them, so there is not an empty one beside it', () => {
    expect(planFirstProject([first], 'Kindred Gifting')).toEqual({ kind: 'rename', id: 'p1', name: 'Kindred Gifting' })
  })

  it('makes a new one when they already have projects of their own, and not a second one of the same name', () => {
    const mine = [{ id: 'p1', name: 'Pet sitting' }, first]
    expect(planFirstProject(mine, 'Kindred Gifting')).toEqual({ kind: 'create', name: 'Kindred Gifting' })
    expect(planFirstProject(mine, 'pet sitting')).toEqual({ kind: 'keep' })
  })
})
