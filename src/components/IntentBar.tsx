import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { AnimatePresence } from 'framer-motion'
import { CloseCircleIcon, FileTextIcon, GalleryIcon, DocumentIcon, LayersMinimalisticIcon, PaperclipIcon, ReplyIcon, TuningIcon } from '@solar-icons/react/linear'
import { useDismiss } from '../hooks/useDismiss.ts'
import type { Attachment, AttachmentKind } from '../compose/attachments.ts'
import type { Mode } from '../compose/spec.ts'
import { ACCEPT, checkRoom, readAttachment, sizeLabel, type PendingFile } from '../lib/attachFile.ts'
import type { Hint } from '../lib/composerHints.ts'
import type { TaskId } from '../lib/tasks.ts'
import { useWorkMode } from '../store/workMode.ts'
import type { FlightOrigin } from './FlyingMessage.tsx'
import AttachMenu from './AttachMenu.tsx'
import ModeMenu from './ModeMenu.tsx'
import TaskMenu from './TaskMenu.tsx'
import './IntentBar.css'

type Props = {
  // The mode is the founder's choice for this message only.
  // `attachments` are the files picked for this message (see attachFile.ts), sent with it and with nothing after.
  onSubmitIntent?: (text: string, mode: Mode, from?: FlightOrigin, attachments?: Attachment[]) => void
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
  // The workspaces menu (the five tasks), and the menu of kinds of file to attach. One menu is open at a time.
  const [menuOpen, setMenuOpen] = useState(false)
  const [attachOpen, setAttachOpen] = useState(false)
  // The workspaces menu opens from the side of the button that asked for it: the tip on the left, the button in the bar on the right.
  const [menuSide, setMenuSide] = useState<'left' | 'right'>('right')
  // Files picked and waiting to go with the next message, and what to say about one that could not be read.
  const [files, setFiles] = useState<PendingFile[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const pickerRef = useRef<HTMLInputElement>(null)
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
    setAttachOpen(false)
  }, [])
  useDismiss(menuOpen || modeOpen || attachOpen, close, wrapRef)

  // The bar moves into the side panel when a workspace appears, so keep the cursor in it.
  useEffect(() => {
    if (docked) inputRef.current?.focus()
  }, [docked])

  // A message can be only files: then it asks Droplet to read them.
  const canSend = (text.trim().length > 0 || files.length > 0) && !busy && !reading

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!canSend) return
    // Where the bar is, so the message can come out of its top. A bar with no size (a test, a hidden one) gives the message nothing to come out of.
    const box = formRef.current?.getBoundingClientRect()
    const from = box && box.width > 0 ? { left: box.left, top: box.top, width: box.width, height: box.height } : undefined
    const said = text.trim() || (files.length === 1 ? 'Please read the file I attached.' : 'Please read the files I attached.')
    if (files.length > 0) onSubmitIntent?.(said, mode, from, files.map((file) => file.attachment))
    else if (from) onSubmitIntent?.(said, mode, from)
    else onSubmitIntent?.(said, mode)
    setText('')
    setFiles([])
    setNotice(null)
  }

  const closeModes = () => {
    setModeOpen(false)
    inputRef.current?.focus()
  }

  // A kind of file was chosen in the menu: the picker opens for that kind only.
  const pick = (kind: AttachmentKind) => {
    setAttachOpen(false)
    const picker = pickerRef.current
    if (!picker) return
    picker.accept = ACCEPT[kind]
    picker.click()
  }

  // Files came back from the picker. Each is checked and read in turn; one that cannot be read says why, and the rest still join.
  const took = async (event: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (picked.length === 0) return
    setReading(true)
    setNotice(null)
    let waiting = files
    const problems: string[] = []
    try {
      for (const file of picked) {
        const result = await readAttachment(file)
        if (!result.ok) {
          problems.push(result.reason)
          continue
        }
        const room = checkRoom(waiting, result.file)
        if (room) {
          problems.push(room)
          break
        }
        waiting = [...waiting, result.file]
      }
    } finally {
      setFiles(waiting)
      setNotice(problems.length > 0 ? problems.join(' ') : null)
      setReading(false)
    }
  }

  const choose = (id: TaskId) => {
    setMenuOpen(false)
    chipRef.current?.focus()
    onChooseTask?.(id)
  }

  return (
    <div className={docked ? 'intent intent--docked' : 'intent'} ref={wrapRef}>
      <AnimatePresence>{menuOpen && <TaskMenu onSelect={choose} align={menuSide} />}</AnimatePresence>
      <AnimatePresence>{attachOpen && <AttachMenu onChoose={pick} />}</AnimatePresence>
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

      {(files.length > 0 || notice || reading) && (
        <div className="intent__files" role="group" aria-label="Files for your next message">
          {files.map((file) => (
            <span key={file.id} className="intent__file">
              {file.kind === 'image' ? <GalleryIcon size={16} aria-hidden="true" /> : file.kind === 'pdf' ? <DocumentIcon size={16} aria-hidden="true" /> : <FileTextIcon size={16} aria-hidden="true" />}
              <span className="intent__file-name">{file.name}</span>
              <span className="intent__file-size">{sizeLabel(file.bytes)}</span>
              <button type="button" className="intent__file-remove" aria-label={`Remove ${file.name}`} onClick={() => setFiles((current) => current.filter((other) => other.id !== file.id))}>
                <CloseCircleIcon size={14} aria-hidden="true" />
              </button>
            </span>
          ))}
          {reading && <span className="intent__file-status" role="status">Reading the file</span>}
          {notice && (
            <p className="intent__file-notice" role="alert">
              {notice}
            </p>
          )}
        </div>
      )}

      <form ref={formRef} className="intent__bar glass" onSubmit={submit}>
        <button
          type="button"
          className="intent__plus"
          aria-label="Attach a file"
          aria-haspopup="menu"
          aria-expanded={attachOpen}
          onClick={() => {
            setModeOpen(false)
            setMenuOpen(false)
            setAttachOpen((value) => !value)
          }}
        >
          <PaperclipIcon size={22} aria-hidden="true" />
        </button>
        <input ref={pickerRef} type="file" multiple className="visually-hidden" tabIndex={-1} aria-label="Choose files to attach" onChange={(event) => void took(event)} />
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
          aria-label="Choose a task"
          title="Workspaces"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => {
            setModeOpen(false)
            setAttachOpen(false)
            setMenuSide('right')
            setMenuOpen((value) => !value)
          }}
        >
          <LayersMinimalisticIcon size={20} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="intent__mode"
          aria-label={`Choose how Droplet works. ${workMode === 'guide' ? 'Guide' : 'Workspace'} mode is on.`}
          aria-haspopup="menu"
          aria-expanded={modeOpen}
          onClick={() => {
            setMenuOpen(false)
            setAttachOpen(false)
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
          onClick={() => {
            setMenuSide('left')
            setMenuOpen((value) => !value)
          }}
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
