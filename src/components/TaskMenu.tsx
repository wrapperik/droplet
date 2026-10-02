import { useEffect, useRef, type KeyboardEvent } from 'react'
import { motion } from 'framer-motion'
import { tasks, type TaskId } from '../lib/tasks.ts'
import './TaskMenu.css'

type Props = {
  onSelect: (id: TaskId) => void
}

// The familiar path: a conventional menu of the five tasks. Opens upward from the intent bar.
export default function TaskMenu({ onSelect }: Props) {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
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
      className="task-menu glass glass--strong"
      role="menu"
      aria-label="Workspaces"
      onKeyDown={onKeyDown}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {tasks.map(({ id, label, hint, icon: TaskIcon }) => (
        <button key={id} type="button" role="menuitem" className="task-menu__item" onClick={() => onSelect(id)}>
          <TaskIcon size={22} aria-hidden="true" />
          <span className="task-menu__text">
            <span className="task-menu__label">{label}</span>
            <span className="task-menu__hint">{hint}</span>
          </span>
        </button>
      ))}
    </motion.div>
  )
}
