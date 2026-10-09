import { describe, expect, it } from 'vitest'
import { easeOutBack, flightFrame, type Rect } from './flight.ts'

const bar: Rect = { left: 300, top: 600, width: 800, height: 64 }
const target: Rect = { left: 820, top: 120, width: 240, height: 44 }

describe('a message coming out of the bar', () => {
  it('eases out, passes the end a little and settles on it', () => {
    expect(easeOutBack(0)).toBeCloseTo(0, 5)
    expect(easeOutBack(1)).toBeCloseTo(1, 5)
    const peak = Math.max(...Array.from({ length: 101 }, (_, i) => easeOutBack(i / 100)))
    expect(peak).toBeGreaterThan(1)
    expect(peak).toBeLessThan(1.12)
    expect(easeOutBack(-1)).toBe(0)
    expect(easeOutBack(2)).toBeCloseTo(1, 5)
  })

  it('starts as a thin sliver on the top of the bar, mostly behind it, with no words showing', () => {
    const start = flightFrame(0, bar, target, 24)
    expect(start.top).toBe(bar.top + 2)
    expect(start.height).toBe(18)
    expect(start.width).toBeLessThan(bar.width)
    expect(start.left).toBeGreaterThan(bar.left)
    // all but a sliver is behind the bar's top edge
    expect(start.clipBottom).toBeGreaterThan(start.height - 4)
    expect(start.textOpacity).toBe(0)
  })

  it('ends exactly on the message, with its own corners, nothing hidden and all of its words', () => {
    const end = flightFrame(1, bar, target, 24)
    expect(end).toMatchObject({ left: target.left, top: target.top, width: target.width, height: target.height, radius: 24, clipBottom: 0, textOpacity: 1 })
  })

  it('rises out of the bar: the part above its top edge grows as it goes', () => {
    const visible = (t: number) => {
      const frame = flightFrame(t, bar, target, 24)
      return frame.height - frame.clipBottom
    }
    expect(visible(0)).toBeLessThan(6)
    expect(visible(0.3)).toBeGreaterThan(visible(0.05))
    expect(visible(0.6)).toBeGreaterThan(visible(0.3))
  })

  it('has corners that start as a pill and end as the message\'s own, never rounder than either', () => {
    expect(flightFrame(0, bar, target, 24).radius).toBe(9)
    for (let i = 0; i <= 20; i++) {
      const frame = flightFrame(i / 20, bar, target, 24)
      expect(frame.radius).toBeLessThanOrEqual(Math.max(frame.height / 2, 24) + 1e-9)
      expect(frame.radius).toBeGreaterThanOrEqual(0)
    }
  })

  it('follows a bar that is moving: the start is worked out from where the bar is now', () => {
    const lower = flightFrame(0, { ...bar, top: 900 }, target, 24)
    expect(lower.top).toBe(902)
  })

  it('shows its words late: none at first, all by two thirds of the way', () => {
    expect(flightFrame(0.1, bar, target, 24).textOpacity).toBe(0)
    expect(flightFrame(0.4, bar, target, 24).textOpacity).toBeCloseTo(0.5, 5)
    expect(flightFrame(0.7, bar, target, 24).textOpacity).toBe(1)
  })
})
