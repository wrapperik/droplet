// Going to a part of a task's tools panel, the same way whichever task and whichever mode shows it: the part is found by its `data-part`, scrolled into view in
// whatever scrolls it (the panel, or the whole frame when it is one column), and its first field takes the cursor, or the part itself when it has none.

const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

// The nearest ancestor that scrolls, if any.
function scroller(element: HTMLElement): HTMLElement | null {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const overflow = getComputedStyle(parent).overflowY
    if ((overflow === 'auto' || overflow === 'scroll') && parent.scrollHeight > parent.clientHeight) return parent
  }
  return null
}

export function partElement(id: string, root: ParentNode = document): HTMLElement | null {
  for (const element of root.querySelectorAll(`[data-part="${id.replace(/["\\]/g, '')}"]`)) if (element instanceof HTMLElement) return element
  return null
}

// What takes the cursor in a part: a field that is marked wrong first, then the first field, then the part.
export function firstFieldOf(part: HTMLElement): HTMLElement {
  return part.querySelector<HTMLElement>('[aria-invalid="true"]') ?? part.querySelector<HTMLElement>('input, textarea, select') ?? part
}

// Scrolls the part into view and, unless asked not to, puts the cursor in it. False if the part is not on screen.
export function scrollToPart(id: string, { focus = true }: { focus?: boolean } = {}): boolean {
  const part = partElement(id)
  if (!part) return false
  const behavior = reducedMotion() ? 'auto' : 'smooth'
  const parent = scroller(part)
  if (parent) {
    // Scrolled inside the scroller only: scrollIntoView could also move the screen round it.
    const top = part.getBoundingClientRect().top - parent.getBoundingClientRect().top + parent.scrollTop - 8
    parent.scrollTo?.({ top: Math.max(0, top), behavior })
  } else {
    part.scrollIntoView?.({ behavior, block: 'nearest' })
  }
  if (focus) firstFieldOf(part).focus({ preventScroll: true })
  return true
}

// As `scrollToPart`, for a part that may not be drawn yet (a workspace just opened, a mode just switched): it looks again on each frame for up to a second.
export function scrollToPartWhenThere(id: string, options: { focus?: boolean } = {}, frames = 60): void {
  if (scrollToPart(id, options) || frames <= 0 || typeof requestAnimationFrame !== 'function') return
  requestAnimationFrame(() => scrollToPartWhenThere(id, options, frames - 1))
}
