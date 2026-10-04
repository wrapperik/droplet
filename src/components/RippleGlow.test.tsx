import { fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import RippleGlow from './RippleGlow.tsx'

afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia
})

// jsdom has no animations, so the end of one is sent by hand, under the name React listens to there as well.
const animationEnds = (element: Element) => {
  for (const name of ['animationend', 'webkitAnimationEnd']) fireEvent(element, new Event(name, { bubbles: true }))
}

describe('RippleGlow', () => {
  it('shows nothing until Droplet is working', () => {
    const { container } = render(<RippleGlow active={false} />)
    expect(container.querySelector('.glow')).toBeNull()
  })

  it('drifts a few orbs while Droplet works, and is decoration', () => {
    const { container } = render(<RippleGlow active />)
    const glow = container.querySelector('.glow')!
    expect(glow).toHaveAttribute('aria-hidden', 'true')
    expect(glow).toHaveAttribute('data-state', 'on')
    expect(glow.querySelectorAll('.glow__orb')).toHaveLength(4)
  })

  it('fades out when Droplet stops, and is gone once it has faded', () => {
    const { container, rerender } = render(<RippleGlow active />)
    rerender(<RippleGlow active={false} />)
    const glow = container.querySelector('.glow')!
    expect(glow).toHaveAttribute('data-state', 'off')
    // an orb's own animation never ends, but an event from one must not remove the layer
    animationEnds(glow.querySelector('.glow__orb')!)
    expect(container.querySelector('.glow')).not.toBeNull()
    animationEnds(glow)
    expect(container.querySelector('.glow')).toBeNull()
  })

  it('stays when an animation on the layer ends while Droplet is still working', () => {
    const { container } = render(<RippleGlow active />)
    animationEnds(container.querySelector('.glow')!)
    expect(container.querySelector('.glow')).not.toBeNull()
  })

  it('comes back, at full light, if Droplet is asked again before it has gone', () => {
    const { container, rerender } = render(<RippleGlow active />)
    rerender(<RippleGlow active={false} />)
    rerender(<RippleGlow active />)
    expect(container.querySelector('.glow')).toHaveAttribute('data-state', 'on')
  })

  it('is not drawn at all when the person has asked for reduced motion', () => {
    window.matchMedia = ((query: string) => ({ matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia
    const { container } = render(<RippleGlow active />)
    expect(container.querySelector('.glow')).toBeNull()
  })
})
