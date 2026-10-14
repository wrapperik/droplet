import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { AnimatePresence } from 'framer-motion'
import { AddIcon, CloseCircleIcon, ReplyIcon, TuningIcon } from '@solar-icons/react/linear'
import { useDismiss } from '../hooks/useDismiss.ts'
import type { Mode } from '../compose/spec.ts'
import type { Hint } from '../lib/composerHints.ts'
import type { TaskId } from '../lib/tasks.ts'
import { useWorkMode } from '../store/workMode.ts'
import type { FlightOrigin } from './FlyingMessage.tsx'
import ModeMenu from './ModeMenu.tsx'
import TaskMenu from './TaskMenu.tsx'
import './IntentBar.css'

type Props = {
  // The mode is the founder's choice for this message only.
  onSubmitIntent?: (text: string, mode: Mode, from?: FlightOrigin) => void
  onChooseTask?: (id: TaskId) => void
  // Sits in the side panel beside a thread instead of centred beneath the workspace.
  docked?: boolean
  // A request is being worked on. The field stays editable, but another cannot be sent yet.
  busy?: boolean
  // The tip above the bar, which offers the menu of workspaces. It is for the very start, before anything has been said.
  showTip?: boolean
  // The bar reading the room (see composerHints.ts): what the empty field says, what is selected, and a few chips of things worth asking for or doing
  // next. A chip only sends the request it names, when it is pressed.
  hints?: {
    placeholder?: string
    selection?: { label: string; onClear: () => void } | null
    chips?: Hint[]
    onChip?: (hint: Hint) => void
    // A nudge can be put away; it stays away for that workspace.
    onDismiss?: (hint: Hint) => void
  }
}

// The two equal ways in: describe what you need, or choose a task from the menu.
export default function IntentBar({ onSubmitIntent, onChooseTask, docked = false, busy = false, showTip = true, hints }: Props) {
  const [text, setText] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [modeOpen, setModeOpen] = useState(false)
  // Every message is answered by Quick. The Advanced switch is out of the menu (see ModeMenu), though the send still takes a mode.
  const mode: Mode = 'base'
  // Guide or Workspace: how a task opens. It stays until the founder changes it.
  const workMode = useWorkMode((state) => state.mode)
  const setWorkMode = useWorkMode((state) => state.setMode)
  const wrapRef = useRef<HTMLDivElement>(null)
  const chipRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const close = useCallback(() => {
    setMenuOpen(false)
    setModeOpen(false)
  }, [])
  useDismiss(menuOpen || modeOpen, close, wrapRef)

  // The bar moves into the side panel when a workspace appears, so keep the cursor in it.
  useEffect(() => {
    if (docked) inputRef.current?.focus()
  }, [docked])

  const canSend = text.trim().length > 0 && !busy

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!canSend) return
    // Where the bar is, so the message can come out of its top. A bar with no size (a test, a hidden one) gives the message nothing to come out of.
    const box = formRef.current?.getBoundingClientRect()
    const from = box && box.width > 0 ? { left: box.left, top: box.top, width: box.width, height: box.height } : undefined
    if (from) onSubmitIntent?.(text.trim(), mode, from)
    else onSubmitIntent?.(text.trim(), mode)
    setText('')
  }

  const closeModes = () => {
    setModeOpen(false)
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
      <AnimatePresence>{modeOpen && (
          <ModeMenu
            workMode={workMode}
            onWorkMode={(next) => {
              setWorkMode(next)
              closeModes()
            }}
          />
        )}</AnimatePresence>

      {(hints?.selection || (hints?.chips && hints.chips.length > 0)) && (
        <div className="intent__hints" role="group" aria-label="Suggestions">
          {hints.selection && (
            <span className="intent__selection">
              {hints.selection.label}
              <button type="button" aria-label="Clear the selection" onClick={hints.selection.onClear}>
                <CloseCircleIcon size={16} aria-hidden="true" />
              </button>
            </span>
          )}
          {hints.chips?.map((hint) => (
            <span key={hint.id} className="intent__hint" data-kind={hint.kind}>
              <button type="button" className="intent__hint-send" disabled={busy} onClick={() => hints.onChip?.(hint)}>
                {hint.label}
              </button>
              {hint.kind === 'nudge' && (
                <button type="button" className="intent__hint-dismiss" aria-label={`Put away: ${hint.label}`} onClick={() => hints.onDismiss?.(hint)}>
                  <CloseCircleIcon size={14} aria-hidden="true" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      <form ref={formRef} className="intent__bar glass" onSubmit={submit}>
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
        <input
          ref={inputRef}
          className="intent__input"
          type="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={hints?.placeholder ?? 'Write your message...'}
          aria-label="Describe what you need"
          autoComplete="off"
        />
        <button
          type="button"
          className="intent__mode"
          aria-label={`Choose how Droplet works. ${workMode === 'guide' ? 'Guide' : 'Workspace'} mode is on.`}
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
    </div>
  )
}
