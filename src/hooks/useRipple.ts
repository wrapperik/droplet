import { useEffect, type RefObject } from 'react'
import { RIPPLE_LOOP_MS, rippleDelays, rippleKeyframes } from '../lib/ripple.ts'

// What counts as a window in the workspace: on the grid, or stacked when the screen is narrow.
const WINDOWS = '.gw__item, .gw__stack-item'

// While `active`, ripples the windows inside `ref`: each one goes soft and comes back into focus, starting from the centre and moving
// outward, then stillness, then again. When `active` ends, each window finishes the ripple it is in, so nothing snaps back. With
// reduced motion nothing moves.
export function useRipple(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const root = ref.current
    if (!active || !root || typeof root.animate !== 'function') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    const windows = [...root.querySelectorAll<HTMLElement>(WINDOWS)]
    const box = root.getBoundingClientRect()
    const centres = windows.map((element) => {
      const rect = element.getBoundingClientRect()
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    })
    const delays = rippleDelays(centres, { x: box.left + box.width / 2, y: box.top + box.height / 2 })

    const running = windows.map((element, index) =>
      element.animate(rippleKeyframes(), { duration: RIPPLE_LOOP_MS, delay: delays[index], iterations: Infinity }),
    )

    return () => {
      for (const animation of running) {
        const { currentIteration } = animation.effect?.getComputedTiming() ?? {}
        // Still waiting to start its first ripple: it never begins. Otherwise it finishes the one it is in.
        if (currentIteration === null || currentIteration === undefined) animation.cancel()
        else {
          animation.effect?.updateTiming({ iterations: currentIteration + 1 })
          animation.onfinish = () => animation.cancel()
        }
      }
    }
    // The windows are measured when the ripple starts, which is when the question is sent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])
}
