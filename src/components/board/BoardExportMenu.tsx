import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { CheckIcon, DownloadMinimalisticIcon } from '@solar-icons/react/linear'
import { useDismiss } from '../../hooks/useDismiss.ts'
import type { BoardFormat } from '../../lib/boardExport.ts'
import './BoardExportMenu.css'

type Props = {
  // Makes and downloads the file. Returns whether it worked, so the button can say so.
  onExport: (format: BoardFormat) => Promise<boolean>
  // Why a file cannot be made yet, or null when it can.
  blockedReason: () => string | null
}

type Phase = 'idle' | 'working' | 'done' | 'failed'
const RESULT_MS = 1800

const CHOICES: { format: BoardFormat; label: string; detail: string }[] = [
  { format: 'pdf', label: 'PDF', detail: 'The board on one landscape page, to print or share.' },
  { format: 'png', label: 'PNG', detail: 'A picture of the board, cut to what is on it.' },
]

// Takes the board out of Droplet as a file. One button in the workspace's header with a menu of what it can make. A choice that cannot be made
// yet is not hidden or switched off: it can be pressed, and says what is missing, so the founder is never left guessing why.
export default function BoardExportMenu({ onExport, blockedReason }: Props) {
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [note, setNote] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const close = useCallback(() => setOpen(false), [])
  useDismiss(open, close, wrapRef)

  useEffect(() => {
    if (phase !== 'done' && phase !== 'failed') return
    const timer = window.setTimeout(() => setPhase('idle'), RESULT_MS)
    return () => window.clearTimeout(timer)
  }, [phase])

  const choose = async (format: BoardFormat) => {
    if (phase === 'working') return
    const reason = blockedReason()
    if (reason) {
      setNote(reason)
      return
    }
    setNote('')
    setOpen(false)
    setPhase('working')
    setPhase((await onExport(format)) ? 'done' : 'failed')
  }

  return (
    <div className="board-export" ref={wrapRef}>
      <button
        type="button"
        className="workspace__button workspace__button--fixed"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-busy={phase === 'working'}
        aria-label="Export the board"
        onClick={() => {
          setNote('')
          setOpen((value) => !value)
        }}
      >
        {phase === 'done' ? <CheckIcon size={18} strokeWidth={2.25} aria-hidden="true" /> : <DownloadMinimalisticIcon size={18} aria-hidden="true" />}
        <span className="workspace__label">{phase === 'working' ? 'Preparing' : phase === 'done' ? 'Exported' : phase === 'failed' ? 'Not exported' : 'Export'}</span>
      </button>

      {open && (
        <div className="board-export__menu glass glass--strong" id={menuId} role="menu" aria-label="Export the board as">
          {CHOICES.map((choice) => {
            const blocked = blockedReason()
            return (
              <button key={choice.format} type="button" role="menuitem" className="board-export__item" aria-disabled={blocked ? true : undefined} aria-label={`${choice.label}. ${blocked ?? choice.detail}`} onClick={() => choose(choice.format)}>
                <span className="board-export__label">{choice.label}</span>
                <span className="board-export__detail">{choice.detail}</span>
              </button>
            )
          })}
          {note && <p className="board-export__note">{note}</p>}
        </div>
      )}

      <span className="visually-hidden" role="status">
        {phase === 'done' ? 'The board was downloaded.' : phase === 'failed' ? 'Could not make the file.' : note}
      </span>
    </div>
  )
}
