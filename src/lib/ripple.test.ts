import { describe, expect, it } from 'vitest'
import { RIPPLE_SPREAD_MS, rippleDelays, rippleKeyframes } from './ripple.ts'

describe('rippleDelays', () => {
  const middle = { x: 500, y: 300 }

  it('starts the window at the middle at once and the farthest last, with the others between by distance', () => {
    const delays = rippleDelays([{ x: 500, y: 300 }, { x: 600, y: 300 }, { x: 900, y: 300 }], middle)
    expect(delays[0]).toBe(0)
    expect(delays[2]).toBe(RIPPLE_SPREAD_MS)
    expect(delays[1]).toBe(Math.round(RIPPLE_SPREAD_MS * 0.25))
  })

  it('starts windows at the same distance together, whichever side they are on', () => {
    const [left, right, above] = rippleDelays([{ x: 300, y: 300 }, { x: 700, y: 300 }, { x: 500, y: 100 }, { x: 500, y: 700 }], middle)
    expect(left).toBe(right)
    expect(above).toBe(left)
  })

  it('starts everything at once when everything is at the middle, or there is nothing', () => {
    expect(rippleDelays([{ x: 500, y: 300 }, { x: 500, y: 300 }], middle)).toEqual([0, 0])
    expect(rippleDelays([], middle)).toEqual([])
  })
})

describe('rippleKeyframes', () => {
  it('goes soft and comes back to sharp, and is still for the rest of the loop', () => {
    const frames = rippleKeyframes()
    expect(frames[0].filter).toBe('blur(0px)')
    expect(frames.find((frame) => frame.filter !== 'blur(0px)')).toBeDefined()
    expect(frames[frames.length - 1]).toMatchObject({ filter: 'blur(0px)', offset: 1 })
    // only the blur moves: where a window is belongs to the grid
    for (const frame of frames) expect(Object.keys(frame).filter((key) => !['filter', 'offset', 'easing'].includes(key))).toEqual([])
  })
})
