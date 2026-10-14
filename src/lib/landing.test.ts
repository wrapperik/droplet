import { describe, expect, it } from 'vitest'
import { STARTER_PALETTE } from '../compose/fallback.ts'
import { contrastRatio, hexToRgb } from './colour.ts'
import { chatReply, COMPARE, DOES, FOOTER, HERO, NOT_YET, SIGN_IN_PATH, SIGN_UP_PATH, starterContrast, TRUST } from './landing.ts'

const words = (text: string) => text.trim().split(/\s+/).length

describe('the landing copy', () => {
  it('says each thing in few words', () => {
    expect(words(HERO.title)).toBeLessThanOrEqual(10)
    expect(words(HERO.lead)).toBeLessThanOrEqual(20)
    for (const title of [COMPARE.title, DOES.title, TRUST.title, NOT_YET.title]) expect(words(title), title).toBeLessThanOrEqual(10)
    for (const text of [COMPARE.chat.text, COMPARE.droplet.text, ...DOES.live.map((item) => item.text)]) expect(words(text), text).toBeLessThanOrEqual(22)
    for (const point of [...TRUST.points, ...NOT_YET.points]) expect(words(point), point).toBeLessThanOrEqual(20)
  })

  it('follows the writing rules: no dashes standing in for punctuation, no marketing words', () => {
    const all = JSON.stringify([HERO, COMPARE, DOES, TRUST, NOT_YET, FOOTER, chatReply()])
    expect(all).not.toMatch(/[–—]/)
    expect(all).not.toMatch(/revolutionary|seamless|cutting-edge|game-changing|supercharge|unleash/i)
  })

  it('promises only the three workspaces that exist, and names logos and client emails as next', () => {
    expect(DOES.live.map((item) => item.id)).toEqual(['ideation', 'brand', 'invoice'])
    expect(DOES.next.map((item) => item.id)).toEqual(['logo', 'correspondence'])
  })

  it('declares who it is not for yet, including screen readers and fine motor control', () => {
    const text = NOT_YET.points.join(' ')
    expect(text).toMatch(/teams/i)
    expect(text).toMatch(/designer/i)
    expect(text).toMatch(/screen readers/i)
    expect(text).toMatch(/fine motor control/i)
  })

  it('sends the buttons to the sign-in screen, in the mode that suits', () => {
    expect(SIGN_IN_PATH).toBe('/sign-in')
    expect(SIGN_UP_PATH).toBe('/sign-in?mode=sign-up')
  })
})

describe('the before and after picture', () => {
  it('works the contrast out with the app\'s own function, from the starter palette', () => {
    const hexOf = (role: string) => STARTER_PALETTE.find((colour) => colour.role === role)!.hex
    const expected = contrastRatio(hexToRgb(hexOf('text')), hexToRgb(hexOf('background')))
    expect(starterContrast().ratio).toBe(expected)
    expect(starterContrast().level).toBe('AAA')
  })

  it('has the chat reply name the same colours as the palette', () => {
    for (const colour of STARTER_PALETTE) expect(chatReply()).toContain(colour.hex.toUpperCase())
  })
})
