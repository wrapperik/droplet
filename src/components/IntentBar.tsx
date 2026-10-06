import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { AnimatePresence } from 'framer-motion'
import { AddIcon, CloseCircleIcon, ReplyIcon, TuningIcon } from '@solar-icons/react/linear'
import { useDismiss } from '../hooks/useDismiss.ts'
import { describeAllowance } from '../lib/advancedAllowance.ts'
import type { Allowance, Mode } from '../compose/spec.ts'
import type { TaskId } from '../lib/tasks.ts'
import ModeMenu from './ModeMenu.tsx'
import TaskMenu from './TaskMenu.tsx'
import './IntentBar.css'

type Props = {
  // The mode is the founder's choice for this message only.
  onSubmitIntent?: (text: string, mode: Mode) => void
  onChooseTask?: (id: TaskId) => void
  // Sits in the side panel beside a thread instead of centred beneath the workspace.
  docked?: boolean
  // A request is being worked on. The field stays editable, but another cannot be sent yet.
  busy?: boolean
  // The tip above the bar, which offers the menu of workspaces. It is for the very start, before anything has been said.
  showTip?: boolean
  // Where the founder's Advanced allowance stands, as the server last said. Null when it is not known yet: Advanced then stays usable without a count.
  allowance?: Allowance | null
}

// The two equal ways in: describe what you need, or choose a task from the menu.
export default function IntentBar({ onSubmitIntent, onChooseTask, docked = false, busy = false, showTip = true, allowance = null }: Props) {
  const [text, setText] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [modeOpen, setModeOpen] = useState(false)
  // Quick unless the founder picks Advanced, and only for the next message. The app never switches it on.
  const [mode, setMode] = useState<Mode>('base')
  const wrapRef = useRef<HTMLDivElement>(null)
  const chipRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const close = useCallback(() => {
    setMenuOpen(false)
    setModeOpen(false)
  }, [])
  useDismiss(menuOpen || modeOpen, close, wrapRef)

  // Advanced that has been used up since it was chosen (on another device, say) is switched off, so the pill never promises what is not there.
  const exhausted = describeAllowance(allowance).exhausted
  const [wasExhausted, setWasExhausted] = useState(exhausted)
  if (exhausted !== wasExhausted) {
    setWasExhausted(exhausted)
    if (exhausted) setMode('base')
  }

  // The bar moves into the side panel when a workspace appears, so keep the cursor in it.
  useEffect(() => {
    if (docked) inputRef.current?.focus()
  }, [docked])

  const canSend = text.trim().length > 0 && !busy

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!canSend) return
    onSubmitIntent?.(text.trim(), mode)
    setText('')
    setMode('base')
  }

  const chooseMode = (next: Mode) => {
    setModeOpen(false)
    setMode(next)
    inputRef.current?.focus()
  }

  const choose = (id: TaskId) => {
    setMenuOpen(false)
    chipRef.current?.focus()
    onChooseTask?.(id)
  }

  return (
    <div className={docked ? 'intent intent--docked' : 'intent'} ref={wrapRef}>
      <AnimatePresence>{menuOpen && <TaskMenu onSelect={choose} />}</AnimatePresence>
      <AnimatePresence>{modeOpen && <ModeMenu mode={mode} allowance={allowance} onSelect={chooseMode} />}</AnimatePresence>

      {showTip && (
        <button
          ref={chipRef}
          type="button"
          className="intent__chip glass"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((value) => !value)}
        >
          <span className="intent__chip-icon" aria-hidden="true">
            <ReplyIcon size={18} />
          </span>
          Show me a menu of available workspaces
        </button>
      )}

      <form className="intent__bar glass" onSubmit={submit}>
        <button
          type="button"
          className="intent__plus"
          aria-label="Choose a task"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => {
            setModeOpen(false)
            setMenuOpen((value) => !value)
          }}
        >
          <AddIcon size={22} aria-hidden="true" />
        </button>
        {mode === 'advanced' && (
          <button type="button" className="intent__pill" onClick={() => setMode('base')} aria-label="Advanced is on for your next message. Turn it off">
            Advanced
            <CloseCircleIcon size={16} aria-hidden="true" />
          </button>
        )}
        <input
          ref={inputRef}
          className="intent__input"
          type="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Write your message..."
          aria-label="Describe what you need"
          autoComplete="off"
        />
        <button
          type="button"
          className="intent__mode"
          aria-label="Choose how I answer"
          aria-haspopup="menu"
          aria-expanded={modeOpen}
          onClick={() => {
            setMenuOpen(false)
            setModeOpen((value) => !value)
          }}
        >
          <TuningIcon size={20} aria-hidden="true" />
        </button>
        <button type="submit" className="intent__send" aria-label="Send" disabled={!canSend}>
          <ReplyIcon size={22} aria-hidden="true" />
        </button>
      </form>
    </div>
  )
}
