import { useCallback, useRef } from 'react'

// Where the cursor goes in Guide mode, the same for every task. When the founder moves to a part, its first field takes the cursor as soon as the part is on screen
// (after the last one has gone), never when the guide first opens: the message bar keeps the cursor then. And when Continue is pressed with something missing, the
// first thing wrong (or the first field) takes it.
export function useGuideCard() {
  const cardEl = useRef<HTMLDivElement | null>(null)
  const moved = useRef(false)

  const cardRef = useCallback((node: HTMLDivElement | null) => {
    cardEl.current = node
    if (!node || !moved.current) return
    moved.current = false
    // A field first (the heading comes before them on the page), or the part itself when it has none.
    const field = node.querySelector<HTMLElement>('input, textarea, select') ?? node.querySelector<HTMLElement>('[data-part]') ?? node
    field.focus({ preventScroll: true })
  }, [])

  // The next card to arrive takes the cursor.
  const markMoved = useCallback(() => {
    moved.current = true
  }, [])

  const focusProblem = useCallback(() => {
    cardEl.current?.querySelector<HTMLElement>('[aria-invalid="true"], input, textarea, select')?.focus({ preventScroll: true })
  }, [])

  return { cardRef, markMoved, focusProblem }
}
