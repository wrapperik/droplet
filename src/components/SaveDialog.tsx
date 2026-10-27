import { useEffect, useId, useRef, type KeyboardEvent } from 'react'
import { motion } from 'framer-motion'
import { DisketteIcon } from '@solar-icons/react/linear'
import './SaveDialog.css'

export type SaveDialogAction = {
  id: string
  label: string
  // A way to save: drawn as a primary button, across the whole width.
  primary?: boolean
  // Loses work: drawn in the warning colour.
  warn?: boolean
}

type Props = {
  title: string
  text: string
  // How the last step went, such as "Saved the board." or why a save failed. Shown above the buttons.
  note?: string
  actions: SaveDialogAction[]
  onAction: (id: string) => void
  // Escape and a press on the backdrop: the safe way out, which leaves everything as it is.
  onDismiss: () => void
  // A save is on its way, so nothing else can be pressed.
  busy?: boolean
}

// Droplet asking whether to save before work is lost, in the middle of the screen so it is not missed. Nothing is saved or lost until a
// button is pressed, and Escape keeps working.
export default function SaveDialog({ title, text, note, actions, onAction, onDismiss, busy = false }: Props) {
  const titleId = useId()
  const textId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  // The dialog itself takes the focus, so Escape and Tab work at once, without a ring drawn on a button the founder has not reached yet.
  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  // Escape keeps working, and Tab stays inside the dialog.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      if (!busy) onDismiss()
      return
    }
    if (event.key !== 'Tab') return
    const buttons = Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
    if (buttons.length === 0) return
    const first = buttons[0]
    const last = buttons[buttons.length - 1]
    // From the dialog itself, Tab goes to the first button and Shift and Tab to the last.
    if (document.activeElement === panelRef.current) {
      event.preventDefault()
      ;(event.shiftKey ? last : first).focus()
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <motion.div
      className="save-dialog__backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !busy) onDismiss()
      }}
    >
      <motion.div
        ref={panelRef}
        className="save-dialog glass glass--strong"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={textId}
        aria-busy={busy}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      >
        <span className="save-dialog__icon" aria-hidden="true">
          <DisketteIcon size={22} />
        </span>
        <h2 className="save-dialog__title" id={titleId}>
          {title}
        </h2>
        <p className="save-dialog__text" id={textId}>
          {text}
        </p>
        {note && (
          <p className="save-dialog__note" role="status">
            {note}
          </p>
        )}
        <div className="save-dialog__actions">
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              className={action.primary ? 'save-dialog__button save-dialog__button--primary' : action.warn ? 'save-dialog__button save-dialog__button--warn' : 'save-dialog__button'}
              disabled={busy}
              onClick={() => onAction(action.id)}
            >
              {action.label}
            </button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}
