import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { arrivalDelays, clearMarks, markTargets, MAX_DELAY_MS, prepareArrival, revealTargets, selectorFor, STEP_MS } from './arrival.ts'

describe('when each change starts', () => {
  it('is a beat apart, from the first at once', () => {
    expect(arrivalDelays(4, false)).toEqual([0, 70, 140, 210])
    expect(STEP_MS).toBeGreaterThanOrEqual(60)
    expect(STEP_MS).toBeLessThanOrEqual(80)
  })

  it('closes up when there are too many to fit, so the whole sequence stays about a second', () => {
    const delays = arrivalDelays(40, false)
    expect(delays[0]).toBe(0)
    expect(delays[39]).toBeLessThanOrEqual(MAX_DELAY_MS)
    expect(delays[39]).toBeGreaterThan(MAX_DELAY_MS - 10)
    for (let i = 1; i < delays.length; i += 1) expect(delays[i]).toBeGreaterThanOrEqual(delays[i - 1])
  })

  it('is all at once with reduced motion: no sequence', () => {
    expect(arrivalDelays(5, true)).toEqual([0, 0, 0, 0, 0])
  })

  it('has nothing to say for none or one', () => {
    expect(arrivalDelays(0, false)).toEqual([])
    expect(arrivalDelays(1, false)).toEqual([0])
  })
})

describe('where a thing is on screen', () => {
  it('is found by what kind of thing it is', () => {
    expect(selectorFor({ kind: 'block', id: 3, how: 'added' })).toBe('.palette__block[data-block-id="3"]')
    expect(selectorFor({ kind: 'line', id: 2, how: 'added' })).toBe('.lines__row[data-line-id="2"]')
    expect(selectorFor({ kind: 'item', id: 'abc', how: 'added' })).toBe('[data-item-id="abc"]')
    expect(selectorFor({ kind: 'window', id: 'preview', how: 'added' })).toBe('.gw__item[data-id="preview"]')
  })

  it('cannot be made to select something else by an id that has quotes in it', () => {
    expect(selectorFor({ kind: 'item', id: 'a"] , body [x="', how: 'added' })).toBe('[data-item-id="a] , body [x="]')
  })
})

type Animate = ReturnType<typeof vi.fn>

const reduced = (on: boolean) => vi.stubGlobal('matchMedia', (query: string) => ({ matches: on && query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {} }))
const item = (id: string, extra: Record<string, string> = {}) => {
  const element = document.createElement('div')
  element.setAttribute('data-item-id', id)
  for (const [key, value] of Object.entries(extra)) element.setAttribute(key, value)
  document.body.append(element)
  return element
}
const withAnimate = (element: HTMLElement) => {
  const animate: Animate = vi.fn(() => ({ onfinish: null, oncancel: null }))
  Object.defineProperty(element, 'animate', { value: animate, configurable: true })
  return animate
}

describe('the sequence, with motion', () => {
  beforeEach(() => {
    reduced(false)
    document.body.innerHTML = ''
  })
  afterEach(() => vi.unstubAllGlobals())

  it('lets new things emerge and gives each changed thing one ring, a beat apart and in order', () => {
    const [a, b, c] = ['a', 'b', 'c'].map((id) => item(id))
    const [animateA, animateB, animateC] = [a, b, c].map(withAnimate)
    const arrival = prepareArrival([
      { kind: 'item', id: 'a', how: 'added' },
      { kind: 'item', id: 'b', how: 'added' },
      { kind: 'item', id: 'c', how: 'changed' },
    ])
    arrival.play()
    // an added thing emerges, then rings
    expect(animateA).toHaveBeenCalledTimes(2)
    expect(animateB).toHaveBeenCalledTimes(2)
    // a changed thing only rings
    expect(animateC).toHaveBeenCalledTimes(1)
    const options = (animate: Animate, call: number) => animate.mock.calls[call][1] as KeyframeAnimationOptions
    expect([options(animateA, 0).delay, options(animateB, 0).delay]).toEqual([0, 70])
    expect(options(animateC, 0).delay).toBe(140)
    // the ring is 300 ms
    expect(options(animateC, 0).duration).toBe(300)
    // and moves nothing but its outline
    const ringFrames = animateC.mock.calls[0][0] as Keyframe[]
    expect(Object.keys(ringFrames[0]).sort()).toEqual(['outline', 'outlineOffset'])
  })

  it('emerges with opacity, blur and scale only, so a thing keeps the place it already has', () => {
    const a = item('a')
    const animate = withAnimate(a)
    prepareArrival([{ kind: 'item', id: 'a', how: 'added' }]).play()
    const frames = animate.mock.calls[0][0] as Keyframe[]
    expect(Object.keys(frames[0]).sort()).toEqual(['filter', 'opacity', 'scale'])
  })

  it('leaves colours and windows to their own way of arriving, and only rings them', () => {
    const block = document.createElement('label')
    block.className = 'palette__block'
    block.setAttribute('data-block-id', '5')
    document.body.append(block)
    const animate = withAnimate(block)
    prepareArrival([{ kind: 'block', id: 5, how: 'added' }]).play()
    expect(animate).toHaveBeenCalledTimes(1)
  })

  it('glides a moved thing from where it was, and does nothing for one that did not move', () => {
    const a = item('a')
    const animate = withAnimate(a)
    let left = 100
    a.getBoundingClientRect = () => ({ left, top: 50, width: 200, height: 100, right: left + 200, bottom: 150, x: left, y: 50, toJSON() {} })
    Object.defineProperty(a, 'offsetWidth', { value: 200 })
    const arrival = prepareArrival([{ kind: 'item', id: 'a', how: 'moved' }])
    left = 300
    arrival.play()
    const glide = (animate.mock.calls[0][0] as Keyframe[])[0]
    expect(glide.translate).toBe('-200px 0px')
    // ... and the ring follows
    expect(animate).toHaveBeenCalledTimes(2)

    const b = item('b')
    const animateB = withAnimate(b)
    b.getBoundingClientRect = () => ({ left: 10, top: 10, width: 50, height: 50, right: 60, bottom: 60, x: 10, y: 10, toJSON() {} })
    prepareArrival([{ kind: 'item', id: 'b', how: 'moved' }]).play()
    expect(animateB).toHaveBeenCalledTimes(1)
  })

  it('shows a thing that is going as a ghost where it stood, and takes the ghost away when it has gone', () => {
    const a = item('a', { class: 'note' })
    a.textContent = 'Old note'
    withAnimate(a)
    const arrival = prepareArrival([{ kind: 'item', id: 'a', how: 'removed' }])
    const ghosts = [...document.body.querySelectorAll('.note')].filter((element) => element !== a)
    expect(ghosts).toHaveLength(1)
    const ghost = ghosts[0] as HTMLElement
    expect(ghost).toHaveAttribute('aria-hidden', 'true')
    expect(ghost).not.toHaveAttribute('data-item-id')
    expect(ghost.textContent).toBe('Old note')
    const animate = withAnimate(ghost)
    arrival.play()
    const frames = animate.mock.calls[0][0] as Keyframe[]
    expect(frames[1].opacity).toBe(0)
    expect(frames[1].scale).toBe(0.9)
    const run = animate.mock.results[0].value as { onfinish: () => void }
    // the real one is taken out by the app, and the ghost goes when it has finished
    a.remove()
    run.onfinish()
    expect(document.body.querySelectorAll('.note')).toHaveLength(0)
  })

  it('drops the ghost if the arrival is cancelled', () => {
    const a = item('a', { class: 'note' })
    withAnimate(a)
    const arrival = prepareArrival([{ kind: 'item', id: 'a', how: 'removed' }])
    expect(document.body.querySelectorAll('.note')).toHaveLength(2)
    arrival.cancel()
    expect(document.body.querySelectorAll('.note')).toHaveLength(1)
  })

  it('does nothing for no changes, or for something that is not on screen', () => {
    expect(() => prepareArrival([]).play()).not.toThrow()
    expect(() => prepareArrival([{ kind: 'item', id: 'nowhere', how: 'added' }]).play()).not.toThrow()
  })
})

describe('the sequence, with reduced motion', () => {
  beforeEach(() => {
    reduced(true)
    document.body.innerHTML = ''
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('has no sequence and no movement: each thing gets a still outline at once, which goes after a second', () => {
    const [a, b] = ['a', 'b'].map((id) => item(id))
    const animates = [a, b].map(withAnimate)
    prepareArrival([
      { kind: 'item', id: 'a', how: 'added' },
      { kind: 'item', id: 'b', how: 'moved' },
    ]).play()
    expect(animates[0]).not.toHaveBeenCalled()
    expect(animates[1]).not.toHaveBeenCalled()
    for (const element of [a, b]) {
      expect(element.style.outline).toContain('2px solid')
    }
    vi.advanceTimersByTime(999)
    expect(a.style.outline).toContain('2px solid')
    vi.advanceTimersByTime(2)
    expect(a.style.outline).toBe('')
    expect(b.style.outline).toBe('')
  })

  it('makes no ghosts', () => {
    const a = item('a', { class: 'note' })
    withAnimate(a)
    prepareArrival([{ kind: 'item', id: 'a', how: 'removed' }])
    expect(document.body.querySelectorAll('.note')).toHaveLength(1)
  })
})

describe('Show me', () => {
  beforeEach(() => {
    reduced(false)
    document.body.innerHTML = ''
  })
  afterEach(() => vi.unstubAllGlobals())

  it('brings the first thing that changed into view and rings each in turn, without making anything emerge or glide', () => {
    const [a, b] = ['a', 'b'].map((id) => item(id))
    const animates = [a, b].map(withAnimate)
    const scrolled = vi.fn()
    a.scrollIntoView = scrolled
    const found = revealTargets([
      { kind: 'item', id: 'a', how: 'added' },
      { kind: 'item', id: 'b', how: 'moved' },
      { kind: 'item', id: 'gone', how: 'removed' },
    ])
    expect(found).toBe(2)
    expect(scrolled).toHaveBeenCalledWith({ block: 'center', inline: 'center', behavior: 'smooth' })
    expect(animates[0]).toHaveBeenCalledTimes(1)
    expect(animates[1]).toHaveBeenCalledTimes(1)
    expect((animates[1].mock.calls[0][1] as KeyframeAnimationOptions).delay).toBe(70)
  })

  it('jumps instead of scrolling smoothly with reduced motion, and outlines instead of ringing', () => {
    reduced(true)
    const a = item('a')
    const animate = withAnimate(a)
    const scrolled = vi.fn()
    a.scrollIntoView = scrolled
    revealTargets([{ kind: 'item', id: 'a', how: 'changed' }])
    expect(scrolled).toHaveBeenCalledWith({ block: 'center', inline: 'center', behavior: 'auto' })
    expect(animate).not.toHaveBeenCalled()
    expect(a.style.outline).toContain('2px solid')
  })

  it('finds nothing and breaks nothing when what changed is not on screen', () => {
    expect(revealTargets([{ kind: 'item', id: 'nowhere', how: 'added' }])).toBe(0)
    expect(revealTargets([])).toBe(0)
  })
})

describe('the marks Show me leaves', () => {
  it('marks each thing that changed and is still there, brings the first into view, and clears on asking', async () => {
    document.body.innerHTML = '<input data-field="client.name" /><div class="lines__row" data-line-id="2"></div>'
    const field = document.querySelector<HTMLElement>('[data-field="client.name"]')!
    field.scrollIntoView = vi.fn()
    const found = await markTargets([
      { kind: 'field', id: 'client.name', how: 'changed' },
      { kind: 'line', id: 2, how: 'added' },
      { kind: 'line', id: 9, how: 'removed' },
    ])
    expect(found).toBe(2)
    expect(field).toHaveAttribute('data-shown')
    expect(document.querySelector('.lines__row')).toHaveAttribute('data-shown')
    expect(field.scrollIntoView).toHaveBeenCalled()
    clearMarks()
    expect(document.querySelectorAll('[data-shown]')).toHaveLength(0)
  })

  it('waits for a thing that is not on screen yet, such as a step of the guide that is coming in', async () => {
    document.body.innerHTML = ''
    const marking = markTargets([{ kind: 'field', id: 'details.terms', how: 'changed' }])
    const select = document.createElement('select')
    select.setAttribute('data-field', 'details.terms')
    setTimeout(() => document.body.append(select), 50)
    expect(await marking).toBe(1)
    expect(select).toHaveAttribute('data-shown')
    clearMarks()
  })
})
