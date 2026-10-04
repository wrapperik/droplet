import { useRef } from 'react'
import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRipple } from './useRipple.ts'

// jsdom has no layout and no animations, so both are stood in for: each window is given a place, and every animation started is kept.
type Started = { element: HTMLElement; options: KeyframeAnimationOptions; animation: { effect: { getComputedTiming: () => { currentIteration: number | null }; updateTiming: ReturnType<typeof vi.fn> }; cancel: ReturnType<typeof vi.fn>; onfinish: unknown } }
let started: Started[] = []
let iteration: number | null = 0

const place = (element: Element, left: number, top: number) => {
  element.getBoundingClientRect = () => ({ left, top, width: 100, height: 100, right: left + 100, bottom: top + 100, x: left, y: top, toJSON: () => ({}) })
}

function Canvas({ active }: { active: boolean }) {
  const ref = useRef<HTMLElement>(null)
  useRipple(ref, active)
  return (
    <main
      ref={(element) => {
        ref.current = element
        if (element) {
          place(element, 0, 0)
          element.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 600, right: 1000, bottom: 600, x: 0, y: 0, toJSON: () => ({}) })
          const items = element.querySelectorAll('.gw__item')
          place(items[0], 450, 250)
          place(items[1], 850, 250)
        }
      }}
    >
      <div className="gw__item" data-id="middle" />
      <div className="gw__item" data-id="edge" />
    </main>
  )
}

beforeEach(() => {
  started = []
  iteration = 0
  HTMLElement.prototype.animate = function (this: HTMLElement, _frames: Keyframe[] | PropertyIndexedKeyframes | null, options?: number | KeyframeAnimationOptions) {
    const animation = {
      effect: { getComputedTiming: () => ({ currentIteration: iteration }), updateTiming: vi.fn() },
      cancel: vi.fn(),
      onfinish: null as unknown,
    }
    started.push({ element: this, options: options as KeyframeAnimationOptions, animation })
    return animation as unknown as Animation
  } as unknown as typeof HTMLElement.prototype.animate
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia
})
afterEach(() => {
  delete (HTMLElement.prototype as { animate?: unknown }).animate
})

describe('useRipple', () => {
  it('does nothing until Droplet is working', () => {
    render(<Canvas active={false} />)
    expect(started).toHaveLength(0)
  })

  it('ripples every window, the one at the middle first and the one at the edge last, until it stops', () => {
    render(<Canvas active />)
    expect(started.map((item) => item.element.dataset.id)).toEqual(['middle', 'edge'])
    expect(started[0].options.delay).toBe(0)
    expect(started[1].options.delay).toBeGreaterThan(0)
    expect(started.every((item) => item.options.iterations === Infinity)).toBe(true)
  })

  it('lets each window finish the ripple it is in when Droplet stops, and cancels one that has not started', () => {
    iteration = 1
    const { rerender } = render(<Canvas active />)
    iteration = 1
    rerender(<Canvas active={false} />)
    for (const item of started) {
      expect(item.animation.effect.updateTiming).toHaveBeenCalledWith({ iterations: 2 })
      expect(item.animation.cancel).not.toHaveBeenCalled()
    }
  })

  it('cancels a ripple that is still waiting to start when Droplet stops', () => {
    iteration = null
    const { rerender } = render(<Canvas active />)
    rerender(<Canvas active={false} />)
    for (const item of started) expect(item.animation.cancel).toHaveBeenCalled()
  })

  it('does not move anything when the person has asked for reduced motion', () => {
    window.matchMedia = ((query: string) => ({ matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia
    render(<Canvas active />)
    expect(started).toHaveLength(0)
  })
})
