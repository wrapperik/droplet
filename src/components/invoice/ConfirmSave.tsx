import { useCallback, useId, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckIcon, DisketteIcon } from '@solar-icons/react/linear'
import { useDismiss } from '../../hooks/useDismiss.ts'
import './ConfirmSave.css'

// One thing that confirming would remember.
export type ConfirmItem = {
  id: string
  label: string
  // What confirming does with it, in words: it is new, or it replaces what is remembered.
  detail: string
}

type Props = {
  projectName: string
  items: ConfirmItem[]
  // Something differs from what was last confirmed.
  unsaved: boolean
  status: string
  // Called with the ids of the items the founder left ticked. Not called at all unless the founder presses the confirm button.
  onConfirm: (ids: string[]) => void
  // A number that goes up each time something outside asks for the note to be opened (such as a button in the chat). It opens only
  // if there is something to save, and saves nothing by itself: the founder still confirms.
  openSignal?: number
  // Droplet keeps notes on the project and will update them when this is saved. Left out when the founder has switched the notes off.
  notesOn?: boolean
}

// Nothing is remembered without the founder's say. Pressing Save does not save: it opens a note of exactly what would be
// remembered, each item with a tick, and only the confirm button saves. Leaving the note, or pressing Escape or Cancel, saves nothing.
export default function ConfirmSave({ projectName, items, unsaved, status, onConfirm, openSignal = 0, notesOn = false }: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(open, close, wrapRef)

  // Opens when asked to from outside, once for each ask.
  const [seenSignal, setSeenSignal] = useState(openSignal)
  if (openSignal !== seenSignal) {
    setSeenSignal(openSignal)
    if (unsaved) setOpen(true)
  }

  const toggle = () => setOpen((value) => !value)

  return (
    <div className="confirm" ref={wrapRef}>
      <span className="workspace__status" role="status">
        {status}
      </span>
      <button
        type="button"
        className="workspace__button workspace__button--primary"
        disabled={!unsaved}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggle}
      >
        {unsaved ? <DisketteIcon size={18} aria-hidden="true" /> : <CheckIcon size={18} aria-hidden="true" />}
        <span className="workspace__label">{unsaved ? 'Save' : 'Saved'}</span>
      </button>

      <AnimatePresence>{open && <ConfirmNote projectName={projectName} items={items} notesOn={notesOn} onConfirm={onConfirm} onCancel={close} />}</AnimatePresence>
    </div>
  )
}

type NoteProps = {
  projectName: string
  items: ConfirmItem[]
  notesOn?: boolean
  // Called with the ids of the items the founder left ticked, only when the confirm button is pressed. The note closes either way.
  onConfirm: (ids: string[]) => void
  onCancel: () => void
  // Opens upwards, above what it belongs to, instead of beneath it.
  above?: boolean
  confirmLabel?: string
}

// The note itself: exactly what would be remembered, each with a tick, and the confirm button. Everything is ticked each time it opens.
export function ConfirmNote({ projectName, items, notesOn = false, onConfirm, onCancel, above = false, confirmLabel = 'Confirm and save' }: NoteProps) {
  // The ids the founder has unticked.
  const [unticked, setUnticked] = useState<string[]>([])
  const titleId = useId()
  const ticked = items.filter((item) => !unticked.includes(item.id)).map((item) => item.id)
  const offset = above ? 6 : -6
  return (
    <motion.div
      className={above ? 'confirm__note confirm__note--above glass glass--strong' : 'confirm__note glass glass--strong'}
      role="dialog"
      aria-labelledby={titleId}
      initial={{ opacity: 0, y: offset }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: offset }}
      transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <h2 className="confirm__title" id={titleId}>
        Save to {projectName}
      </h2>
      {items.length === 0 ? (
        <p className="confirm__empty">There is nothing new to remember.</p>
      ) : (
        <>
          <p className="confirm__lead">Droplet will remember what you tick. Nothing else is kept.</p>
          <ul className="confirm__list">
            {items.map((item) => (
              <li key={item.id}>
                <label className="confirm__item">
                  <input
                    type="checkbox"
                    checked={!unticked.includes(item.id)}
                    onChange={(event) => setUnticked((current) => (event.target.checked ? current.filter((id) => id !== item.id) : [...current, item.id]))}
                  />
                  <span>
                    <span className="confirm__label">{item.label}</span>
                    <span className="confirm__detail">{item.detail}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <p className="confirm__quiet">It stays on this device. You can forget any of it later.</p>
        </>
      )}
      {notesOn && <p className="confirm__quiet">Droplet will update its notes on this project.</p>}
      <div className="confirm__actions">
        <button type="button" className="confirm__cancel" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="workspace__button workspace__button--primary"
          onClick={() => {
            onConfirm(ticked)
            onCancel()
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </motion.div>
  )
}
