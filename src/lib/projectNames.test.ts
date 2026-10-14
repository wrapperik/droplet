import { describe, expect, it } from 'vitest'
import { checkProjectName, MAX_PROJECT_NAME, nameKey } from './projectNames.ts'

const mine = [
  { id: 'a', name: 'Kindred Gifting' },
  { id: 'b', name: 'Pet sitting' },
]

describe('checkProjectName', () => {
  it('accepts a name and gives it back tidied', () => {
    expect(checkProjectName('  Plant   nursery ', mine)).toEqual({ ok: true, name: 'Plant nursery' })
  })

  it('refuses an empty name', () => {
    expect(checkProjectName('   ', mine)).toEqual({ ok: false, error: 'Give the project a name.' })
  })

  it('accepts 80 characters and refuses more, saying the limit', () => {
    expect(checkProjectName('x'.repeat(MAX_PROJECT_NAME), mine).ok).toBe(true)
    expect(checkProjectName('x'.repeat(MAX_PROJECT_NAME + 1), mine)).toEqual({ ok: false, error: 'Use 80 characters or fewer.' })
  })

  it('refuses a name the founder already has, ignoring capitals and spaces', () => {
    expect(checkProjectName('kindredgifting', mine)).toEqual({ ok: false, error: 'You already have a project with that name.' })
    expect(checkProjectName(' PET   SITTING ', mine).ok).toBe(false)
  })

  it('lets a project keep its own name, or change only its capitals, when it is renamed', () => {
    expect(checkProjectName('Kindred Gifting', mine, 'a').ok).toBe(true)
    expect(checkProjectName('kindred gifting', mine, 'a')).toEqual({ ok: true, name: 'kindred gifting' })
    expect(checkProjectName('Pet sitting', mine, 'a').ok).toBe(false)
  })
})

describe('nameKey', () => {
  it('ignores capitals and every kind of space', () => {
    expect(nameKey(' A b\tC ')).toBe('abc')
  })
})
