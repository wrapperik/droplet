import './lift.css'

// A component picked up and carried: a copy that follows the pointer, a little larger and with a deeper shadow. It is
// a picture of the real component (cloned from the page), so it can never get out of step with it, and it is inert.

export type Rect = { left: number; top: number; width: number; height: number }

export const toRect = (r: DOMRect): Rect => ({ left: r.left, top: r.top, width: r.width, height: r.height })

const LAND_MS = 300
const LAND_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'

// Makes the copy, at the position the original is in, and raises it on the next frame so the pick-up is a transition.
export function makeLift(source: HTMLElement, origin: Rect, radius = 'var(--radius-xl)', className = ''): HTMLDivElement {
  const lift = document.createElement('div')
  lift.className = `lift ${className}`.trim()
  lift.setAttribute('aria-hidden', 'true')
  lift.setAttribute('inert', '')
  lift.style.setProperty('--lift-radius', radius)
  const inner = document.createElement('div')
  inner.className = 'lift__inner'
  const copy = source.cloneNode(true) as HTMLElement
  copy.removeAttribute('style')
  copy.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'))
  copy.querySelectorAll('[aria-describedby]').forEach((node) => node.removeAttribute('aria-describedby'))
  inner.appendChild(copy)
  lift.appendChild(inner)
  lift.style.width = `${origin.width}px`
  lift.style.height = `${origin.height}px`
  lift.style.transform = `translate3d(${origin.left}px, ${origin.top}px, 0)`
  document.body.appendChild(lift)
  requestAnimationFrame(() => lift.classList.add('lift--raised'))
  return lift
}

export const moveLift = (lift: HTMLElement, left: number, top: number) => {
  lift.style.transform = `translate3d(${left}px, ${top}px, 0)`
}

// Settles the copy onto a place (where the component now is, or where it came from), then calls `done`.
export function flyLift(lift: HTMLDivElement, to: Rect, done: () => void, reduceMotion: boolean) {
  lift.classList.remove('lift--raised')
  if (reduceMotion) {
    done()
    return
  }
  const current = new DOMMatrixReadOnly(getComputedStyle(lift).transform)
  const from = `translate3d(${current.m41}px, ${current.m42}px, 0)`
  const target = `translate3d(${to.left}px, ${to.top}px, 0)`
  const animation = lift.animate([{ transform: from }, { transform: target }], { duration: LAND_MS, easing: LAND_EASING, fill: 'forwards' })
  animation.onfinish = done
  animation.oncancel = done
}

// Lets the copy go when the component has turned into something else (a tool into a window, or back): it grows a little
// and fades as the new form arrives.
export function fadeLift(lift: HTMLDivElement, reduceMotion: boolean) {
  lift.classList.remove('lift--raised')
  if (reduceMotion) {
    lift.remove()
    return
  }
  const fade = lift.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'ease-out', fill: 'forwards' })
  fade.onfinish = () => lift.remove()
  fade.oncancel = () => lift.remove()
}
