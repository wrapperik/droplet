import { useCallback, useId, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckIcon, Widget2Icon } from '@solar-icons/react/linear'
import { useDismiss } from '../hooks/useDismiss.ts'
import { COMPONENTS } from '../lib/workspaceState.ts'
import './ComponentsMenu.css'

type Props = {
  hidden: string[]
  onShow: (id: string) => void
  onHide: (id: string) => void
}

// Which components are on screen. A person can take any toolbar or panel away and bring it back, and so can the AI,
// through the same two actions. The palette canvas is the work itself, so it is always shown.
export default function ComponentsMenu({ hidden, onShow, onHide }: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const close = useCallback(() => setOpen(false), [])
  useDismiss(open, close, wrapRef)

  return (
    <div className="components" ref={wrapRef}>
      <button
        type="button"
        className="palette-workspace__button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        <Widget2Icon size={18} aria-hidden="true" />
        <span className="palette-workspace__label">Components</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            id={menuId}
            className="components__menu glass glass--strong"
            role="menu"
            aria-label="Components on screen"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
          >
            {COMPONENTS.map((component) => {
              const shown = !hidden.includes(component.id)
              return (
                <button
                  key={component.id}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={shown}
                  disabled={!component.hideable}
                  className="components__item"
                  onClick={() => (shown ? onHide(component.id) : onShow(component.id))}
                >
                  <span className="components__check" aria-hidden="true">
                    {shown && <CheckIcon size={14} strokeWidth={2.5} />}
                  </span>
                  {component.label}
                  {!component.hideable && <span className="components__note">Always shown</span>}
                </button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
