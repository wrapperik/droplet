import { useCallback, useId, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AddCircleIcon, CheckIcon, Widget2Icon } from '@solar-icons/react/linear'
import { useDismiss } from '../hooks/useDismiss.ts'
import type { ComponentDef, ComponentKind } from '../lib/arrangement.ts'
import './ComponentsMenu.css'

type Props = {
  // Every component of the workspace.
  components: ComponentDef[]
  // Which components the menu lists: the windows on the grid, or the tools in the toolbar.
  kind: ComponentKind
  hidden: string[]
  onShow: (id: string) => void
  onHide: (id: string) => void
}

const MENUS: Record<ComponentKind, { label: string; menuLabel: string }> = {
  panel: { label: 'Windows', menuLabel: 'Windows on screen' },
  toolbar: { label: 'Add or remove a tool', menuLabel: 'Tools in the toolbar' },
}

// Which components are on screen. A person can take any tool or window away and bring it back, and so can the AI,
// through the same two actions. The palette canvas is the work itself, so it is always shown.
export default function ComponentsMenu({ components, kind, hidden, onShow, onHide }: Props) {
  const { label, menuLabel } = MENUS[kind]
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const close = useCallback(() => setOpen(false), [])
  useDismiss(open, close, wrapRef)

  return (
    <div className="components" ref={wrapRef}>
      <button
        type="button"
        className={kind === 'toolbar' ? 'toolbar__button' : 'workspace__button'}
        aria-label={kind === 'toolbar' ? label : undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        {kind === 'toolbar' ? <AddCircleIcon size={20} aria-hidden="true" /> : <Widget2Icon size={18} aria-hidden="true" />}
        {kind === 'panel' && <span className="workspace__label">{label}</span>}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            id={menuId}
            className={`components__menu glass glass--strong${kind === 'toolbar' ? ' components__menu--end' : ''}`}
            role="menu"
            aria-label={menuLabel}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
          >
            {components.filter((component) => component.kind === kind).map((component) => {
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
