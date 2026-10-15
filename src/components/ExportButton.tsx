import { useEffect, useState } from 'react'
import { CheckIcon, DownloadMinimalisticIcon } from '@solar-icons/react/linear'

type Props = {
  // Makes and downloads the file. Returns whether it worked, so the button can say so.
  onExport: () => Promise<boolean>
  // What the button is called for a screen reader, and what it says when it has worked or not.
  ariaLabel?: string
  doneMessage?: string
  failedMessage?: string
  // When set, the file cannot be made yet. Pressing the button then says why and calls `onBlocked`, instead of exporting.
  blocked?: { reason: string; onBlocked: () => void }
  // The button as an icon alone, in the glass row of the brand's toolbar. Its words stay for a screen reader, and show as a tooltip.
  iconOnly?: boolean
}

type Phase = 'idle' | 'working' | 'done' | 'failed'

// How long a result stays on the button before it goes back to its normal label.
const RESULT_MS = 1800

// Takes work out of Droplet as a file (a PDF). Sits in the workspace's fixed header. It keeps one width whatever it says, so
// the header does not shift. A button that cannot export yet is not hidden or switched off: it stays pressable so it can say what
// is missing, and a screen reader is told the same.
export default function ExportButton({
  onExport,
  ariaLabel = 'Export brand sheet',
  doneMessage = 'Brand sheet downloaded.',
  failedMessage = 'Could not make the brand sheet.',
  blocked,
  iconOnly = false,
}: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [note, setNote] = useState('')

  useEffect(() => {
    if (phase !== 'done' && phase !== 'failed') return
    const timer = window.setTimeout(() => setPhase('idle'), RESULT_MS)
    return () => window.clearTimeout(timer)
  }, [phase])

  const start = async () => {
    if (phase === 'working') return
    if (blocked) {
      setNote(blocked.reason)
      blocked.onBlocked()
      return
    }
    setNote('')
    setPhase('working')
    setPhase((await onExport()) ? 'done' : 'failed')
  }

  return (
    <>
      <button
        type="button"
        className={iconOnly ? `btool__pill btool__pill--icon${blocked ? ' btool__pill--blocked' : ''}` : `workspace__button workspace__button--fixed${blocked ? ' workspace__button--blocked' : ''}`}
        onClick={start}
        aria-busy={phase === 'working'}
        aria-disabled={blocked ? true : undefined}
        aria-label={blocked ? `${ariaLabel}. ${blocked.reason}` : ariaLabel}
        title={blocked?.reason ?? (iconOnly ? 'Download the brand sheet' : undefined)}
      >
        {phase === 'done' ? <CheckIcon size={18} strokeWidth={2.25} aria-hidden="true" /> : <DownloadMinimalisticIcon size={18} aria-hidden="true" />}
        <span className={iconOnly ? 'visually-hidden' : 'workspace__label'}>
          {phase === 'working' ? 'Preparing' : phase === 'done' ? 'Exported' : phase === 'failed' ? 'Not exported' : 'Export'}
        </span>
      </button>
      <span className="visually-hidden" role="status">
        {phase === 'done' ? doneMessage : phase === 'failed' ? failedMessage : blocked ? note : ''}
      </span>
    </>
  )
}
