import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ChatGlow from './ChatGlow.tsx'
// The stylesheets are read as text, since the tests render without them. See homeCss.test.ts.
// @ts-expect-error node:fs has no types in the app's config
const { readFileSync } = (await import('node:fs')) as { readFileSync: (path: string, encoding: string) => string }
const css = readFileSync('src/components/ChatGlow.css', 'utf8')
const tokens = readFileSync('src/styles/tokens.css', 'utf8')

describe('the glow behind an empty chat', () => {
  it('is decoration: hidden from a screen reader, with three orbs', () => {
    const { container } = render(<ChatGlow />)
    const glow = container.querySelector('.chat-glow')
    expect(glow).toHaveAttribute('aria-hidden', 'true')
    expect(glow?.querySelectorAll('.chat-glow__orb')).toHaveLength(3)
    expect(glow?.textContent).toBe('')
  })

  it('moves only by transform, and filters and repaints nothing', () => {
    expect(css).not.toMatch(/filter\s*:/)
    expect(css).not.toMatch(/background-position\s*:\s*[^;]*;\s*\n?\s*animation/)
    for (const frames of css.matchAll(/@keyframes chat-glow-[a-z]+\s*\{([\s\S]*?)\n\}/g)) {
      const properties = [...frames[1].matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1])
      expect(new Set(properties)).toEqual(new Set(['transform']))
    }
  })

  it('loops without a seam: every path ends where it began, and the three take different times', () => {
    const paths = [...css.matchAll(/@keyframes (chat-glow-[a-z]+)\s*\{\s*0%,\s*100%\s*\{\s*transform:\s*([^;]+);/g)]
    expect(paths).toHaveLength(3)
    for (const [, , start] of paths) expect(start.trim()).toBe('translate(0, 0) scale(1)')
    const seconds = [...css.matchAll(/animation:\s*chat-glow-[a-z]+\s+(\d+)s\s+ease-in-out\s+infinite/g)].map((m) => Number(m[1]))
    expect(seconds).toHaveLength(3)
    expect(new Set(seconds).size).toBe(3)
  })

  it('is strong before anything is said, quiet after, and gone and paused with a workspace or the library', () => {
    expect(css).toMatch(/\.home\[data-start\] \.chat-glow\s*\{[^}]*opacity:\s*1/)
    expect(css).toMatch(/\.home:not\(\.home--docked\) \.chat-glow\s*\{[^}]*opacity:\s*0\.4/)
    expect(css).toMatch(/\.chat-glow\s*\{[^}]*opacity:\s*0;[^}]*visibility:\s*hidden/)
    expect(css).toMatch(/\.home--docked \.chat-glow__orb\s*\{[^}]*animation-play-state:\s*paused/)
  })

  it('stands still with reduced motion', () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{[\s\S]*\.chat-glow__orb\s*\{\s*animation:\s*none/)
  })

  it('takes its colours from tokens for both themes, and none from the component', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,6}\b|rgb\(/)
    for (const name of ['--glow-core', '--glow-halo', '--glow-accent']) expect(tokens.split(name + ':').length - 1).toBe(2)
  })
})
