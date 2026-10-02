import { useCallback, useRef, useState, type FormEvent } from 'react'
import { AnimatePresence } from 'framer-motion'
import { AddIcon, ReplyIcon, Widget2Icon } from '@solar-icons/react/linear'
import { useDismiss } from '../hooks/useDismiss.ts'
import type { TaskId } from '../lib/tasks.ts'
import TaskMenu from './TaskMenu.tsx'
import './IntentBar.css'

type Props = {
  onSubmitIntent?: (text: string) => void
  onChooseTask?: (id: TaskId) => void
}

// The two equal ways in: describe what you need, or choose a task from the menu.
export default function IntentBar({ onSubmitIntent, onChooseTask }: Props) {
  const [text, setText] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const chipRef = useRef<HTMLButtonElement>(null)
  const close = useCallback(() => setMenuOpen(false), [])
  useDismiss(menuOpen, close, wrapRef)

  const canSend = text.trim().length > 0

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!canSend) return
    onSubmitIntent?.(text.trim())
    setText('')
  }

  const choose = (id: TaskId) => {
    setMenuOpen(false)
    chipRef.current?.focus()
    onChooseTask?.(id)
  }

  return (
    <div className="intent" ref={wrapRef}>
      <AnimatePresence>{menuOpen && <TaskMenu onSelect={choose} />}</AnimatePresence>

      <button
        ref={chipRef}
        type="button"
        className="intent__chip glass"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((value) => !value)}
      >
        <span className="intent__chip-icon" aria-hidden="true">
          <Widget2Icon size={18} />
        </span>
        Show me a menu of available workspaces
      </button>

      <form className="intent__bar glass" onSubmit={submit}>
        <button
          type="button"
          className="intent__plus"
          aria-label="Choose a task"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((value) => !value)}
        >
          <AddIcon size={22} aria-hidden="true" />
        </button>
        <input
          className="intent__input"
          type="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Write your message..."
          aria-label="Describe what you need"
          autoComplete="off"
        />
        <button type="submit" className="intent__send" aria-label="Send" disabled={!canSend}>
          <ReplyIcon size={22} aria-hidden="true" />
        </button>
      </form>
    </div>
  )
}
