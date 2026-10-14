import { useEffect, useRef, type KeyboardEvent } from 'react'
import { motion } from 'framer-motion'
import { SignpostIcon, WidgetIcon } from '@solar-icons/react/linear'
import type { WorkMode } from '../lib/workMode.ts'
import './ModeMenu.css'

type Props = {
  workMode: WorkMode
  onWorkMode: (mode: WorkMode) => void
}

const MODES: { id: WorkMode; label: string; hint: string; Icon: typeof SignpostIcon }[] = [
  { id: 'guide', label: 'Guide', hint: 'One step at a time', Icon: SignpostIcon },
  { id: 'workspace', label: 'Workspace', hint: 'Every tool at once', Icon: WidgetIcon },
]

// How Droplet works: Guide or Workspace, which stays until it is changed. There was an Advanced switch below them (a stronger model that searches the web,
// for the next message only); it is taken out of the menu because search needs a Gemini key with billing, which a free key does not have. The server
// still understands `mode: 'advanced'`, so the switch can come back.
export default function ModeMenu({ workMode, onWorkMode }: Props) {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current?.querySelector<HTMLButtonElement>('[role="menuitemradio"][aria-checked="true"]')?.focus()
  }, [])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const items = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])
    const index = items.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'ArrowDown' ? index + 1 : index - 1
    items[(next + items.length) % items.length]?.focus()
  }

  return (
    <motion.div
      ref={listRef}
      className="mode-menu glass glass--strong"
      role="menu"
      aria-label="How Droplet works"
      onKeyDown={onKeyDown}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <div role="group" aria-label="Mode">
        {MODES.map(({ id, label, hint, Icon }) => (
          <button key={id} type="button" role="menuitemradio" aria-checked={workMode === id} className="mode-menu__item" onClick={() => onWorkMode(id)}>
            <Icon size={18} aria-hidden="true" />
            <span className="mode-menu__text">
              <span className="mode-menu__label">{label}</span>
              <span className="mode-menu__hint">{hint}</span>
            </span>
          </button>
        ))}
      </div>
    </motion.div>
  )
}
