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
  // Something differs from what was last confirmed (the invoice, or how the workspace is arranged).
  unsaved: boolean
  status: string
  // Called with the ids of the items the founder left ticked. Not called at all unless the founder presses the confirm button.
  onConfirm: (ids: string[]) => void
}

// Nothing is remembered without the founder's say. Pressing Save does not save: it opens a note of exactly what would be
// remembered, each item with a tick, and only the confirm button saves. Leaving the note, or pressing Escape or Cancel, saves nothing.
// How the workspace is arranged is not a memory, so it is kept along with whatever is confirmed, and the note says so.
export default function ConfirmSave({ projectName, items, unsaved, status, onConfirm }: Props) {
  const [open, setOpen] = useState(false)
  // The ids the founder has unticked. Everything is ticked when the note opens.
  const [unticked, setUnticked] = useState<string[]>([])
  const wrapRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const close = useCallback(() => setOpen(false), [])
  useDismiss(open, close, wrapRef)

  const ticked = items.filter((item) => !unticked.includes(item.id)).map((item) => item.id)

  const toggle = () => {
    if (!open) setUnticked([])
    setOpen((value) => !value)
  }

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

      <AnimatePresence>
        {open && (
          <motion.div
            className="confirm__note glass glass--strong"
            role="dialog"
            aria-labelledby={titleId}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <h2 className="confirm__title" id={titleId}>
              Save to {projectName}
            </h2>
            {items.length === 0 ? (
              <p className="confirm__empty">There is nothing new to remember. Saving keeps how the workspace is arranged.</p>
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
            <div className="confirm__actions">
              <button type="button" className="confirm__cancel" onClick={close}>
                Cancel
              </button>
              <button
                type="button"
                className="workspace__button workspace__button--primary"
                onClick={() => {
                  onConfirm(ticked)
                  close()
                }}
              >
                Confirm and save
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
