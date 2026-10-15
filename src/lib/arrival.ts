import type { FocusTarget } from '../compose/receipt.ts'

// How the changes a reply made arrive on screen, and how Show me finds them again. The changes appear in the order the actions were applied: new
// things emerge a beat apart, moved things glide from where they were, removed things shrink and fade where they stood, and each thing that
// changed gets one soft ring in the focus colour that spreads and fades. The whole sequence is held to about a second.
//
// With reduced motion there is no sequence and no movement: each thing gets a plain outline for a second instead.

export const STEP_MS = 70
// The last thing starts no later than this after the first, so the sequence, with its last ring, ends in about a second.
export const MAX_DELAY_MS = 700
export const RING_MS = 300
export const EMERGE_MS = 220
export const OUTLINE_MS = 1000
const FALLBACK_FOCUS = '#1F8FE0'

// When each of `count` things starts, in order: a beat apart, closed up when there are too many to fit in the time, and all at once with reduced motion.
export function arrivalDelays(count: number, reduced: boolean): number[] {
  if (reduced || count <= 1) return Array.from({ length: Math.max(0, count) }, () => 0)
  const step = Math.min(STEP_MS, MAX_DELAY_MS / (count - 1))
  return Array.from({ length: count }, (_, index) => Math.round(index * step))
}

// Where a thing is on screen. A colour, a line of the invoice, an item of the board or a part of the panel each carry an attribute that says which they are.
export function selectorFor(target: FocusTarget): string {
  const id = String(target.id).replace(/["\\]/g, '')
  switch (target.kind) {
    case 'block':
      return `.palette__block[data-block-id="${id}"]`
    case 'line':
      return `.lines__row[data-line-id="${id}"]`
    case 'item':
      return `[data-item-id="${id}"]`
    case 'part':
      return `[data-part="${id}"]`
    case 'field':
      return `[data-field="${id}"]`
  }
}

const find = (target: FocusTarget, root: ParentNode): HTMLElement | null => {
  // A board arrow is drawn as a line and has no box to outline, so the first thing with a box is the one.
  for (const element of root.querySelectorAll(selectorFor(target))) if (element instanceof HTMLElement) return element
  return null
}

export const prefersReducedMotion = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const canAnimate = (element: HTMLElement) => typeof element.animate === 'function'

const focusColour = () => (typeof document !== 'undefined' ? getComputedStyle(document.documentElement).getPropertyValue('--focus').trim() : '') || FALLBACK_FOCUS

// One ring on a thing: a line round it in the focus colour that spreads out and fades in 300 ms. With reduced motion, a still outline for a second.
function ring(element: HTMLElement, delay: number, reduced: boolean) {
  const colour = focusColour()
  if (reduced || !canAnimate(element)) {
    const before = { outline: element.style.outline, offset: element.style.outlineOffset }
    element.style.outline = `2px solid ${colour}`
    element.style.outlineOffset = '2px'
    setTimeout(() => {
      element.style.outline = before.outline
      element.style.outlineOffset = before.offset
    }, OUTLINE_MS)
    return
  }
  element.animate(
    [
      { outline: `2px solid ${colour}`, outlineOffset: '0px' },
      { outline: '2px solid transparent', outlineOffset: '10px' },
    ],
    { duration: RING_MS, delay, easing: 'ease-out' },
  )
}

// A thing that was not there before comes into focus: blurred and a little small, easing to its own size. Nothing but opacity, blur and scale
// moves, so it cannot fight the position the thing already has.
function emerge(element: HTMLElement, delay: number) {
  element.animate(
    [
      { opacity: 0, scale: 0.94, filter: 'blur(4px)' },
      { opacity: 1, scale: 1, filter: 'blur(0px)' },
    ],
    { duration: EMERGE_MS, delay, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'backwards' },
  )
}

// A thing that moved glides from where it was to where it is, measured on screen and turned back into the thing's own units (a board can be zoomed).
function glide(element: HTMLElement, from: DOMRect, delay: number) {
  const now = element.getBoundingClientRect()
  const zoom = element.offsetWidth > 0 ? now.width / element.offsetWidth || 1 : 1
  const dx = (from.left - now.left) / zoom
  const dy = (from.top - now.top) / zoom
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return
  element.animate([{ translate: `${dx}px ${dy}px` }, { translate: '0px 0px' }], { duration: 300, delay, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'backwards' })
}

export type Arrival = { play: () => void; cancel: () => void }

const NONE: Arrival = { play: () => undefined, cancel: () => undefined }

// Called before the screen changes, while the old things are still there: it takes where the moved things are, and a ghost of each thing that is about to
// go, which shrinks and fades where it stood. `play` is called once the screen has changed, and runs the sequence.
export function prepareArrival(targets: FocusTarget[], root: ParentNode = document): Arrival {
  if (targets.length === 0 || typeof document === 'undefined') return NONE
  const reduced = prefersReducedMotion()
  const delays = arrivalDelays(targets.length, reduced)
  const from = new Map<number, DOMRect>()
  const ghosts: { element: HTMLElement; delay: number }[] = []

  targets.forEach((target, index) => {
    const element = find(target, root)
    if (!element) return
    if (target.how === 'moved') from.set(index, element.getBoundingClientRect())
    // A removed item or line is shown going. Colours have their own way of leaving.
    if (target.how === 'removed' && (target.kind === 'item' || target.kind === 'line') && !reduced && canAnimate(element) && element.parentElement) {
      const ghost = element.cloneNode(true) as HTMLElement
      ghost.setAttribute('aria-hidden', 'true')
      ghost.removeAttribute('data-item-id')
      ghost.removeAttribute('data-line-id')
      ghost.style.pointerEvents = 'none'
      element.after(ghost)
      ghosts.push({ element: ghost, delay: delays[index] })
    }
  })

  let live = true
  return {
    play() {
      if (!live) return
      for (const { element, delay } of ghosts) {
        const height = element.offsetHeight
        const gone = element.animate(
          [
            { opacity: 1, scale: 1, maxHeight: `${height}px` },
            { opacity: 0, scale: 0.9, maxHeight: isRow(element) ? '0px' : `${height}px` },
          ],
          { duration: 240, delay, easing: 'ease-in', fill: 'forwards' },
        )
        gone.onfinish = () => element.remove()
        gone.oncancel = () => element.remove()
      }
      targets.forEach((target, index) => {
        if (target.how === 'removed') return
        const element = find(target, root)
        if (!element) return
        if (!reduced && canAnimate(element)) {
          // Colours already arrive in their own way, so only items and lines emerge here.
          if (target.how === 'added' && (target.kind === 'item' || target.kind === 'line')) emerge(element, delays[index])
          const was = from.get(index)
          if (target.how === 'moved' && was) glide(element, was, delays[index])
        }
        ring(element, delays[index], reduced)
      })
    },
    cancel() {
      live = false
      for (const { element } of ghosts) element.remove()
    },
  }
}

// A row of the invoice keeps its place in the list while it goes, so it closes up. Anything else leaves where it stood.
const isRow = (element: HTMLElement) => element.classList.contains('lines__row')

// Show me, kept: each thing that changed gets a blue border that draws in and then stays (`data-shown`, styled in global.css), until the founder sends
// another message or presses somewhere else on the screen (`clearMarks`). What it marks may not be on screen yet (a step of the guide coming in), so it looks again on each frame for up to a second. The first one found is brought into view. Says how many it found.
const marked = new Set<HTMLElement>()
const MARK_WAIT_MS = 1000

export function clearMarks() {
  for (const element of marked) element.removeAttribute('data-shown')
  marked.clear()
}

export function markTargets(targets: FocusTarget[], root: ParentNode = document): Promise<number> {
  clearMarks()
  const shown = targets.filter((entry) => entry.how !== 'removed')
  const started = Date.now()
  return new Promise((resolve) => {
    const look = () => {
      const elements = shown.map((entry) => find(entry, root)).filter((element): element is HTMLElement => element !== null)
      const waited = Date.now() - started
      if (elements.length < shown.length && waited < MARK_WAIT_MS && typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(look)
        return
      }
      for (const element of elements) {
        element.setAttribute('data-shown', '')
        marked.add(element)
      }
      elements[0]?.scrollIntoView?.({ block: 'center', inline: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
      resolve(elements.length)
    }
    look()
  })
}

// Show me: the first thing that changed is brought into view, and each thing gets its ring in turn. Nothing moves or emerges: it is all there already.
export function revealTargets(targets: FocusTarget[], root: ParentNode = document) {
  const reduced = prefersReducedMotion()
  const shown = targets.filter((entry) => entry.how !== 'removed')
  const elements = shown.map((entry) => find(entry, root))
  elements.find((element) => element !== null)?.scrollIntoView?.({ block: 'center', inline: 'center', behavior: reduced ? 'auto' : 'smooth' })
  const delays = arrivalDelays(shown.length, reduced)
  elements.forEach((element, index) => {
    if (element) ring(element, delays[index], reduced)
  })
  return elements.filter((element) => element !== null).length
}
