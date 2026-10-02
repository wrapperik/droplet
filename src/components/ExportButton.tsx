import { useEffect, useState } from 'react'
import { CheckIcon, DownloadMinimalisticIcon } from '@solar-icons/react/linear'

type Props = {
  // Makes and downloads the brand sheet. Returns whether it worked, so the button can say so.
  onExport: () => Promise<boolean>
}

type Phase = 'idle' | 'working' | 'done' | 'failed'

// How long a result stays on the button before it goes back to its normal label.
const RESULT_MS = 1800

// Takes the palette out of Droplet as a one-page brand sheet (PDF). Sits in the workspace's fixed header.
// It keeps one width whatever it says, so the header does not shift.
export default function ExportButton({ onExport }: Props) {
  const [phase, setPhase] = useState<Phase>('idle')

  useEffect(() => {
    if (phase !== 'done' && phase !== 'failed') return
    const timer = window.setTimeout(() => setPhase('idle'), RESULT_MS)
    return () => window.clearTimeout(timer)
  }, [phase])

  const start = async () => {
    if (phase === 'working') return
    setPhase('working')
    setPhase((await onExport()) ? 'done' : 'failed')
  }

  return (
    <>
      <button
        type="button"
        className="palette-workspace__button palette-workspace__button--fixed"
        onClick={start}
        aria-busy={phase === 'working'}
        aria-label="Export brand sheet"
      >
        {phase === 'done' ? <CheckIcon size={18} strokeWidth={2.25} aria-hidden="true" /> : <DownloadMinimalisticIcon size={18} aria-hidden="true" />}
        {phase === 'working' ? 'Preparing' : phase === 'done' ? 'Exported' : phase === 'failed' ? 'Not exported' : 'Export'}
      </button>
      <span className="visually-hidden" role="status">
        {phase === 'done' ? 'Brand sheet downloaded.' : phase === 'failed' ? 'Could not make the brand sheet.' : ''}
      </span>
    </>
  )
}
