import { useEffect, useId, useRef } from 'react'
import './LeaveDialog.css'

type Props = {
  // What would be left, in a few words, such as "INV-0007".
  what: string
  onLeave: () => void
  onStay: () => void
}

// Shown when a founder is about to leave an invoice that has changes nobody confirmed. Leaving saves nothing, so it asks first.
// The safe choice is the one in focus, and Escape stays.
export default function LeaveDialog({ what, onLeave, onStay }: Props) {
  const titleId = useId()
  const stayRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    stayRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onStay()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onStay])

  return (
    <div className="leave__backdrop">
      <div className="leave glass glass--strong" role="alertdialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 className="leave__title" id={titleId}>
          Leave {what}?
        </h2>
        <p className="leave__text">It has changes you have not saved. If you leave, they are lost.</p>
        <div className="leave__actions">
          <button type="button" className="leave__leave" onClick={onLeave}>
            Leave without saving
          </button>
          <button type="button" className="workspace__button workspace__button--primary" ref={stayRef} onClick={onStay}>
            Stay
          </button>
        </div>
      </div>
    </div>
  )
}
