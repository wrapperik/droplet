import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
// @ts-expect-error node:fs has no types in the app's config
const { readFileSync } = (await import('node:fs')) as { readFileSync: (path: string, encoding: string) => string }
import { ACTING_MS, ACTING_REDUCED_MS, actingDelay } from '../lib/acting.ts'
import ActingOverlay from './ActingOverlay.tsx'

describe('the screen while Droplet acts', () => {
  it('draws nine squares over a soft screen while active, as decoration', () => {
    const { container } = render(<ActingOverlay active />)
    const layer = container.querySelector('.acting')
    expect(layer).toHaveAttribute('aria-hidden', 'true')
    expect(layer?.querySelectorAll('.acting__square')).toHaveLength(9)
  })

  it('draws nothing while Droplet is not acting', () => {
    const { container } = render(<ActingOverlay active={false} />)
    expect(container.querySelector('.acting')).toBeNull()
  })

  it('blurs what is behind it, in the loader colour of the theme, and holds still with reduced motion', () => {
    const css = readFileSync('src/components/ActingOverlay.css', 'utf8')
    expect(css).toMatch(/\.acting \{[^}]*backdrop-filter:\s*blur\(6px\)/)
    expect(css).toMatch(/\.acting__square \{[^}]*background:\s*var\(--loader\)/)
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*\.acting__square\s*\{\s*animation:\s*none/)
    expect(css).not.toMatch(/#[0-9a-f]{3,6}\b/i)
  })

  it('pauses long enough to be seen, less with reduced motion, and not at all in a test', () => {
    expect(ACTING_MS).toBeGreaterThan(ACTING_REDUCED_MS)
    expect(actingDelay()).toBe(0)
  })
})
